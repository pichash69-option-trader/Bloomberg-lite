# -*- coding: utf-8 -*-
"""
live_math.py — pure-math helpers for the live engine.

Used by the live feed each tick to classify OI buildup from the price change and
the open-interest change, and to derive option-chain metrics. Educational — no advice.
"""


def classify_buildup(d_price: float, d_oi: float, eps: float = 1e-9) -> str:
    """Price + OI change → buildup type.
      up   + OI up   = Long Buildup      (new longs)
      down + OI up   = Short Buildup     (new shorts)
      up   + OI down = Short Covering    (shorts exiting)
      down + OI down = Long Unwinding    (longs exiting)
    """
    if abs(d_oi) < eps or abs(d_price) < eps:
        return "Neutral"
    if d_price > 0 and d_oi > 0:
        return "Long Buildup"
    if d_price < 0 and d_oi > 0:
        return "Short Buildup"
    if d_price > 0 and d_oi < 0:
        return "Short Covering"
    return "Long Unwinding"


def chain_metrics(strikes: list[dict], atm: float) -> dict:
    """Derived option-chain metrics (PCR, max-pain, IV skew, net greeks, OI walls,
    IV rank) from a list of {strike, ce, pe} rows."""
    tot_ce = sum(s["ce"]["oi"] for s in strikes) or 1
    tot_pe = sum(s["pe"]["oi"] for s in strikes)

    def payout(at: float) -> float:
        return sum(s["ce"]["oi"] * max(at - s["strike"], 0)
                   + s["pe"]["oi"] * max(s["strike"] - at, 0) for s in strikes)

    below = [s["pe"]["iv"] for s in strikes if s["strike"] < atm]
    above = [s["ce"]["iv"] for s in strikes if s["strike"] > atm]
    atm_iv = next((s["ce"]["iv"] for s in strikes if s["strike"] == atm), 0.0)
    return {
        "pcr": round(tot_pe / tot_ce, 2),
        "max_pain": min((s["strike"] for s in strikes), key=payout) if strikes else 0,
        "total_ce_oi": int(tot_ce),
        "total_pe_oi": int(tot_pe),
        "iv_skew": round((sum(below) / len(below) if below else 0)
                         - (sum(above) / len(above) if above else 0), 2),
        "net_delta": round(sum(s["ce"]["oi"] * s["ce"]["delta"]
                               + s["pe"]["oi"] * s["pe"]["delta"] for s in strikes)),
        "net_gamma": round(sum((s["ce"]["oi"] + s["pe"]["oi"]) * s["ce"]["gamma"]
                               for s in strikes)),
        "ce_wall": max(strikes, key=lambda s: s["ce"]["oi"])["strike"] if strikes else 0,
        "pe_wall": max(strikes, key=lambda s: s["pe"]["oi"])["strike"] if strikes else 0,
        "iv_rank": round(min(100.0, max(0.0, (atm_iv - 12) / (45 - 12) * 100)), 0),
        "atm_iv": atm_iv,
    }
