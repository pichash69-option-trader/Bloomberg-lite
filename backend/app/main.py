# -*- coding: utf-8 -*-
"""
main.py — FastAPI app entrypoint.

Phase 0: /health (db + redis reachability) + /universe. Routers for history,
live (WS), instruments, and option-chain are added in later phases.
"""
import asyncio
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app import db, feed as real_feed, redis_store
from app.config import UNIVERSE, get_settings
from app.dhan_config import has_creds
from app.dhan_config import mode as data_mode
from app.models import Instrument


def _feed():
    """The real DhanHQ feed (no-creds shows the token banner, no live data)."""
    return real_feed.feed

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
_market_cache = {"data": None}   # last good /market snapshot (rate-limit fallback)


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
    except Exception:
        q = {}
    qd = (q.get("data") or {}).get("data") or q.get("data") or {}
    eq = qd.get("NSE_EQ", {})
    idx = qd.get("IDX_I", {})

    # quote_data (1 req/sec) sometimes returns empty when it collides with the
    # live feed's polling — serve the last good snapshot instead of zeros.
    if not eq:
        return _market_cache["data"] or {"available": False}

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

    result = {
        "available": True,
        "nifty": idx_val(13), "vix": idx_val(21),
        "breadth": {"advances": adv, "declines": dec, "unchanged": unch},
        "gainers": movers[:6], "losers": list(reversed(movers[-6:])),
        "all": movers,
    }
    _market_cache["data"] = result
    return result


@app.websocket("/ws/live")
async def ws_live(ws: WebSocket, symbol: str = Query(...)):
    """Live tick stream for the selected symbol (DhanHQ feed → Redis → WS)."""
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
