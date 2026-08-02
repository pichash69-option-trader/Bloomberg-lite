# -*- coding: utf-8 -*-
"""
snapshot_job.py — daily derived-metric snapshots (PCR / max-pain / premium trend).

Dhan doesn't provide PCR/max-pain history, so we record it ourselves. In production
this runs once after market close and appends one row per underlying. For the mock
demo it synthesises a plausible history from the existing daily candles so a trend
is visible immediately.

Run (inside the backend container):  python -m app.snapshot_job
"""
import asyncio
import random
import sys

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.chain import strike_step
from app.db import Base, SessionLocal, engine
from app.models import Candle, MetricSnapshot

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


async def ensure_table() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def gen_mock_snapshots(days: int = 60) -> int:
    async with SessionLocal() as session:
        rows = (await session.execute(
            text("SELECT symbol, ts, close FROM candles "
                 "WHERE interval='1d' AND segment='NSE_EQ' ORDER BY symbol, ts"))).all()

    # group closes per symbol (chronological)
    per: dict[str, list[tuple[str, float]]] = {}
    for sym, ts, close in rows:
        per.setdefault(sym, []).append((ts.strftime("%Y-%m-%d"), float(close)))

    records: list[dict] = []
    for sym, series in per.items():
        rng = random.Random(hash(sym) & 0xFFFFFFFF)
        pcr = rng.uniform(0.8, 1.2)
        for date, close in series[-days:]:
            pcr = min(1.8, max(0.4, pcr + rng.gauss(0, 0.05)))   # slow PCR walk
            step = strike_step(close)
            records.append(dict(
                symbol=sym, date=date,
                pcr=round(pcr, 2),
                max_pain=round(round(close / step) * step, 2),
                futures_premium=round(close * rng.uniform(-0.001, 0.004), 2),
                spot_close=round(close, 2),
            ))

    async with SessionLocal() as session:
        for rec in records:
            stmt = pg_insert(MetricSnapshot).values(**rec).on_conflict_do_update(
                index_elements=["symbol", "date"],
                set_={k: rec[k] for k in
                      ("pcr", "max_pain", "futures_premium", "spot_close")})
            await session.execute(stmt)
        await session.commit()
    return len(records)


async def main():
    await ensure_table()
    n = await gen_mock_snapshots()
    print(f"✅ Stored {n} mock metric snapshots (PCR/max-pain trend).")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
