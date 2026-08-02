# -*- coding: utf-8 -*-
"""
main.py — FastAPI app entrypoint.

Phase 0: /health (db + redis reachability) + /universe. Routers for history,
live (WS), instruments, and option-chain are added in later phases.
"""
import json
import sys
from contextlib import asynccontextmanager

from fastapi import (FastAPI, HTTPException, Query, WebSocket,
                     WebSocketDisconnect)
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from app import db, redis_store
from app.chain import build_chain
from app.config import UNIVERSE, get_settings
from app.dhan_config import mode as data_mode
from app.mock_feed import feed
from app.models import Candle, MetricSnapshot

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


@app.get("/health")
async def health():
    """Liveness + dependency reachability."""
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
    return {"status": status, "db": db_ok, "redis": redis_ok, "mode": data_mode()}


@app.get("/universe")
async def universe():
    """NIFTY 50 index + 50 stocks (51 underlyings)."""
    return {"count": len(UNIVERSE), "underlyings": UNIVERSE}


@app.get("/history")
async def history(symbol: str = Query(...), interval: str = Query("1d")):
    """Candle history for one underlying (from Postgres/Timescale)."""
    async with db.SessionLocal() as session:
        rows = await session.execute(
            select(Candle)
            .where(Candle.symbol == symbol, Candle.interval == interval)
            .order_by(Candle.ts))
        candles = [
            {
                "time": c.ts.strftime("%Y-%m-%d"),
                "open": c.open, "high": c.high, "low": c.low, "close": c.close,
                "volume": c.volume,
            }
            for c in rows.scalars()
        ]
    if not candles:
        raise HTTPException(404, f"No {interval} history for {symbol}")
    return {"symbol": symbol, "interval": interval,
            "count": len(candles), "candles": candles}


@app.get("/stats")
async def stats():
    """Pure-math per-stock statistics across the 50 stocks (from daily candles)."""
    import numpy as np
    import pandas as pd

    async with db.SessionLocal() as session:
        rows = (await session.execute(text(
            "SELECT symbol, ts, close FROM candles "
            "WHERE interval='1d' AND segment='NSE_EQ' ORDER BY symbol, ts"))).all()

    df = pd.DataFrame(rows, columns=["symbol", "ts", "close"])
    out = []
    for sym, g in df.groupby("symbol"):
        c = g["close"].astype(float).reset_index(drop=True)
        if len(c) < 30:
            continue
        ret = c.pct_change().dropna()
        vol = float(ret.std())
        mean = float(ret.mean())
        last, first = float(c.iloc[-1]), float(c.iloc[0])
        out.append({
            "symbol": sym,
            "last": round(last, 2),
            "ret_1w": round((last / float(c.iloc[-6]) - 1) * 100, 2) if len(c) >= 6 else None,
            "ret_1m": round((last / float(c.iloc[-22]) - 1) * 100, 2) if len(c) >= 22 else None,
            "cum_return": round((last / first - 1) * 100, 2),
            "ann_vol": round(vol * np.sqrt(252) * 100, 2),
            "sharpe": round(mean / vol, 2) if vol > 0 else 0.0,
            "max_dd": round(float((c / c.cummax() - 1).min()) * 100, 2),
        })
    return {"count": len(out), "stats": out}


@app.get("/snapshots")
async def snapshots(symbol: str = Query(...)):
    """Daily PCR / max-pain / premium trend for one underlying."""
    async with db.SessionLocal() as session:
        rows = await session.execute(
            select(MetricSnapshot).where(MetricSnapshot.symbol == symbol)
            .order_by(MetricSnapshot.date))
        data = [
            {
                "date": r.date, "pcr": r.pcr, "max_pain": r.max_pain,
                "futures_premium": r.futures_premium, "spot_close": r.spot_close,
            }
            for r in rows.scalars()
        ]
    return {"symbol": symbol, "count": len(data), "snapshots": data}


@app.get("/movers")
async def movers(limit: int = 6):
    """Top gainers/losers across the 50 stocks (latest daily close vs previous)."""
    sql = text("""
        WITH ranked AS (
            SELECT symbol, close,
                   ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY ts DESC) AS rn
            FROM candles
            WHERE interval = '1d' AND segment = 'NSE_EQ'
        )
        SELECT symbol,
               MAX(close) FILTER (WHERE rn = 1) AS last,
               MAX(close) FILTER (WHERE rn = 2) AS prev
        FROM ranked WHERE rn <= 2 GROUP BY symbol
    """)
    async with db.SessionLocal() as session:
        rows = (await session.execute(sql)).all()

    items = []
    for sym, last, prev in rows:
        if last is not None and prev:
            items.append({
                "symbol": sym,
                "last": round(float(last), 2),
                "chg_pct": round((float(last) - float(prev)) / float(prev) * 100, 2),
            })
    items.sort(key=lambda x: x["chg_pct"], reverse=True)
    return {"gainers": items[:limit], "losers": list(reversed(items[-limit:]))}


@app.get("/chain")
async def chain(symbol: str = Query(...)):
    """Option chain + PCR + max-pain + greeks for one underlying (mock for now)."""
    return await build_chain(symbol)


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
    await feed.subscribe(symbol)
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
        await feed.unsubscribe(symbol)
