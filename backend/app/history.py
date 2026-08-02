# -*- coding: utf-8 -*-
"""
history.py — backfill daily OHLC(+OI) candles from DhanHQ into Postgres/Timescale.

For every underlying's spot (equity or index) we call DhanHQ's historical endpoint
  POST https://api.dhan.co/v2/charts/historical
and store the candles in the `candles` hypertable (interval '1d'). Re-runnable and
idempotent (upsert on the primary key), so it fills gaps without duplicates.

Run (inside the backend container, after creds are set in .env):
    python -m app.history                 # backfill all spots (default ~2 years)
"""
import asyncio
import sys
from datetime import date, datetime, timedelta, timezone

import httpx
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import get_settings
from app.db import Base, SessionLocal, engine
from app.models import Candle, Instrument

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

settings = get_settings()

DHAN_BASE = "https://api.dhan.co/v2"
CHUNK_DAYS = 90          # be safe re: per-request range limits
DEFAULT_LOOKBACK = 730   # ~2 years of daily history
THROTTLE_SEC = 0.4       # polite gap between requests


def _headers() -> dict:
    return {
        "access-token": settings.dhan_access_token,
        "client-id": settings.dhan_client_id,
        "Content-Type": "application/json",
    }


async def ensure_candles_table() -> None:
    """Create the candles table and turn it into a Timescale hypertable."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text(
            "SELECT create_hypertable('candles', 'ts', if_not_exists => TRUE)"))


async def load_spots() -> list[Instrument]:
    async with SessionLocal() as session:
        rows = await session.execute(
            select(Instrument).where(Instrument.kind == "spot")
            .order_by(Instrument.symbol))
        return list(rows.scalars())


async def fetch_daily(client: httpx.AsyncClient, inst: Instrument,
                      from_d: str, to_d: str) -> list[dict]:
    """One historical call → list of candle dicts (may be empty)."""
    body = {
        "securityId": str(inst.security_id),
        "exchangeSegment": inst.segment,        # NSE_EQ / IDX_I
        "instrument": inst.instrument_type,     # EQUITY / INDEX
        "fromDate": from_d,
        "toDate": to_d,
        "oi": True,
    }
    r = await client.post(f"{DHAN_BASE}/charts/historical",
                          json=body, headers=_headers())
    r.raise_for_status()
    data = r.json() or {}

    # Response = parallel arrays: open/high/low/close/volume/timestamp/open_interest
    ts = data.get("timestamp", []) or []
    out = []
    for i in range(len(ts)):
        out.append(dict(
            symbol=inst.symbol,
            segment=inst.segment,
            interval="1d",
            ts=datetime.fromtimestamp(int(ts[i]), tz=timezone.utc),
            open=float(data["open"][i]),
            high=float(data["high"][i]),
            low=float(data["low"][i]),
            close=float(data["close"][i]),
            volume=int(data["volume"][i]) if data.get("volume") else None,
            oi=int(data["open_interest"][i]) if data.get("open_interest") else None,
        ))
    return out


async def upsert_candles(rows: list[dict]) -> int:
    if not rows:
        return 0
    async with SessionLocal() as session:
        for rec in rows:
            stmt = pg_insert(Candle).values(**rec).on_conflict_do_update(
                index_elements=["symbol", "segment", "interval", "ts"],
                set_={k: rec[k] for k in ("open", "high", "low", "close", "volume", "oi")},
            )
            await session.execute(stmt)
        await session.commit()
    return len(rows)


async def backfill_symbol(client: httpx.AsyncClient, inst: Instrument,
                          start: date, end: date) -> int:
    """Chunk the date range (<= CHUNK_DAYS each) and store all candles."""
    total = 0
    cur = start
    while cur < end:
        chunk_end = min(cur + timedelta(days=CHUNK_DAYS), end)
        try:
            candles = await fetch_daily(
                client, inst, cur.isoformat(), chunk_end.isoformat())
            total += await upsert_candles(candles)
        except httpx.HTTPStatusError as e:
            print(f"    ! {inst.symbol} {cur}..{chunk_end}: HTTP {e.response.status_code}")
        await asyncio.sleep(THROTTLE_SEC)
        cur = chunk_end
    return total


async def main(lookback_days: int = DEFAULT_LOOKBACK):
    if not settings.dhan_access_token or "your_" in settings.dhan_access_token:
        print("❌ DHAN creds not set. Fill DHAN_CLIENT_ID + DHAN_ACCESS_TOKEN in .env,")
        print("   then recreate the backend: docker compose up -d backend")
        return

    await ensure_candles_table()
    spots = await load_spots()
    end = date.today() + timedelta(days=1)      # toDate is non-inclusive
    start = date.today() - timedelta(days=lookback_days)
    print(f"Backfilling {len(spots)} spots, {start} → {date.today()} …\n")

    grand = 0
    async with httpx.AsyncClient(timeout=60) as client:
        for i, inst in enumerate(spots, 1):
            n = await backfill_symbol(client, inst, start, end)
            grand += n
            print(f"  [{i:2}/{len(spots)}] {inst.symbol:12} {n:5} candles")

    print(f"\n✅ Done. {grand:,} candles stored across {len(spots)} underlyings.")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
