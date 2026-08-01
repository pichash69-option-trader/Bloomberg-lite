# 🚀 Bloomberg-lite — Indian F&O Trading Terminal (v2.0)

Real-time **F&O terminal** for the **NIFTY 50** (index + 50 stocks). History for all 51,
**live** for the underlying you select. Pure math / statistics — **educational / research
tool, not trading advice.**

> Full spec, architecture, data model, and build phases: **[`CLAUDE.md`](CLAUDE.md)**.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + TypeScript + Vite · Lightweight Charts · Tailwind |
| Backend | FastAPI (async) · SQLAlchemy 2.0 · asyncpg · `dhanhq` |
| Database | PostgreSQL + TimescaleDB (time-series candles + snapshots) |
| Live/cache | Redis (live tick state + pub/sub → WebSocket) |
| Data source | **DhanHQ** (WS feed + Option-Chain REST + Historical + Scrip master) |
| Dev/deploy | Docker Compose |

## Quick start

```bash
cp .env.example .env          # then fill DHAN_CLIENT_ID + DHAN_ACCESS_TOKEN
docker compose up -d          # postgres+timescale + redis + backend + frontend
```

- Frontend → http://localhost:5173
- Backend health → http://localhost:8000/health
- Universe → http://localhost:8000/universe

### Local dev (without Docker for app code)

```bash
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload
cd frontend && npm install && npm run dev
```
(Postgres + Redis still come from `docker compose up -d db redis`.)

## Status

**Phase 0 — scaffold** ✅ (repo, Docker stack, FastAPI skeleton, Vite React-TS UI, NIFTY 50 config).
Next: Phase 1 (instruments + historical backfill). See [`CLAUDE.md`](CLAUDE.md) §10.

---

⚠️ *Educational / research only. Not investment advice. Data via DhanHQ (authenticated).*
