# -*- coding: utf-8 -*-
"""
history.py — backfill REAL daily OHLC candles from DhanHQ into candles (Timescale).

For every underlying's spot (equity or index) it calls DhanHQ historical_daily_data
and upserts into the `candles` hypertable (interval '1d'). Idempotent + throttled.

Run (inside the backend container, creds required):
    python -m app.history
"""
import asyncio
import sys
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.dhan_config import get_dhan, has_creds
from app.db import Base, SessionLocal, engine
from app.models import Candle, Instrument

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

START_DATE = "2024-01-01"
THROTTLE_SEC = 0.5


async def ensure_candles_table() -> None:
    from sqlalchemy import text
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text(
            "SELECT create_hypertable('candles', 'ts', if_not_exists => TRUE)"))


async def load_spots() -> list[Instrument]:
    async with SessionLocal() as session:
        rows = await session.execute(
            select(Instrument).where(Instrument.kind == "spot").order_by(Instrument.symbol))
        return list(rows.scalars())


def _fetch(dhan, inst: Instrument, to_date: str) -> list[dict]:
    r = dhan.historical_daily_data(
        security_id=str(inst.security_id),
        exchange_segment=inst.segment,          # NSE_EQ / IDX_I
        instrument_type=inst.instrument_type,    # EQUITY / INDEX
        from_date=START_DATE, to_date=to_date)
    if r.get("status") != "success":
        return []
    d = r.get("data") or {}
    ts = d.get("timestamp") or []
    out = []
    for i in range(len(ts)):
        out.append(dict(
            symbol=inst.symbol, segment=inst.segment, interval="1d",
            ts=datetime.fromtimestamp(int(ts[i]), tz=timezone.utc),
            open=float(d["open"][i]), high=float(d["high"][i]),
            low=float(d["low"][i]), close=float(d["close"][i]),
            volume=int(d["volume"][i]) if d.get("volume") else None, oi=None,
        ))
    return out


async def upsert(rows: list[dict]) -> int:
    if not rows:
        return 0
    async with SessionLocal() as session:
        for rec in rows:
            stmt = pg_insert(Candle).values(**rec).on_conflict_do_update(
                index_elements=["symbol", "segment", "interval", "ts"],
                set_={k: rec[k] for k in ("open", "high", "low", "close", "volume", "oi")})
            await session.execute(stmt)
        await session.commit()
    return len(rows)


async def main():
    if not has_creds():
        print("❌ DHAN creds not set. Fill .env, then: docker compose up -d backend")
        return
    await ensure_candles_table()
    dhan = get_dhan()
    spots = await load_spots()
    today = date.today().isoformat()
    print(f"Backfilling REAL daily history for {len(spots)} spots, {START_DATE} → {today}\n")

    grand = 0
    for i, inst in enumerate(spots, 1):
        try:
            rows = await asyncio.to_thread(_fetch, dhan, inst, today)
            n = await upsert(rows)
            grand += n
            print(f"  [{i:2}/{len(spots)}] {inst.symbol:12} {n:4} candles")
        except Exception as e:
            print(f"  [{i:2}/{len(spots)}] {inst.symbol:12} ERROR {e!r}"[:90])
        await asyncio.sleep(THROTTLE_SEC)

    print(f"\n✅ Done. {grand:,} REAL candles stored.")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
