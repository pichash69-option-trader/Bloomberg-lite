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
from app.live_math import chain_metrics
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
    price = max(0.05, bs_price(spot, K, T, RISK_FREE, iv, opt))
    g = greeks(spot, K, T, RISK_FREE, iv, opt)   # incl. rho
    chg_oi = int(oi * rng.uniform(-0.15, 0.20))
    spread = max(0.05, price * 0.01)
    return {
        "ltp": round(price, 2),
        "prev_close": round(price * (1 + rng.uniform(-0.06, 0.06)), 2),
        "oi": int(oi),
        "prev_oi": max(0, int(oi) - chg_oi),
        "chg_oi": chg_oi,
        "volume": int(oi * rng.uniform(0.2, 0.9)),
        "iv": round(iv * 100, 2),          # show IV in %
        "bid": round(price - spread / 2, 2),
        "ask": round(price + spread / 2, 2),
        **g,
    }


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

    premium = round(spot * rng.uniform(-0.001, 0.004), 2)   # mock futures premium
    return {
        "symbol": symbol, "spot": round(spot, 2), "atm": atm,
        "expiry_days": EXPIRY_DAYS, "futures_premium": premium,
        "strikes": strikes, "mock": True,
        **chain_metrics(strikes, atm),
    }
