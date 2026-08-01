# 🚀 Claude2.0.md — NSE F&O Dashboard **v2.0** (Live-First Rebuild)

> Ye file ek **alag/naye project (v2.0)** ka kickoff brief hai. Isko kisi bhi fresh
> Claude Code session (ya developer) ke saamne rakho — poora context yahin hai.
> v1 = current EOD dashboard (ye repo). **v2.0 = live-first hybrid**, ek separate project.

---

## 0. Ek line me

NSE **F&O universe (~210 stocks)** ka data dashboard — **pure math/stats, no indicators**,
educational/research tool. **v2.0 me:** EOD history + **live tick data** (broker WebSocket)
ka hybrid, sab kuch **live calculate**.

## 1. v2.0 kya hai (vision) — v1 se alag kaise

| | v1 (current) | **v2.0 (ye)** |
|---|---|---|
| Data | EOD bhavcopy (din me 1 baar) | **EOD history + LIVE tick** (broker WebSocket) |
| Calc | batch (roz ek baar) | **streaming/rolling** (live) + batch history |
| PCR/OI/premium/movers | EOD | **live** (feed se) |
| Delivery% / FII-DII | EOD | EOD hi (inka live data hota hi nahi) |
| UI | static per rerun | **live section** `st.fragment(run_every="2s")` + EOD sections |
| Source | NSE free archive | NSE free (history) **+ DhanHQ API** (live WebSocket + Option-Chain REST) |

**v2.0 ka core:** market band ho to EOD dashboard; market khula ho to **live overlay**
(price/OI/PCR/premium/buildup real-time). Delivery + participant hamesha EOD (wo data hi
shaam ko aata).

## 2. v1 ne kya deliver kiya (v2.0 isko reuse kare, dobara na banaye)

- ✅ NSE archive se **EOD ingestion** (equity+delivery+F&O+participant), incremental,
  resume-safe, holiday-aware, split/bonus-adjust. → `fetch_*.py`, `db.py`, `holidays.py`
- ✅ **6-table SQLite** (`prices/futures/options/participant/stats/ingest_log`), ~18M rows.
- ✅ **Pure-math analysis** (returns, vol, beta, Sharpe, drawdown, z-score, CAGR, skew,
  kurtosis, PCR, max-pain, futures premium). → `analysis.py`
- ✅ **QuantCalc dark dashboard** — 6 sections (Equity/Futures/Options/Participant/Math
  stats/Next-day shortlist), sidebar nav, Sensibull option chain, participant sentiment
  bars, backtest screener. → `dashboard.py`, `.streamlit/config.toml`
- ✅ Automation (Task Scheduler/cron), AWS deploy, cleanup, docs.

> **Full spec:** [`ARCHITECTURE.md`](ARCHITECTURE.md). **Live migration blueprint:**
> [`LIVE_DATA.md`](LIVE_DATA.md). **User guide:** [`GUIDE.md`](GUIDE.md).

## 3. v2.0 goals (priority order)

1. **Live layer** — **DhanHQ WebSocket** subscriber (`stream.py`, Full mode for OI) →
   current-day state (LTP, day OHLC, volume, **OI/chg_OI**) in a fast store (Redis /
   in-memory + snapshot). Full-chain PCR/max-pain via **DhanHQ Option-Chain REST** (poll).
2. **Live calc** (`live_calc.py`) — timer (1–5s) pe: live PCR, OI buildup, futures premium,
   intraday movers; + hybrid stats (EOD history + aaj ka live price).
3. **Live dashboard section** — `st.fragment(run_every="2s")`, live store se read, EOD
   sections waise ke waise.
4. **Graceful market-hours handling** — 9:15–15:30 IST live; baaki EOD/last-snapshot.
5. **EOD backfill** din ke end pe live day ko `nse.db` history me merge.

**Sabse practical pehla milestone:** free broker (Upstox/Angel) se **near-ATM strikes +
futures** ka live LTP/OI stream → ek chhota live section (PCR + buildup + premium +
movers). ~80% value, 20% effort.

## 4. Tech stack & conventions (v2.0)

