# -*- coding: utf-8 -*-
"""
feed_ws.py — global DhanHQ WebSocket (Full) manager for sub-second ticks.

One WebSocket connection runs in a background thread; every tick updates a
thread-safe `state[security_id]`. Symbols are subscribed/unsubscribed on demand
(reference-counted). RealFeed reads this state for cash/futures instead of the 3s
REST quote, giving tick-by-tick updates during market hours. Off-market (no ticks)
callers fall back to REST.
"""
import threading
import time

from app.config import get_settings

# dhanhq MarketFeed segment / mode codes
NSE = 1
NSE_FNO = 2
FULL = 21


class WSManager:
    def __init__(self) -> None:
        self._feed = None
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._state: dict[int, dict] = {}
        self._subs: dict[tuple, int] = {}   # (seg, sid) -> refcount
        self._started = False

    def _start(self, initial: list[tuple]) -> None:
        from dhanhq import DhanContext, MarketFeed

        s = get_settings()
        ctx = DhanContext(s.dhan_client_id, s.dhan_access_token)
        self._feed = MarketFeed(ctx, initial, version="v2")
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        self._started = True

    def _loop(self) -> None:
        try:
            self._feed.run_forever()
        except Exception as e:
            print(f"[ws] run_forever: {e!r}")
            return
        while True:
            try:
                tick = self._feed.get_data()
                # Only the "Full Data" packet carries the complete snapshot; other
                # packet types (OI / depth / prev-close) would overwrite with gaps.
                if tick and tick.get("type") == "Full Data" and "security_id" in tick:
                    with self._lock:
                        self._state[int(tick["security_id"])] = tick
            except Exception:
                time.sleep(0.3)

    def subscribe(self, pairs: list[tuple]) -> None:
        """pairs = [(segment, security_id_str, FULL), …]"""
        new = []
        for seg, sid, mode in pairs:
            key = (seg, str(sid))
            self._subs[key] = self._subs.get(key, 0) + 1
            if self._subs[key] == 1:
                new.append((seg, str(sid), mode))
        if not new:
            return
        if not self._started:
            self._start(new)
        else:
            try:
                self._feed.subscribe_symbols(new)
            except Exception as e:
                print(f"[ws] subscribe: {e!r}")

    def unsubscribe(self, pairs: list[tuple]) -> None:
        drop = []
        for seg, sid, mode in pairs:
            key = (seg, str(sid))
            self._subs[key] = max(0, self._subs.get(key, 0) - 1)
            if self._subs[key] == 0:
                drop.append((seg, str(sid), mode))
                self._state.pop(int(sid), None)
        if drop and self._started:
            try:
                self._feed.unsubscribe_symbols(drop)
            except Exception as e:
                print(f"[ws] unsubscribe: {e!r}")

    def get(self, security_id) -> dict | None:
        with self._lock:
            return self._state.get(int(security_id))


ws = WSManager()
