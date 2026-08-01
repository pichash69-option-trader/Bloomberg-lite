# -*- coding: utf-8 -*-
"""
main.py — FastAPI app entrypoint.

Phase 0: /health (db + redis reachability) + /universe. Routers for history,
live (WS), instruments, and option-chain are added in later phases.
"""
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import db, redis_store
from app.config import UNIVERSE, get_settings

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
    return {"status": status, "db": db_ok, "redis": redis_ok}


@app.get("/universe")
async def universe():
    """NIFTY 50 index + 50 stocks (51 underlyings)."""
    return {"count": len(UNIVERSE), "underlyings": UNIVERSE}
