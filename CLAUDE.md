# 🚀 Bloomberg-lite — Indian F&O Trading Terminal (v2.0)

> Project ka **authoritative spec + memory**. Koi bhi fresh session isko padhe — poora
> context, scope, tech, architecture, aur build-order yahin hai.
> Purane v1 (NSE EOD dashboard) ke plan-docs `docs/` folder mein reference ke liye hain.

---

## 0. Ek line mein

**"Bloomberg-lite" Indian F&O trading terminal** — NIFTY 50 index + uske 50 stocks ka
**history + live** data, **pure math/statistics** (options Greeks/PCR/risk OK), **real-time**
calculate aur display. **Educational / research tool — trading advice NAHI.**

## 1. Scope (LOCKED)

**Universe = NIFTY 50 index + uske saare 50 stocks (51 underlyings).**

| Layer | Kiske liye | Source | Behaviour |
|---|---|---|---|
| **History** | saare 51 (index + 50 stocks) | DhanHQ historical (daily + intraday) → Postgres/Timescale | Kisi bhi stock ka **beete dino ka** data browse (candle / OI / volume) |
| **Live** | **sirf jo user select kare** | DhanHQ WS Full + Option-Chain REST → Redis | Select karte hi backend **us stock** ko subscribe: live LTP/OHLC/vol/OI/premium/buildup + PCR/max-pain/greeks. Doosra select → swap |

**Design principle:** ek time pe sirf 1 stock live subscribe → rate-limit ki dikkat nahi, WS
halka. Baaki 50 ka context history se. Single data source = **DhanHQ** (NSE archive ki zaroorat nahi).

## 2. Data source — DhanHQ (`pip install dhanhq`)