- **Python 3.11+** (Windows: `python`, `python3` nahi — Store alias issue). `pandas`,
  `numpy`, `streamlit`, `plotly`, `requests` + **`dhanhq`** (CHOSEN live source — DhanHQ:
  WebSocket Full-mode OI + 25k instrument cap + Option-Chain REST) + optional **Redis**.
  Live details: [`LIVE_DATA.md`](LIVE_DATA.md) §9.
- **Store:** EOD = SQLite `nse.db` (WAL). Live = Redis ya in-memory (SQLite tick-throughput
  handle nahi karti).
- **UI:** Streamlit + Plotly, QuantCalc dark theme (`.streamlit/config.toml` — Outfit font,
  indigo #6366f1 / purple #a855f7, bg #070a13). Custom-HTML tables via
  `st.markdown(unsafe_allow_html=True)`; live section = `st.fragment`.
- **Code style:** vectorized (no per-row loops in analysis), Hinglish captions in UI,
  functions cached `@st.cache_data(ttl=...)` (live parts short TTL / fragment).

## 5. NON-NEGOTIABLE rules (v1 se seekhe, v2.0 me bhi)

1. **Pure math / statistics only — NO technical indicators** (koi RSI/MACD/MA nahi).
2. **Educational / research tool — trading advice NAHI.** Har predictive feature pe
   prominent disclaimer (jaise Next-day shortlist). Personalized advice mat do.
3. **Data source honesty:** NSE archive **EOD-only**; live = **broker API** (paid/authed),
   free NSE se live nahi milta. Delivery% + FII/DII **hamesha EOD**.
4. **Split/bonus adjust** (close-ratio <0.6 / >1.6) — warna fake −90% crash.
5. **Direct NSE archive URLs** (browser UA headers) — `nsepython` historical toota hua hai.
6. **Incremental + resume-safe + holiday-aware** ingestion (no dup, no gap).

## 6. Key commands

```bash
pip install -r requirements.txt        # deps (+ broker SDK, redis for v2)
python db.py                           # empty nse.db (schema)
python run_daily.py                    # backfill/EOD update (2024-01-01 → today)
streamlit run dashboard.py             # dashboard @ localhost:8501
python cleanup_orphans.py              # prune exited-F&O data + VACUUM
# v2.0 (naye):
python stream.py                       # live WebSocket subscriber (market hours)
```

## 7. Gotchas (v1 me jo phasa tha — v2.0 me dohrao mat)

- `nsepython` historical → 404/KeyError. **Direct archive URLs** use karo.
- Options table (~18M rows) poori load → **OOM**. Sirf latest/needed date query karo.
- numpy scalar SQLite me **BLOB** ban jaata → native `int()/float()` cast.
- Windows console **cp1252** emoji pe crash → `sys.stdout.reconfigure(encoding="utf-8")`.
- Streamlit custom-HTML tables newer versions me strip ho sakti — verify on deploy version.
- VACUUM WAL mode me WAL bloat karta → checkpoint(TRUNCATE) phir DELETE-mode VACUUM.
- F&O universe badalta (stocks enter/exit) → equity sirf current universe ka; purane F&O
  ka orphan data `cleanup_orphans.py` se saaf.
- Exited-F&O stocks: futures/options me reh jaate par prices me nahi → dropdown me nahi.

## 8. v2.0 shuru kaise karein (fresh project)

1. Is repo ko **base** lo (v1 working EOD system) — ya alag repo me copy karke `v2` banao.
2. Broker account + API key (Upstox/Angel free se shuru).
3. `stream.py` → subscribe near-ATM + futures tokens → live store.
4. `live_calc.py` → live PCR/buildup/premium/movers.
5. `dashboard.py` me ek **"🔴 Live" section** — `st.fragment(run_every="2s")`.
6. Test off-market (replay) → phir live.

**Module rebuild order (v1 base):** config → db → holidays → universe → fetch_* →
analysis → run_daily → dashboard → **(v2) stream → live_calc → live section**.

---

*v2.0 = v1 (proven EOD base) + live overlay. Delivery aur FII/DII kabhi live nahi honge —
wo EOD data hi hai. Baaki market-data (price/OI/PCR/premium) live ho sakta broker feed se.*
