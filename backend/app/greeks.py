# -*- coding: utf-8 -*-
"""
greeks.py — Black-Scholes option pricing + Greeks (pure math, educational).

European options, continuous risk-free rate, no dividends. Conventions:
  • theta returned per calendar day (annual / 365)
  • vega and rho returned per 1% change in vol / rate (annual / 100)
These match how broker/option-chain UIs usually display them.
"""
import math

SQRT2 = math.sqrt(2.0)


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / SQRT2))


def _norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)


def _d1_d2(S: float, K: float, T: float, r: float, sigma: float):
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return None, None
    vol_t = sigma * math.sqrt(T)
    d1 = (math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / vol_t
    d2 = d1 - vol_t
    return d1, d2


def bs_price(S: float, K: float, T: float, r: float, sigma: float, opt: str) -> float:
    """Black-Scholes fair value of a European CE/PE."""
    d1, d2 = _d1_d2(S, K, T, r, sigma)
    if d1 is None:                      # expired / degenerate → intrinsic
        return max(0.0, (S - K) if opt == "CE" else (K - S))
    disc = math.exp(-r * T)
    if opt == "CE":
        return S * _norm_cdf(d1) - K * disc * _norm_cdf(d2)
    return K * disc * _norm_cdf(-d2) - S * _norm_cdf(-d1)


def greeks(S: float, K: float, T: float, r: float, sigma: float, opt: str) -> dict:
    """Δ, Γ, Θ (per day), Vega (per 1%), Rho (per 1%)."""
    d1, d2 = _d1_d2(S, K, T, r, sigma)
    if d1 is None:
        return {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0}
    disc = math.exp(-r * T)
    pdf = _norm_pdf(d1)
    sqrt_t = math.sqrt(T)

    if opt == "CE":
        delta = _norm_cdf(d1)
        theta = (-(S * pdf * sigma) / (2 * sqrt_t)
                 - r * K * disc * _norm_cdf(d2))
        rho = K * T * disc * _norm_cdf(d2)
    else:
        delta = _norm_cdf(d1) - 1.0
        theta = (-(S * pdf * sigma) / (2 * sqrt_t)
                 + r * K * disc * _norm_cdf(-d2))
        rho = -K * T * disc * _norm_cdf(-d2)

    gamma = pdf / (S * sigma * sqrt_t)
    vega = S * pdf * sqrt_t

    return {
        "delta": round(delta, 4),
        "gamma": round(gamma, 6),
        "theta": round(theta / 365.0, 4),   # per day
        "vega": round(vega / 100.0, 4),     # per 1% vol
        "rho": round(rho / 100.0, 4),       # per 1% rate
    }
