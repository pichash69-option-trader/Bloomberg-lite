# -*- coding: utf-8 -*-
"""
main.py — FastAPI app entrypoint.

Phase 0: /health (db + redis reachability) + /universe. Routers for history,
live (WS), instruments, and option-chain are added in later phases.
"""
import asyncio
import json
import sys
from contextlib import asynccontextmanager

from fastapi import (FastAPI, HTTPException, Query, WebSocket,
                     WebSocketDisconnect)
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app import db, feed as real_feed, mock_feed, redis_store
from app.config import UNIVERSE, get_settings
from app.dhan_config import has_creds
from app.dhan_config import mode as data_mode
from app.models import Instrument


def _feed():
    """Real DhanHQ feed when creds are present, else the synthetic mock feed."""
    return real_feed.feed if has_creds() else mock_feed.feed

# Windows cp1252 console safety (v1 gotcha) — safe no-op elsewhere.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: make sure TimescaleDB extension is present.
    try:
        await db.ensure_timescale()
    except Exception as e:  # DB may still be booting on first `up` — don't crash.
        print(f"[startup] timescale ensure skipped: {e}")
    yield
    # Shutdown
    await redis_store.close()
    await db.engine.dispose()


app = FastAPI(title="Bloomberg-lite API", version="2.0.0", lifespan=lifespan)

# Dev CORS — Vite frontend on 5173.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


_auth_cache = {"ts": 0.0, "valid": None}


async def _auth_valid():
    """Cached (60s) DhanHQ token validity — None if no creds, else bool."""
    import time as _t

    if not has_creds():
        return None
    if _t.time() - _auth_cache["ts"] < 60 and _auth_cache["valid"] is not None:
        return _auth_cache["valid"]
    from app.dhan_config import get_dhan
    try:
        r = await asyncio.to_thread(get_dhan().get_fund_limits)
        _auth_cache["valid"] = r.get("status") == "success"
    except Exception:
        _auth_cache["valid"] = False
    _auth_cache["ts"] = _t.time()
    return _auth_cache["valid"]


@app.get("/health")
async def health():
    """Liveness + dependency reachability + Dhan token validity."""
    db_ok = redis_ok = False
    try:
        db_ok = await db.ping()
    except Exception:
        pass
    try:
        redis_ok = await redis_store.ping()
    except Exception:
        pass
    status = "ok" if (db_ok and redis_ok) else "degraded"
    return {"status": status, "db": db_ok, "redis": redis_ok,
            "mode": data_mode(), "auth": await _auth_valid()}


@app.get("/universe")
async def universe():
    """NIFTY 50 index + 50 stocks (51 underlyings)."""
    return {"count": len(UNIVERSE), "underlyings": UNIVERSE}


@app.get("/market")
async def market():
    """Market context: India VIX, NIFTY, breadth (adv/dec), live movers.

    One bulk quote for all 50 stocks + NIFTY(13) + India VIX(21). Real only."""
    if not has_creds():
        return {"available": False}
    from app.dhan_config import get_dhan

    async with db.SessionLocal() as session:
        rows = await session.execute(
            select(Instrument).where(Instrument.kind == "spot",
                                     Instrument.segment == "NSE_EQ"))
        stocks = list(rows.scalars())
    idmap = {str(s.security_id): s.symbol for s in stocks}

    try:
        q = await asyncio.to_thread(
            get_dhan().quote_data,
            securities={"NSE_EQ": [s.security_id for s in stocks], "IDX_I": [13, 21]})
    except Exception as e:
        return {"available": False, "error": str(e)}
    qd = (q.get("data") or {}).get("data") or q.get("data") or {}
    eq = qd.get("NSE_EQ", {})
    idx = qd.get("IDX_I", {})

    def chg(d):
        ltp = d.get("last_price", 0) or 0
        pc = (d.get("ohlc") or {}).get("close", ltp) or ltp
        return ltp, round((ltp - pc) / pc * 100, 2) if pc else 0.0

    movers, adv, dec, unch = [], 0, 0, 0
    for sid, d in eq.items():
        ltp, c = chg(d)
        adv += c > 0.05
        dec += c < -0.05
        unch += -0.05 <= c <= 0.05
        movers.append({"symbol": idmap.get(sid, sid), "ltp": round(ltp, 2), "chg_pct": c})
    movers.sort(key=lambda x: x["chg_pct"], reverse=True)

    def idx_val(i):
        ltp, c = chg(idx.get(str(i), {}))
        return {"ltp": round(ltp, 2), "chg_pct": c}

    return {
        "available": True,
        "nifty": idx_val(13), "vix": idx_val(21),
        "breadth": {"advances": adv, "declines": dec, "unchanged": unch},
        "gainers": movers[:6], "losers": list(reversed(movers[-6:])),
        "all": movers,
    }


