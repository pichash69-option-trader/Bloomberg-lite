# -*- coding: utf-8 -*-
"""
chain.py — option chain + PCR + max-pain for the selected underlying.

MOCK mode (default, no creds): build a synthetic chain around the spot — strikes
around ATM, a volatility smile, ATM-peaked open interest — and price every option
with Black-Scholes (greeks.py). PCR and max-pain are computed from the OI, exactly
as they will be from the real DhanHQ Option-Chain API later.
"""
import json
import math
import random

from sqlalchemy import select

from app.db import SessionLocal
from app.greeks import bs_price, greeks
from app.models import Candle
from app.redis_store import get_redis

RISK_FREE = 0.065          # ~India risk-free
EXPIRY_DAYS = 7            # mock weekly expiry
N_STRIKES = 8              # strikes each side of ATM (→ 17 rows)


def strike_step(spot: float) -> float:
    if spot < 100:
        return 2.5
    if spot < 300:
        return 5.0
    if spot < 1000:
        return 10.0
    if spot < 2500:
        return 20.0
    if spot < 5000:
        return 50.0
    return 100.0


async def _spot(symbol: str) -> float:
    """Prefer the live LTP (Redis); fall back to the latest daily close."""
    raw = await get_redis().hget(f"live:{symbol}", "data")
    if raw:
        try:
            return float(json.loads(raw)["ltp"])
        except (KeyError, ValueError, TypeError):
            pass
    async with SessionLocal() as session:
        row = await session.execute(
            select(Candle.close).where(Candle.symbol == symbol, Candle.interval == "1d")
            .order_by(Candle.ts.desc()).limit(1))
        val = row.scalar_one_or_none()
    return float(val) if val is not None else 1000.0


def _leg(spot, K, T, iv, opt, oi, rng):
    price = bs_price(spot, K, T, RISK_FREE, iv, opt)
    g = greeks(spot, K, T, RISK_FREE, iv, opt)
    return {
        "ltp": round(max(0.05, price), 2),
        "oi": int(oi),
        "volume": int(oi * rng.uniform(0.2, 0.9)),
        "iv": round(iv * 100, 2),          # show IV in %
        **g,
    }


async def build_chain(symbol: str) -> dict:
    """Async wrapper: resolve live/last spot, then build the chain."""
    return synth_chain(symbol, await _spot(symbol))


def synth_chain(symbol: str, spot: float) -> dict:
    """Synthetic option chain around `spot` (sync, reusable every tick)."""
    step = strike_step(spot)
    atm = round(spot / step) * step
    T = EXPIRY_DAYS / 365.0
    rng = random.Random((hash(symbol) ^ int(spot)) & 0xFFFFFFFF)

    strikes = []
    for i in range(-N_STRIKES, N_STRIKES + 1):
        K = round(atm + i * step, 2)
        if K <= 0:
            continue
        m = (K - atm) / atm                      # moneyness
        iv = min(0.60, 0.20 + 2.5 * m * m)       # simple smile
        weight = math.exp(-(i * i) / 8.0)        # OI peaks at ATM
        # puts build below spot, calls above (typical)
        ce_oi = max(0, weight * rng.uniform(3e5, 9e5) * (1.15 if K >= atm else 0.85))
        pe_oi = max(0, weight * rng.uniform(3e5, 9e5) * (1.15 if K <= atm else 0.85))
        strikes.append({
            "strike": K,
            "ce": _leg(spot, K, T, iv, "CE", ce_oi, rng),
            "pe": _leg(spot, K, T, iv, "PE", pe_oi, rng),
        })

    tot_ce_oi = sum(s["ce"]["oi"] for s in strikes) or 1
    tot_pe_oi = sum(s["pe"]["oi"] for s in strikes)
    pcr = round(tot_pe_oi / tot_ce_oi, 2)

    # Max pain = strike minimising total payout to option holders (writer loss).
    def payout(at: float) -> float:
        return sum(s["ce"]["oi"] * max(at - s["strike"], 0)
                   + s["pe"]["oi"] * max(s["strike"] - at, 0) for s in strikes)

    max_pain = min((s["strike"] for s in strikes), key=payout)

    # Mock futures premium (fut slightly rich vs spot).
    fut = spot * (1 + rng.uniform(-0.001, 0.004))
    premium = round(fut - spot, 2)

    return {
        "symbol": symbol,
        "spot": round(spot, 2),
        "atm": atm,
        "expiry_days": EXPIRY_DAYS,
        "pcr": pcr,
        "max_pain": max_pain,
        "futures_premium": premium,
        "total_ce_oi": int(tot_ce_oi),
        "total_pe_oi": int(tot_pe_oi),
        "strikes": strikes,
        "mock": True,
    }
