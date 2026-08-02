# -*- coding: utf-8 -*-
"""
live_math.py — pure-math helpers for the live engine.

Used by the (mock or real) feed each tick to classify OI buildup from the price
change and the open-interest change. Educational — no advice.
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
