# -*- coding: utf-8 -*-
"""
mock_feed.py — synthetic LIVE-MATH feed (Cash + Futures + Options) without DhanHQ.

For a subscribed symbol a background task walks the raw market state every ~1.5s and
computes the full live-math payload — cash buy/sell pressure, futures premium + OI
buildup, options PCR / max-pain / greeks / CE-PE buildup — then publishes it to Redis
(`live:{symbol}`) for WebSocket fanout. When real creds arrive, feed.py fills the same
payload from DhanHQ (WS Full + Option-Chain REST) behind this exact contract.
"""
import asyncio
import json
import random
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.chain import synth_chain
from app.db import SessionLocal
from app.live_math import classify_buildup
from app.models import Candle
from app.redis_store import get_redis

TICK_SEC = 1.5
STEP_SIGMA = 0.0009


async def _last_close(symbol: str) -> float:
    async with SessionLocal() as session:
        row = await session.execute(
            select(Candle.close).where(Candle.symbol == symbol, Candle.interval == "1d")
            .order_by(Candle.ts.desc()).limit(1))
        val = row.scalar_one_or_none()
    return float(val) if val is not None else 1000.0


def _atm_greeks(chain: dict):
    for s in chain["strikes"]:
        if s["strike"] == chain["atm"]:
            return s["ce"]["iv"], s["ce"]["delta"], s["pe"]["delta"]
    return 0.0, 0.0, 0.0


def _depth(mid: float, spread: float, tick: float, rng: random.Random, n: int = 5):
    """Synthetic n-level market depth ladder."""
    out = []
    for i in range(n):
        out.append({
            "bid_price": round(mid - spread / 2 - i * tick, 2),
            "bid_qty": rng.randint(50, 6000),
            "bid_orders": rng.randint(1, 40),
            "ask_price": round(mid + spread / 2 + i * tick, 2),
            "ask_qty": rng.randint(50, 6000),
            "ask_orders": rng.randint(1, 40),
        })
    return out


class MockFeed:
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
        rng = random.Random(hash(symbol) & 0xFFFFFFFF)
        prev_close = await _last_close(symbol)
        spot = prev_close
        day_open = prev_close
        hi = lo = prev_close
        volume = 0
        fut_oi = rng.uniform(5e6, 2.5e7)
        oi_day_high = oi_day_low = fut_oi
        premium = spot * rng.uniform(-0.001, 0.004)
        prev_ce_oi = prev_pe_oi = None
        opt_expiries = [(date.today() + timedelta(days=d)).strftime("%d %b")
                        for d in (7, 14, 28)]

        try:
            while True:
                prev_spot = spot
                spot = max(1.0, spot * (1 + rng.gauss(0, STEP_SIGMA)))
                hi, lo = max(hi, spot), min(lo, spot)
                d_price = spot - prev_spot

                # --- Cash market (buy/sell pressure) ---
                tick_vol = rng.randint(2000, 60000)
                volume += tick_vol
                bias = 0.5 + (0.25 if d_price > 0 else -0.25) + rng.uniform(-0.1, 0.1)
                bias = min(0.9, max(0.1, bias))
                buy_qty = int(tick_vol * 8 * bias)
                sell_qty = int(tick_vol * 8 * (1 - bias))
                spread = round(max(0.05, spot * 0.0002), 2)

                # --- Futures (long/short) ---
                prev_fut_oi = fut_oi
                fut_oi = max(1e5, fut_oi * (1 + rng.gauss(0, 0.004)))
                oi_day_high, oi_day_low = max(oi_day_high, fut_oi), min(oi_day_low, fut_oi)
                premium += rng.gauss(0, spot * 0.0003)
                fut_ltp = spot + premium
                fut_buildup = classify_buildup(d_price, fut_oi - prev_fut_oi)
                tick_px = round(max(0.05, spot * 0.0005), 2)

                # --- Options (CE/PE) ---
                chain = synth_chain(symbol, spot)
                ce_oi = chain["total_ce_oi"]
                pe_oi = chain["total_pe_oi"]
                ce_chg = 0 if prev_ce_oi is None else ce_oi - prev_ce_oi
                pe_chg = 0 if prev_pe_oi is None else pe_oi - prev_pe_oi
                prev_ce_oi, prev_pe_oi = ce_oi, pe_oi
                atm_iv, atm_ce_d, atm_pe_d = _atm_greeks(chain)

                payload = {
                    "symbol": symbol,
                    "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "mock": True,
                    "cash": {
                        "ltp": round(spot, 2),
                        "last_qty": rng.randint(1, 800),
                        "atp": round((hi + lo + spot) / 3, 2),
                        "prev_close": round(prev_close, 2),
                        "chg": round(spot - prev_close, 2),
                        "chg_pct": round((spot - prev_close) / prev_close * 100, 2),
                        "open": round(day_open, 2),
                        "high": round(hi, 2),
                        "low": round(lo, 2),
                        "volume": volume,
                        "buy_qty": buy_qty,
                        "sell_qty": sell_qty,
                        "buy_pct": round(buy_qty / (buy_qty + sell_qty) * 100, 1),
                        "bid": round(spot - spread / 2, 2),
                        "ask": round(spot + spread / 2, 2),
                        "spread": spread,
                        "upper_circuit": round(prev_close * 1.1, 2),
                        "lower_circuit": round(prev_close * 0.9, 2),
                        "depth": _depth(spot, spread, tick_px, rng),
                    },
                    "futures": {
                        "ltp": round(fut_ltp, 2),
                        "atp": round(fut_ltp * (1 + rng.uniform(-0.001, 0.001)), 2),
                        "oi": int(fut_oi),
                        "oi_day_high": int(oi_day_high),
                        "oi_day_low": int(oi_day_low),
                        "chg_oi": int(fut_oi - prev_fut_oi),
                        "premium": round(premium, 2),
                        "premium_pct": round(premium / spot * 100, 2),
                        "basis": round(premium, 2),
                        "buildup": fut_buildup,
                        "depth": _depth(fut_ltp, spread, tick_px, rng),
                        "expiries": [
                            {"label": lbl, "ltp": round(fut_ltp + spot * off, 2),
                             "oi": int(fut_oi * w), "premium": round(premium + spot * off, 2)}
                            for lbl, off, w in [("Near", 0.0, 1.0),
                                                ("Next", 0.002, 0.4),
                                                ("Far", 0.004, 0.15)]
                        ],
                    },
                    "options": {
                        "pcr": chain["pcr"],
                        "max_pain": chain["max_pain"],
                        "atm": chain["atm"],
                        "expiries": opt_expiries,
                        "total_ce_oi": int(ce_oi),
                        "total_pe_oi": int(pe_oi),
                        "ce_chg_oi": int(ce_chg),
                        "pe_chg_oi": int(pe_chg),
                        "atm_iv": atm_iv,
                        "atm_ce_delta": atm_ce_d,
                        "atm_pe_delta": atm_pe_d,
                        "iv_skew": chain["iv_skew"],
                        "net_delta": chain["net_delta"],
                        "net_gamma": chain["net_gamma"],
                        "ce_buildup": classify_buildup(d_price, ce_chg),
                        "pe_buildup": classify_buildup(d_price, pe_chg),
                        "strikes": chain["strikes"],
                    },
                }
                data = json.dumps(payload)
                await redis.hset(f"live:{symbol}", mapping={"data": data})
                await redis.publish(f"live:{symbol}", data)
                await asyncio.sleep(TICK_SEC)
        except asyncio.CancelledError:
            pass


feed = MockFeed()
