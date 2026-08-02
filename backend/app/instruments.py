# -*- coding: utf-8 -*-
"""
instruments.py — build the symbol → DhanHQ SecurityId map from the scrip master.

DhanHQ publishes a public CSV (no auth) listing every tradable instrument. For each
of our 51 underlyings (NIFTY 50 index + 50 stocks) we resolve:
  • spot   — the equity row (NSE_EQ) or the index row (IDX_I)
  • future — the near-month stock/index future (NSE_FNO), earliest expiry >= today
…and upsert them into the `instruments` table.

Run (inside the backend container):  python -m app.instruments
"""
import asyncio
import csv
import io
import re
import sys
from datetime import date, datetime

import httpx
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import NIFTY_INDEX, UNIVERSE
from app.db import Base, SessionLocal, engine
from app.models import Instrument

# Windows console safety (harmless in Docker).
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SCRIP_URL = "https://images.dhan.co/api-data/api-scrip-master.csv"

# Our display name → the symbol used in the scrip master.
SCRIP_ALIAS = {NIFTY_INDEX: "NIFTY"}   # "NIFTY 50" is listed as "NIFTY"

# Segment (API enum) per spot kind.
SPOT_SEGMENT = {"EQUITY": "NSE_EQ", "INDEX": "IDX_I"}

# Futures trading symbol looks like  RELIANCE-Aug2026-FUT  /  BAJAJ-AUTO-Aug2026-FUT.
# The underlying may itself contain hyphens, so strip the fixed -MonYYYY-FUT suffix.
FUT_RE = re.compile(r"^(.*)-[A-Za-z]{3}\d{4}-FUT$")


# --------------------------------------------------------------------------- #
# Download + parse
# --------------------------------------------------------------------------- #
async def download_scrip_master() -> str:
    async with httpx.AsyncClient(timeout=90) as client:
        r = await client.get(SCRIP_URL)
        r.raise_for_status()
        return r.text


def _parse_expiry(s: str) -> datetime | None:
    s = (s or "").strip()
    if not s or s.startswith("0001"):
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        try:
            return datetime.strptime(s[:10], "%Y-%m-%d")
        except ValueError:
            return None


def _lot(s: str) -> int | None:
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return None


def build_lookups(text: str):
    """From the CSV, build NSE lookups: equity/index by symbol, futures grouped
    by underlying with their expiries."""
    equity: dict[str, dict] = {}
    index: dict[str, dict] = {}
    futures: dict[str, list[tuple[datetime, dict]]] = {}

    for row in csv.DictReader(io.StringIO(text)):
        if row.get("SEM_EXM_EXCH_ID") != "NSE":
            continue
        inst = row.get("SEM_INSTRUMENT_NAME", "")
        tsym = row.get("SEM_TRADING_SYMBOL", "")
        if inst == "EQUITY":
            equity[tsym] = row
        elif inst == "INDEX":
            index[tsym] = row
        elif inst in ("FUTSTK", "FUTIDX"):
            m = FUT_RE.match(tsym)
            if m:
                exp = _parse_expiry(row.get("SEM_EXPIRY_DATE", ""))
                if exp:
                    futures.setdefault(m.group(1), []).append((exp, row))
    return equity, index, futures


def near_month(fut_list: list[tuple[datetime, dict]], today: date):
    """Earliest future whose expiry is today or later."""
    upcoming = [(e, r) for e, r in fut_list if e.date() >= today]
    return min(upcoming, key=lambda x: x[0]) if upcoming else None


# --------------------------------------------------------------------------- #
# Resolve our 51 underlyings → Instrument records
# --------------------------------------------------------------------------- #
def resolve_instruments(text: str) -> tuple[list[dict], list[str]]:
    equity, index, futures = build_lookups(text)
    today = date.today()
    records: list[dict] = []
    missing: list[str] = []

    for display in UNIVERSE:
        scrip = SCRIP_ALIAS.get(display, display)
        is_index = display == NIFTY_INDEX

        # --- spot leg (equity or index) ---
        spot_row = (index if is_index else equity).get(scrip)
        if not spot_row:
            missing.append(f"{display} (spot)")
        else:
            itype = spot_row["SEM_INSTRUMENT_NAME"]
            records.append(dict(
                security_id=int(spot_row["SEM_SMST_SECURITY_ID"]),
                segment=SPOT_SEGMENT[itype],
                symbol=display,
                kind="spot",
                instrument_type=itype,
                trading_symbol=spot_row["SEM_TRADING_SYMBOL"],
                expiry=None,
                lot_size=_lot(spot_row.get("SEM_LOT_UNITS")),
            ))

        # --- near-month future leg ---
        nf = near_month(futures.get(scrip, []), today)
        if not nf:
            missing.append(f"{display} (future)")
        else:
            exp, frow = nf
            records.append(dict(
                security_id=int(frow["SEM_SMST_SECURITY_ID"]),
                segment="NSE_FNO",
                symbol=display,
                kind="future",
                instrument_type=frow["SEM_INSTRUMENT_NAME"],
                trading_symbol=frow["SEM_TRADING_SYMBOL"],
                expiry=exp,
                lot_size=_lot(frow.get("SEM_LOT_UNITS")),
            ))

    return records, missing


# --------------------------------------------------------------------------- #
# Persist
# --------------------------------------------------------------------------- #
async def upsert_instruments(records: list[dict]) -> int:
    async with SessionLocal() as session:
        for rec in records:
            stmt = pg_insert(Instrument).values(**rec)
            stmt = stmt.on_conflict_do_update(
                index_elements=["security_id", "segment"],
                set_={k: rec[k] for k in
                      ("symbol", "kind", "instrument_type",
                       "trading_symbol", "expiry", "lot_size")},
            )
            await session.execute(stmt)
        await session.commit()
    return len(records)


async def prune_stale(valid_symbols: set[str]) -> int:
    """Remove rows for symbols no longer in our universe (e.g. after an index
    reconstitution) so no orphan instruments linger."""
    async with SessionLocal() as session:
        res = await session.execute(
            delete(Instrument).where(Instrument.symbol.notin_(valid_symbols)))
        await session.commit()
        return res.rowcount or 0


async def main():
    # Ensure tables exist.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    print("Downloading scrip master…")
    text = await download_scrip_master()
    print(f"  got {len(text):,} bytes")

    records, missing = resolve_instruments(text)
    n = await upsert_instruments(records)
    pruned = await prune_stale(set(UNIVERSE))

    print(f"\nStored {n} instrument rows "
          f"({sum(r['kind'] == 'spot' for r in records)} spot + "
          f"{sum(r['kind'] == 'future' for r in records)} future).")
    if pruned:
        print(f"Pruned {pruned} stale row(s) (symbols no longer in universe).")
    if missing:
        print(f"⚠️  Missing ({len(missing)}): {', '.join(missing)}")
    else:
        print("✅ All 51 underlyings resolved (spot + future).")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
