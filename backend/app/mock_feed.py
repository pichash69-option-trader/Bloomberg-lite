# -*- coding: utf-8 -*-
"""
mock_feed.py — synthetic LIVE feed so the real-time layer works without DhanHQ.

For a subscribed symbol, a background task random-walks an intraday LTP every second,
writes the live state to Redis (`live:{symbol}` hash) and publishes it to the pub/sub
channel `live:{symbol}` for WebSocket fanout. Reference-counted: the task starts on the
first subscriber and stops when the last one leaves. When real creds arrive, feed.py
(DhanHQ MarketFeed) replaces this behind the same Redis contract.
"""
import asyncio
import json
import random
from datetime import datetime, timezone

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Candle
from app.redis_store import get_redis

STEP_SIGMA = 0.0008     # ~0.08% per-second wiggle
TICK_SEC = 1.0


async def _last_close(symbol: str) -> float:
    """Seed the live price from the latest daily candle (fallback 1000)."""
    async with SessionLocal() as session:
        row = await session.execute(
            select(Candle.close)
            .where(Candle.symbol == symbol, Candle.interval == "1d")
            .order_by(Candle.ts.desc()).limit(1))
        val = row.scalar_one_or_none()
    return float(val) if val is not None else 1000.0


class MockFeed:
    """Manages one background price-walk task per subscribed symbol."""

    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task] = {}
        self._subs: dict[str, int] = {}

    async def subscribe(self, symbol: str) -> None:
        self._subs[symbol] = self._subs.get(symbol, 0) + 1
        if symbol not in self._tasks:
            self._tasks[symbol] = asyncio.create_task(self._run(symbol))

    async def unsubscribe(self, symbol: str) -> None:
        self._subs[symbol] = max(0, self._subs.get(symbol, 0) - 1)
        if self._subs[symbol] == 0 and symbol in self._tasks:
            self._tasks.pop(symbol).cancel()

    async def _run(self, symbol: str) -> None:
        redis = get_redis()
        prev_close = await _last_close(symbol)
        ltp = prev_close
        try:
            while True:
                ltp = max(1.0, ltp * (1 + random.gauss(0, STEP_SIGMA)))
                chg = ltp - prev_close
                state = {
                    "symbol": symbol,
                    "ltp": round(ltp, 2),
                    "prev_close": round(prev_close, 2),
                    "chg": round(chg, 2),
                    "chg_pct": round(chg / prev_close * 100, 2),
                    "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "mock": True,
                }
                payload = json.dumps(state)
                await redis.hset(f"live:{symbol}", mapping={"data": payload})
                await redis.publish(f"live:{symbol}", payload)
                await asyncio.sleep(TICK_SEC)
        except asyncio.CancelledError:
            pass


# Module-level singleton (single uvicorn worker).
feed = MockFeed()
