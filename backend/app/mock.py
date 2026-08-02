# -*- coding: utf-8 -*-
"""
mock.py — synthetic data so the whole app can be built & seen WITHOUT DhanHQ creds.

Off-market / no-token development (see CLAUDE.md gotchas). Generates realistic-ish
daily OHLC candles (geometric random walk) for every spot in `instruments` and stores
them in the `candles` hypertable, exactly like the real backfill would. When real
creds arrive, the real backfill upserts over these.

Run (inside the backend container):
    python -m app.mock                 # ~2 years of daily candles for all 51 spots
"""
import asyncio
import random
import sys
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db import Base, SessionLocal, engine
from app.models import Candle, Instrument

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

DEFAULT_DAYS = 500          # ~2 years of trading days
MU = 0.0004                 # slight upward daily drift
SIGMA = 0.015               # ~1.5% daily vol


def _base_price(symbol: str) -> float:
    """Stable pseudo-random starting price per symbol (₹80–4000)."""
    h = abs(hash(symbol)) % 3920
    return 80.0 + h


def gen_daily(inst: Instrument, days: int) -> list[dict]:
    """Geometric random walk → OHLC candles on business days ending today."""
    rng = random.Random(hash(inst.symbol) & 0xFFFFFFFF)   # reproducible per symbol
    # collect the last `days` business days (Mon–Fri), oldest first
    sessions: list[date] = []
    d = date.today()
    while len(sessions) < days:
        if d.weekday() < 5:
            sessions.append(d)
        d -= timedelta(days=1)
    sessions.reverse()

    rows: list[dict] = []
    close = _base_price(inst.symbol)
    is_index = inst.instrument_type == "INDEX"
    for day in sessions:
        prev_close = close
        ret = rng.gauss(MU, SIGMA)
        close = max(1.0, prev_close * (1 + ret))
        open_ = prev_close * (1 + rng.gauss(0, SIGMA / 3))
        hi = max(open_, close) * (1 + abs(rng.gauss(0, SIGMA / 2)))
        lo = min(open_, close) * (1 - abs(rng.gauss(0, SIGMA / 2)))
        vol = None if is_index else int(rng.uniform(2e5, 8e6))
        rows.append(dict(
            symbol=inst.symbol, segment=inst.segment, interval="1d",
            ts=datetime(day.year, day.month, day.day, tzinfo=timezone.utc),
            open=round(open_, 2), high=round(hi, 2),
            low=round(lo, 2), close=round(close, 2),
            volume=vol, oi=None,
        ))
    return rows


async def ensure_table() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        from sqlalchemy import text
        await conn.execute(text(
            "SELECT create_hypertable('candles', 'ts', if_not_exists => TRUE)"))


async def load_spots() -> list[Instrument]:
    async with SessionLocal() as session:
        rows = await session.execute(
            select(Instrument).where(Instrument.kind == "spot").order_by(Instrument.symbol))
        return list(rows.scalars())


async def upsert(rows: list[dict]) -> int:
    async with SessionLocal() as session:
        for rec in rows:
            stmt = pg_insert(Candle).values(**rec).on_conflict_do_update(
                index_elements=["symbol", "segment", "interval", "ts"],
                set_={k: rec[k] for k in ("open", "high", "low", "close", "volume", "oi")},
            )
            await session.execute(stmt)
        await session.commit()
    return len(rows)


async def main(days: int = DEFAULT_DAYS):
    await ensure_table()
    spots = await load_spots()
    if not spots:
        print("No spots in `instruments`. Run `python -m app.instruments` first.")
        return
    print(f"Generating {days} mock daily candles for {len(spots)} spots …\n")
    grand = 0
    for i, inst in enumerate(spots, 1):
        n = await upsert(gen_daily(inst, days))
        grand += n
        print(f"  [{i:2}/{len(spots)}] {inst.symbol:12} {n} candles")
    print(f"\n✅ MOCK done. {grand:,} candles stored. (Synthetic — not real market data.)")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
