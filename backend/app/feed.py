# -*- coding: utf-8 -*-
"""
feed.py — the live DhanHQ feed.

Cash + futures come from the WebSocket Full stream (sub-second, feed_ws) with a 3s
REST quote fallback; options + circuit limits refresh via REST every 3s. Publishes
the payload to Redis `live:{symbol}`. History-derived stats (z-score, beta, realised
vol) use the backfilled daily candles. Blocking dhanhq calls run in a thread.
"""
import asyncio
import json
import math
from datetime import date, datetime, timezone

from sqlalchemy import select

from app.dhan_config import get_dhan
from app.db import SessionLocal
from app.feed_ws import FULL, NSE_FNO, ws
from app.greeks import greeks as bs_greeks
from app.live_math import chain_metrics, classify_buildup
from app.models import Candle, Instrument
from app.redis_store import get_redis

TICK_SEC = 1.0            # push cadence; WS drives sub-second cash/futures
RISK_FREE = 0.065


async def _daily_stats(symbol: str) -> tuple[float, float]:
    """(mean, std) of daily returns in % — for the current-move z-score."""
    async with SessionLocal() as session:
        rows = await session.execute(
            select(Candle.close).where(Candle.symbol == symbol, Candle.interval == "1d")
            .order_by(Candle.ts))
        closes = [float(c) for c in rows.scalars()]
    rets = [(closes[i] / closes[i - 1] - 1) * 100 for i in range(1, len(closes))]
    if len(rets) < 5:
        return 0.0, 1.0
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
    return mean, math.sqrt(var) or 1.0


async def _beta(symbol: str) -> float:
    """Beta of the stock vs NIFTY 50 (daily returns, aligned by date)."""
    async with SessionLocal() as session:
        srows = (await session.execute(
            select(Candle.ts, Candle.close).where(
                Candle.symbol == symbol, Candle.interval == "1d").order_by(Candle.ts))).all()
        nrows = (await session.execute(
            select(Candle.ts, Candle.close).where(
                Candle.symbol == "NIFTY 50", Candle.interval == "1d").order_by(Candle.ts))).all()
    smap = {ts.date(): float(c) for ts, c in srows}
    nmap = {ts.date(): float(c) for ts, c in nrows}
    dates = sorted(set(smap) & set(nmap))
    if len(dates) < 10:
        return 1.0
    s = [smap[d] for d in dates]
    ni = [nmap[d] for d in dates]
    sret = [s[i] / s[i - 1] - 1 for i in range(1, len(s))]
    nret = [ni[i] / ni[i - 1] - 1 for i in range(1, len(ni))]
    nmean, smean = sum(nret) / len(nret), sum(sret) / len(sret)
    cov = sum((sret[i] - smean) * (nret[i] - nmean) for i in range(len(sret))) / len(sret)
    var = sum((x - nmean) ** 2 for x in nret) / len(nret)
    return round(cov / var, 2) if var else 1.0
N_STRIKES = 8
WS_SEG = {"NSE_EQ": 1}    # our segment -> dhanhq WS code (index via REST)


def _ws_quote(tick: dict) -> dict:
    """Convert a WS Full tick into the same shape as a REST quote row."""
    depth = tick.get("depth") or []
    return {
        "last_price": float(tick.get("LTP") or 0),
        "last_quantity": tick.get("LTQ", 0),
        "average_price": float(tick.get("avg_price") or 0),
        "volume": int(tick.get("volume") or 0),
        "buy_quantity": int(tick.get("total_buy_quantity") or 0),
        "sell_quantity": int(tick.get("total_sell_quantity") or 0),
        "oi": int(tick.get("OI") or 0),
        "oi_day_high": int(tick.get("oi_day_high") or 0),
        "oi_day_low": int(tick.get("oi_day_low") or 0),
        "ohlc": {"open": float(tick.get("open") or 0), "high": float(tick.get("high") or 0),
                 "low": float(tick.get("low") or 0), "close": float(tick.get("close") or 0)},
        "depth": {
            "buy": [{"price": float(l.get("bid_price") or 0), "quantity": l.get("bid_quantity", 0),
                     "orders": l.get("bid_orders", 0)} for l in depth],
            "sell": [{"price": float(l.get("ask_price") or 0), "quantity": l.get("ask_quantity", 0),
                      "orders": l.get("ask_orders", 0)} for l in depth],
        },
    }