Docs: [live-market-feed](https://dhanhq.co/docs/v2/live-market-feed/) ·
[option-chain](https://dhanhq.co/docs/v2/option-chain/) ·
[instruments](https://dhanhq.co/docs/v2/instruments/) ·
[DhanHQ-py](https://github.com/dhan-oss/DhanHQ-py)

| Capability | Kaise | Kya milta | Limit |
|---|---|---|---|
| **Live feed (WS)** | `wss://api-feed.dhan.co?version=2&token=&clientId=&authType=2` | Ticker / Quote / **Full** | 5 conn × 5000 = 25k instr; 100/subscribe-msg; binary (lib parse) |
| ↳ Ticker | mode | LTP + last-trade-time | — |
| ↳ Quote | mode | LTP, qty, ATP, **volume, day OHLC**, buy/sell qty | — |
| ↳ **Full** | mode | Quote **+ OI + high/low OI + 5-level depth** | ← F&O OI live |
| **Option Chain** | `POST /v2/optionchain` | har strike CE/PE: `last_price, oi, volume, IV`, **greeks (Δ/Γ/Θ/Vega)**, bid/ask | **1 req / 3s** per unique (underlying+expiry) |
| **Expiry list** | `POST /v2/optionchain/expirylist` | expiry dates | — |
| **Historical** | `historical_daily_data`, `intraday_minute_data` | OHLC (+OI) candles | REST |
| **Quote snapshot** | `ohlc_data`, `quote_data` | bulk LTP/OHLC | REST |
| **Instruments CSV** | `images.dhan.co/api-data/api-scrip-master.csv` (+`-detailed`) | `SECURITY_ID, TRADING_SYMBOL, EXCH_ID, SEGMENT, INSTRUMENT_NAME, EXPIRY_DATE, STRIKE_PRICE, OPTION_TYPE, UNDERLYING_SYMBOL` | symbol→SecurityId map |
| **Trading** | `place_order, get_positions, get_holdings, get_fund_limits` | orders / P&L / margin | Phase 6 |

**Key insight:** **Greeks + IV Dhan khud deta** (option chain mein) — Black-Scholes hume
compute karna zaroori nahi. Apna BS sirf verify / education / Rho ke liye optional.

Python lib binary parsing handle karti:
```python
from dhanhq import DhanContext, dhanhq, MarketFeed
ctx  = DhanContext(client_id, access_token)
dhan = dhanhq(ctx)                                  # REST: option_chain, historical, orders
feed = MarketFeed(ctx, [(MarketFeed.NSE, "1333", MarketFeed.Full)], version="v2")
feed.run_forever(); tick = feed.get_data()          # live
```

## 3. Tech stack (LOCKED)

```
Frontend :  React + TypeScript + Vite · TradingView Lightweight Charts ·
            Tailwind (dark) · TanStack Query · WebSocket client
Backend  :  FastAPI (async) · SQLAlchemy 2.0 · asyncpg · Pydantic · dhanhq
Database :  PostgreSQL + TimescaleDB  (time-series candles + daily snapshots)
Live/cache: Redis  (live tick state + pub/sub → WebSocket fanout)
Dev/deploy: Docker Compose  →  `docker compose up`  = poora stack ek command
Language :  Python 3.11+ (Windows: `python`, `python3` nahi)
```

## 4. Architecture

```
        DhanHQ  (WS Full + Option-Chain REST + Historical REST + Scrip CSV)
                 │                                   │
   live (selected stock)                      history (all 51, one-time + incremental)
                 ▼                                   ▼
┌─ Backend — FastAPI (async) ───────────────────────────────────────────────┐
│  live_manager: SELECT aane pe us stock subscribe / purana unsubscribe      │
│  feed → Redis (live state) ── pub/sub ──▶ WebSocket push to UI (per second) │
│  chain poller (3s, selected) → Redis (PCR/max-pain/greeks)                 │
│  history.py → Postgres/Timescale (candles)                                 │
│  REST: /history, /snapshot, /instruments   ·   WS: /ws/live?symbol=…       │
└────────────────────────────────────────────────────────────────────────────┘
                 │ REST (history)                    │ WebSocket (live push)
                 ▼                                    ▼
┌─ Frontend — React ─────────────────────────────────────────────────────────┐
│  stock picker (51) · live panel (selected) · candle+OI history chart ·      │
│  option-chain table · PCR / premium / OI-buildup / greeks tiles · movers    │
└────────────────────────────────────────────────────────────────────────────┘
```

## 5. Project structure

```
Bloomberg-lite/
├─ docker-compose.yml        # postgres+timescale, redis, backend, frontend
├─ CLAUDE.md  README.md  .gitignore
├─ docs/                     # v1 reference plan-docs (ARCHITECTURE/LIVE_DATA/GUIDE/PLAN)
├─ backend/
│  ├─ app/
│  │  ├─ main.py             # FastAPI app · REST + WS endpoints · lifespan
│  │  ├─ config.py           # settings + NIFTY50 universe (index + 50 stocks)
│  │  ├─ dhan_config.py      # DhanContext (client_id, access_token from .env)
│  │  ├─ db.py               # SQLAlchemy async engine/session + Timescale setup
│  │  ├─ models.py           # ORM: candles, snapshots, instruments
│  │  ├─ redis_store.py      # live state read/write + pub/sub
│  │  ├─ instruments.py      # scrip-master CSV → DB (symbol→security_id, all types)
│  │  ├─ history.py          # DhanHQ historical (daily backfill + intraday on-demand)
│  │  ├─ feed.py             # MarketFeed (Full) wrapper → redis_store
│  │  ├─ live_manager.py     # subscribe/unsubscribe on stock select
│  │  ├─ chain.py            # option_chain + expiry REST poller (selected, 3s)
│  │  ├─ calc.py             # premium, OI buildup, movers, PCR, max-pain
│  │  ├─ greeks.py           # optional BS/IV verify + Rho
│  │  ├─ snapshot_job.py     # daily EOD snapshot of derived metrics → Postgres
│  │  ├─ mock_feed.py        # off-market / no-token synthetic feed (dev + verify)
│  │  └─ routers/            # history · live(ws) · instruments · chain
│  ├─ requirements.txt  .env.example  Dockerfile
├─ frontend/
│  ├─ package.json vite.config.ts tsconfig.json tailwind.config.js index.html Dockerfile
│  └─ src/
│     ├─ main.tsx App.tsx
│     ├─ api.ts              # REST (TanStack Query) + WS client
│     ├─ hooks/useLive.ts    # WS subscribe to selected symbol
│     └─ components/         # StockPicker · LivePanel · CandleChart · ChainTable ·
│                            #   Tiles(PCR/premium/buildup/greeks) · Movers
└─ (Postgres + Redis run in Docker; volumes persist data)
```

## 6. Data model

**Postgres + TimescaleDB (history — persistent):**
```sql
-- OHLC(+OI) candles — Timescale hypertable on ts. interval = '1d' | '1m'.
candles(symbol, segment, instrument_type, interval, ts,
        open, high, low, close, volume, oi)          -- PK(symbol,segment,interval,ts)

-- Daily derived-metric snapshot (aaj se aage build hota jayega)
metric_snapshots(symbol, date, pcr, max_pain, futures_premium,
        total_oi, oi_change, buildup, spot_close)     -- PK(symbol,date)

-- Scrip-master cache: symbol → security_id (equity / futures / options / index)
instruments(security_id, symbol, underlying, segment, instrument_type,
        expiry, strike, opt_type, exch_id)            -- PK(security_id, segment)
```

**Redis (live — ephemeral):**
```
live:{symbol}          hash  → ltp, open, high, low, close, prev_close, volume, oi, chg_oi, ts
live:{symbol}:fut      hash  → fut_ltp, fut_oi, chg_oi, premium
live:{symbol}:chain    json  → pcr, max_pain, strikes[{strike, ce{ltp,oi,iv,greeks}, pe{…}}]
channel  live:{symbol}       → pub/sub, backend WS fanout to UI
```

## 7. Update loops (rate-limit-safe)

- **WS ticks** (selected spot + near-month future) → Redis update on every tick →
  backend **har ~1s** UI ko snapshot push (LTP/premium/OI/buildup/movers). Real-time ✅
- **Option chain** (selected underlying, priority expiry) → REST poll **every 3s**
  (Dhan limit 1 req/3s) → PCR/max-pain/greeks Redis → same push. ~3s refresh.
- **History** → one-time daily backfill for 51; intraday on-demand per selected stock; cached.
- **Daily snapshot job** → market close ke baad derived metrics Postgres mein (trend history).

> **Honest note:** price/volume/OI ka **past** Dhan deta. **PCR/max-pain ka past** Dhan
> direct nahi deta — hum roz snapshot karke banayenge (history **app-start din se** banegi).

## 8. NON-NEGOTIABLE rules

1. **Pure math / statistics only — NO technical indicators** (koi RSI/MACD/MA nahi).
   Options Greeks / Black-Scholes / VaR / PCR OK (Bloomberg-lite scope).
2. **Educational / research tool — trading "signals/advice" NAHI.** Har predictive/analytical
   feature pe prominent **educational/research disclaimer**. Personalized investment advice mat do.
3. **Data-source honesty:** live = DhanHQ (paid/authed). Delivery% + FII/DII agar kabhi add
   hue to **EOD-only** (koi live feed deta hi nahi).
4. **Execution safety:** trade/order **main khud place nahi karunga** — UI se user confirm
   karke place karega; main sirf integration + preview banata hoon.

## 9. Gotchas (v1 se seekhe — dohrao mat)

- DhanHQ WS response **binary (little-endian)** → `dhanhq` lib se parse (raw decode mat karo).
- **Option-chain rate limit 1 req/3s** → per-underlying poller throttle; sirf selected stock.
- Access token **daily-ish expire** → clear error + refresh flow.
- Windows console **cp1252** emoji crash → `sys.stdout.reconfigure(encoding="utf-8")`.
- numpy scalar DB mein BLOB → native `int()/float()` cast.
- Live throughput → har tick pe recompute mat karo; throttle (1s), vectorized.
- Market-hours only live (9:15–15:30 IST); baaki last-snapshot / history. Off-market dev = `mock_feed`.
- Secrets (`.env`) kabhi commit nahi — `.gitignore` mein.

## 10. Build phases (chhote, verify-able steps)

- **Phase 0 — Scaffold:** `git init` · `docker-compose.yml` (postgres+timescale+redis) ·
  backend FastAPI skeleton · frontend Vite React-TS skeleton · `config.py` (NIFTY50) ·
  `.gitignore` · `.env.example`. *Verify: `docker compose up` → services healthy, FastAPI `/health` OK, Vite page loads.*
- **Phase 1 — Instruments + history:** scrip-master → `instruments` table; DhanHQ historical
  backfill (daily, all 51) → `candles`; REST `/history`; frontend candle chart.
  *(mock/replay agar token nahi.)*
- **Phase 2 — Live (selected):** `feed` + `live_manager` + Redis + WS `/ws/live`; frontend
  live panel auto-update. `mock_feed` se off-market verify.
- **Phase 3 — Option chain:** `chain` poller (3s) → PCR/max-pain/greeks; chain table + tiles.
- **Phase 4 — Calc + snapshot:** premium/buildup/movers + daily snapshot job (metric history).
- **Phase 5 — Analytics:** options payoff builder, risk (VaR/Sortino/position-size/charges STT+GST).
- **Phase 6 — Execution + context:** DhanHQ orders/positions/P&L (user-confirmed) · India VIX ·
  breadth · alerts · watchlists.

## 11. Key commands

```bash
docker compose up -d                 # postgres + timescale + redis + backend + frontend
docker compose logs -f backend       # backend logs
# backend (local dev):
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload
# frontend (local dev):
cd frontend && npm install && npm run dev
```

---

*Bloomberg-lite = DhanHQ (single source) + Postgres/Timescale (history) + Redis (live) +
FastAPI (async) + React/TS (UI). NIFTY 50 universe; history saare 51 ka, live selected ka.
Pure math, educational — trading advice nahi.*