@app.get("/snapshot")
async def snapshot(symbols: str = Query(...)):
    """Key live metrics for several underlyings (watchlist grid).

    Uses the live feed from Redis if that symbol is subscribed, else a synthetic
    snapshot from the latest close + chain."""
    from app.chain import _spot, synth_chain

    redis = redis_store.get_redis()
    out = []
    for sym in [s.strip() for s in symbols.split(",") if s.strip()]:
        raw = await redis.hget(f"live:{sym}", "data")
        if raw:
            m = json.loads(raw)
            out.append({
                "symbol": sym, "ltp": m["cash"]["ltp"], "chg_pct": m["cash"]["chg_pct"],
                "pcr": m["options"]["pcr"], "buildup": m["futures"]["buildup"], "live": True,
            })
        else:
            spot = await _spot(sym)
            ch = synth_chain(sym, spot)
            out.append({
                "symbol": sym, "ltp": round(spot, 2), "chg_pct": 0.0,
                "pcr": ch["pcr"], "buildup": "—", "live": False,
            })
    return {"snapshots": out}


@app.get("/optdepth")
async def optdepth(symbol: str = Query(...), strike: float = Query(...)):
    """Full 5-level market depth for a strike's CE & PE (on-demand).

    Mock: synthesised. Real: dhan.quote_data for that option's securityId (1/sec)."""
    import random

    from app.chain import _spot, synth_chain
    from app.mock_feed import _depth

    ch = synth_chain(symbol, await _spot(symbol))
    row = next((s for s in ch["strikes"] if s["strike"] == strike), None)
    if row is None:
        raise HTTPException(404, f"strike {strike} not in {symbol} chain")

    def side(leg, seed):
        rng = random.Random(seed & 0xFFFFFFFF)
        return {
            "ltp": leg["ltp"], "bid": leg["bid"], "ask": leg["ask"], "oi": leg["oi"],
            "depth": _depth(leg["ltp"], max(0.05, leg["ltp"] * 0.02), 0.05, rng),
        }

    return {
        "symbol": symbol, "strike": strike,
        "ce": side(row["ce"], hash((symbol, strike, "CE"))),
        "pe": side(row["pe"], hash((symbol, strike, "PE"))),
    }


@app.websocket("/ws/live")
async def ws_live(ws: WebSocket, symbol: str = Query(...)):
    """Live tick stream for the selected symbol (mock feed → Redis → WS)."""
    await ws.accept()
    fd = _feed()
    await fd.subscribe(symbol)
    redis = redis_store.get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(f"live:{symbol}")
    try:
        # Push the current snapshot immediately (don't wait a full second).
        snap = await redis.hget(f"live:{symbol}", "data")
        if snap:
            await ws.send_text(snap)
        async for msg in pubsub.listen():
            if msg.get("type") == "message":
                await ws.send_text(msg["data"])
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(f"live:{symbol}")
        await pubsub.aclose()
        await fd.unsubscribe(symbol)