async def _legs(symbol: str):
    """security_id/segment for the underlying spot + near-month future."""
    async with SessionLocal() as session:
        rows = await session.execute(
            select(Instrument).where(Instrument.symbol == symbol))
        insts = {i.kind: i for i in rows.scalars()}
    return insts.get("spot"), insts.get("future")


def _depth_from(q: dict):
    buy = (q.get("depth") or {}).get("buy") or []
    sell = (q.get("depth") or {}).get("sell") or []
    out = []
    for i in range(max(len(buy), len(sell))):
        b = buy[i] if i < len(buy) else {}
        s = sell[i] if i < len(sell) else {}
        out.append({
            "bid_price": b.get("price", 0), "bid_qty": b.get("quantity", 0),
            "bid_orders": b.get("orders", 0),
            "ask_price": s.get("price", 0), "ask_qty": s.get("quantity", 0),
            "ask_orders": s.get("orders", 0),
        })
    return out


def _map_leg(leg: dict, spot: float, K: float, T: float, opt: str) -> dict:
    iv = float(leg.get("implied_volatility") or 0)
    g = leg.get("greeks") or {}
    rho = bs_greeks(spot, K, T, RISK_FREE, max(iv, 0.01) / 100, opt)["rho"] if T > 0 else 0.0
    oi = int(leg.get("oi") or 0)
    prev_oi = int(leg.get("previous_oi") or 0)
    return {
        "ltp": leg.get("last_price", 0), "prev_close": leg.get("previous_close_price", 0),
        "oi": oi, "prev_oi": prev_oi, "chg_oi": oi - prev_oi,
        "volume": int(leg.get("volume") or 0), "iv": round(iv, 2),
        "bid": leg.get("top_bid_price", 0), "ask": leg.get("top_ask_price", 0),
        "delta": round(float(g.get("delta") or 0), 4),
        "gamma": round(float(g.get("gamma") or 0), 6),
        "theta": round(float(g.get("theta") or 0), 4),
        "vega": round(float(g.get("vega") or 0), 4),
        "rho": rho,
    }


def _build_options(oc: dict, spot: float, expiry: str) -> dict:
    keyed = {round(float(k), 2): v for k, v in oc.items()}
    all_k = sorted(keyed)
    if not all_k:
        return {}
    atm = min(all_k, key=lambda k: abs(k - spot))
    idx = all_k.index(atm)
    sel = all_k[max(0, idx - N_STRIKES): idx + N_STRIKES + 1]
    days = max(1, (datetime.strptime(expiry, "%Y-%m-%d").date() - date.today()).days)
    T = days / 365.0

    strikes = []
    for K in sel:
        leg = keyed[K]
        ce = leg.get("ce") or {}
        pe = leg.get("pe") or {}
        strikes.append({
            "strike": K,
            "ce": _map_leg(ce, spot, K, T, "CE"),
            "pe": _map_leg(pe, spot, K, T, "PE"),
        })

    return {
        "atm": atm, "strikes": strikes,
        **chain_metrics(strikes, atm),
    }


class RealFeed:
    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task] = {}
        self._subs: dict[str, int] = {}

    async def subscribe(self, symbol: str) -> None:
        self._subs[symbol] = self._subs.get(symbol, 0) + 1
        if symbol not in self._tasks:
            self._tasks[symbol] = asyncio.create_task(self._run(symbol))

    async def unsubscribe(self, symbol: str) -> None:
        self._subs[symbol] = max(0, self._subs.get(symbol, 0) - 1)
        if self._subs[symbol] == 0 and symbol in self._tasks:
            self._tasks.pop(symbol).cancel()

    async def _run(self, symbol: str) -> None:
        redis = get_redis()
        dhan = get_dhan()
        spot_i, fut_i = await _legs(symbol)
        if spot_i is None:
            return
        mean_daily, std_daily = await _daily_stats(symbol)
        beta = await _beta(symbol)

        # nearest expiry (once)
        try:
            el = await asyncio.to_thread(
                dhan.expiry_list, under_security_id=spot_i.security_id,
                under_exchange_segment=spot_i.segment)
            expiries = (el.get("data") or {}).get("data") or el.get("data") or []
            expiry = expiries[0] if expiries else None
        except Exception:
            expiry = None

        # WS subscribe (sub-second cash + futures)
        ws_pairs = []
        if spot_i.segment in WS_SEG:
            ws_pairs.append((WS_SEG[spot_i.segment], str(spot_i.security_id), FULL))
        if fut_i:
            ws_pairs.append((NSE_FNO, str(fut_i.security_id), FULL))
        if ws_pairs:
            ws.subscribe(ws_pairs)

        prev_spot = None
        prev_fut_oi = None
        cum_flow = 0
        circuit = {"u": 0, "l": 0}
        last_cq: dict = {}
        last_fq: dict = {}
        opt: dict = {}
        i = 0
        try:
            while True:
                try:
                    i += 1
                    # every 3s: REST fallback quote + circuit + option chain (rate-limit safe)
                    if i % 3 == 1:
                        secs = {spot_i.segment: [spot_i.security_id]}
                        if fut_i:
                            secs.setdefault("NSE_FNO", []).append(fut_i.security_id)
                        qr = await asyncio.to_thread(dhan.quote_data, securities=secs)
                        qd = (qr.get("data") or {}).get("data") or qr.get("data") or {}
                        last_cq = qd.get(spot_i.segment, {}).get(str(spot_i.security_id), {}) or last_cq
                        last_fq = (qd.get("NSE_FNO", {}).get(str(fut_i.security_id), {})
                                   if fut_i else {}) or last_fq
                        circuit = {"u": last_cq.get("upper_circuit_limit", 0),
                                   "l": last_cq.get("lower_circuit_limit", 0)}
                        if expiry:
                            oc_r = await asyncio.to_thread(
                                dhan.option_chain, under_security_id=spot_i.security_id,
                                under_exchange_segment=spot_i.segment, expiry=expiry)
                            ocd = (oc_r.get("data") or {}).get("data") or oc_r.get("data") or {}
                            oc = ocd.get("oc") or {}
                            u_spot = ocd.get("last_price") or last_cq.get("last_price", 0)
                            opt = _build_options(oc, u_spot, expiry)

                    # sub-second overlay from WS (fallback to last REST)
                    we = ws.get(spot_i.security_id)
                    wf = ws.get(fut_i.security_id) if fut_i else None
                    cq = _ws_quote(we) if we else dict(last_cq)
                    cq["upper_circuit_limit"] = circuit["u"]
                    cq["lower_circuit_limit"] = circuit["l"]
                    fq = _ws_quote(wf) if wf else dict(last_fq)

                    spot = cq.get("last_price", 0) or 0
                    ohlc = cq.get("ohlc") or {}
                    prev_close = ohlc.get("close", spot) or spot
                    bid_px = (cq.get("depth", {}).get("buy") or [{}])[0].get("price", spot) or spot
                    ask_px = (cq.get("depth", {}).get("sell") or [{}])[0].get("price", spot) or spot
                    d_price = 0 if prev_spot is None else spot - prev_spot
                    prev_spot = spot
                    vol_now = int(cq.get("volume") or 0)
                    cum_flow += vol_now if d_price >= 0 else -vol_now
                    bq = int(cq.get("buy_quantity") or 0)
                    sq = int(cq.get("sell_quantity") or 1)

                    fut_ltp = fq.get("last_price", spot) or spot
                    fut_oi = int(fq.get("oi") or 0)
                    d_oi = 0 if prev_fut_oi is None else fut_oi - prev_fut_oi
                    prev_fut_oi = fut_oi
                    premium = fut_ltp - spot

                    atp = cq.get("average_price", spot) or spot
                    iv = (opt.get("atm_iv") or 0) / 100
                    em = spot * iv * math.sqrt(1 / 252) if iv else 0
                    chg_pct = (spot - prev_close) / prev_close * 100 if prev_close else 0
                    z = (chg_pct - mean_daily) / std_daily if std_daily else 0
                    theo_prem = spot * RISK_FREE * 25 / 365
                    realized = std_daily * math.sqrt(252)

                    ce_chg = opt.get("total_ce_oi", 0)  # placeholder; per-strike chg exists
                    payload = {
                        "symbol": symbol,
                        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                        "cash": {
                            "ltp": spot, "last_qty": int(cq.get("last_quantity") or 0),
                            "atp": atp, "prev_close": prev_close,
                            "chg": round(spot - prev_close, 2), "chg_pct": round(chg_pct, 2),
                            "open": ohlc.get("open", 0), "high": ohlc.get("high", 0),
                            "low": ohlc.get("low", 0), "volume": vol_now,
                            "buy_qty": bq, "sell_qty": sq,
                            "buy_pct": round(bq / (bq + sq) * 100, 1) if bq + sq else 50,
                            "bid": bid_px,
                            "ask": ask_px,
                            "spread": round(abs(ask_px - bid_px), 2),
                            "upper_circuit": cq.get("upper_circuit_limit", 0),
                            "lower_circuit": cq.get("lower_circuit_limit", 0),
                            "cum_flow": cum_flow, "depth": _depth_from(cq),
                        },
                        "futures": {
                            "ltp": fut_ltp, "atp": fq.get("average_price", fut_ltp) or fut_ltp,
                            "oi": fut_oi, "oi_day_high": int(fq.get("oi_day_high") or 0),
                            "oi_day_low": int(fq.get("oi_day_low") or 0), "chg_oi": d_oi,
                            "premium": round(premium, 2),
                            "premium_pct": round(premium / spot * 100, 2) if spot else 0,
                            "basis": round(premium, 2),
                            "buildup": classify_buildup(d_price, d_oi),
                            "depth": _depth_from(fq),
                            "expiries": [{"label": "Near", "ltp": fut_ltp, "oi": fut_oi,
                                          "premium": round(premium, 2)}],
                        },
                        "options": {
                            **opt,
                            "max_pain_dist": round(spot - opt.get("max_pain", spot), 2),
                            "expiries": expiries if expiry else [],
                            "ce_chg_oi": sum(s["ce"]["chg_oi"] for s in opt.get("strikes", [])),
                            "pe_chg_oi": sum(s["pe"]["chg_oi"] for s in opt.get("strikes", [])),
                            "atm_ce_delta": next((s["ce"]["delta"] for s in opt.get("strikes", [])
                                                  if s["strike"] == opt.get("atm")), 0),
                            "atm_pe_delta": next((s["pe"]["delta"] for s in opt.get("strikes", [])
                                                  if s["strike"] == opt.get("atm")), 0),
                            "ce_buildup": classify_buildup(
                                d_price, sum(s["ce"]["chg_oi"] for s in opt.get("strikes", []))),
                            "pe_buildup": classify_buildup(
                                d_price, sum(s["pe"]["chg_oi"] for s in opt.get("strikes", []))),
                        } if opt else {"strikes": [], "pcr": 0, "max_pain": 0, "atm": 0,
                                       "expiries": [], "atm_iv": 0},
                        "analytics": {
                            "expected_move": round(em, 2),
                            "ci68": [round(spot - em, 2), round(spot + em, 2)],
                            "ci95": [round(spot - 1.96 * em, 2), round(spot + 1.96 * em, 2)],
                            "hist_vol_daily_pct": round(std_daily, 2), "z_score": round(z, 2),
                            "beta": beta, "realized_vol": round(realized, 2),
                            "implied_vol": opt.get("atm_iv", 0),
                            "vol_premium": round(opt.get("atm_iv", 0) - realized, 2),
                            "vwap_edge": round(spot - atp, 2),
                            "fut_theo_premium": round(theo_prem, 2),
                            "fut_fv_edge": round(premium - theo_prem, 2),
                        },
                    }
                    _ = ce_chg
                    data = json.dumps(payload, default=str)
                    await redis.hset(f"live:{symbol}", mapping={"data": data})
                    await redis.publish(f"live:{symbol}", data)
                except Exception as e:  # transient API/parse errors — keep polling
                    print(f"[feed] {symbol}: {e!r}")
                await asyncio.sleep(TICK_SEC)
        except asyncio.CancelledError:
            pass
        finally:
            if ws_pairs:
                ws.unsubscribe(ws_pairs)


feed = RealFeed()
