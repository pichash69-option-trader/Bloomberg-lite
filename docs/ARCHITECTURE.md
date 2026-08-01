# 🏗️ ARCHITECTURE — NSE F&O Dashboard (Rebuild Spec)

Is document se poora project **zero se dobara banaya** ja sakta hai — data sources,
DB schema, pipeline, calculations, dashboard, automation, deployment — sab.
(Live/real-time me convert karne ke liye alag doc: [`LIVE_DATA.md`](LIVE_DATA.md).)

---

## 1. Goal & principles

- **Kya:** Poora NSE **F&O universe (~210 stocks)** ka **date-wise** data analysis dashboard.
- **Data:** Sirf **NSE official free data**, 1-Jan-2024 se aaj tak, roz auto-update.
- **Analysis:** **Pure mathematics / statistics only** — koi technical indicator nahi
  (no RSI/MACD/moving-average). Returns, volatility, beta, Sharpe, drawdown, z-score,
  CAGR, skew/kurtosis, PCR, max-pain, OI buildup, participant sentiment.
- **Self-hosted:** local PC (Windows) + optional AWS EC2. Code-only repo; har user
  apni `nse.db` khud generate karta hai.

## 2. Tech stack

| Layer | Tool |
|---|---|
| Language | Python 3.11+ |
| Fetch | `requests` (direct NSE archive URLs + browser User-Agent headers) |
| Store | SQLite (single file `nse.db`, WAL mode) |
| Compute | `pandas`, `numpy` (vectorized, no per-row loops) |
| UI | `streamlit` + `plotly` (dark QuantCalc theme via `.streamlit/config.toml`) |
| Schedule | Windows Task Scheduler / Linux cron |

> **Important:** `nsepython` ke historical functions NSE ke 2024 URL-change se toot gaye
> (404/KeyError) — isliye **direct archive URLs** use karte hain (neeche).

## 3. Data sources (NSE archives — exact)

Sab GET requests ko **browser User-Agent headers** chahiye (warna NSE block karta hai).
Weekend/holiday pe 404 aata hai.

| Dataset | URL pattern | Notes |
|---|---|---|
| Equity bhavcopy | `nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{YYYYMMDD}_F_0000.csv.zip` | "udiff" format; `SctySrs=EQ` filter |
| Delivery (MTO) | `nsearchives.nseindia.com/archives/equities/mto/MTO_{DDMMYYYY}.DAT` | delivery qty + % |
| F&O bhavcopy | `nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_{YYYYMMDD}_F_0000.csv.zip` | `FinInstrmTp`: STF=stock-fut, STO=stock-opt (IDF/IDO index skip) |
| Participant OI | `nsearchives.nseindia.com/content/nsccl/fao_participant_oi_{DDMMYYYY}.csv` | FII/DII/Pro/Client/TOTAL |
| Participant Vol | `nsearchives.nseindia.com/content/nsccl/fao_participant_vol_{DDMMYYYY}.csv` | same 5 rows |
| Holidays | `nseindia.com/api/holiday-master?type=trading` | CM segment = equity holidays |

**Bhavcopy udiff columns:** `TradDt, TckrSymb, OpnPric/HghPric/LwPric/ClsPric, PrvsClsgPric,
SttlmPric, TtlTradgVol, TtlTrfVal, TtlNbOfTxsExctd, XpryDt, StrkPric, OptnTp (CE/PE),
OpnIntrst, ChngInOpnIntrst, UndrlygPric, FinInstrmTp`. (No VWAP in archive.)

## 4. Data model (SQLite — 6 tables)

```sql
prices(symbol, date, open, high, low, close, prev_close, settle,
       volume, turnover, num_trades, deliv_qty, deliv_pct, PK(symbol,date))

futures(symbol, date, expiry, open, high, low, close, settle,
        contracts, value_lakh, oi, chg_oi, PK(symbol,date,expiry))

options(symbol, date, expiry, strike, opt_type,           -- opt_type = CE/PE
        open, high, low, close, settle, contracts, volume, value_lakh,
        oi, chg_oi, PK(symbol,date,expiry,strike,opt_type))

stats(symbol, date, daily_return, cum_return, mean_return, volatility,
      ann_volatility, sharpe, max_drawdown, beta, zscore, pct_rank_52w,
      cagr, skew, kurtosis, put_call_ratio, total_oi, oi_change,
      futures_premium, PK(symbol,date))            -- latest snapshot only

participant(date, metric, client_type,               -- metric = oi/vol
      fut_idx_long/short, fut_stk_long/short,
      opt_idx_call_long/put_long/call_short/put_short,
      opt_stk_call_long/put_long/call_short/put_short,
      total_long, total_short, PK(date,metric,client_type))

ingest_log(dataset, date, rows, status, PK(dataset,date))  -- status: ok/holiday/pending/error
```
Indexes on `date` for prices/futures/options + `options(symbol,date,expiry)`.
Scale: ~635 trading days, 210 stocks, ~18M option rows, ~3.4 GB.

## 5. Ingestion pipeline (incremental, resume-safe, holiday-aware)

**Modules:**
- `config.py` — `UNIVERSE="FNO"`, `START_DATE="2024-01-01"`, HEADERS (browser UA), delays.
- `db.py` — schema + `done_dates(dataset)` (dates with status ok/holiday) + `log_ingest()`.
- `universe.py` — `fno_universe()` = ~210 STF symbols derived from latest F&O bhavcopy.
- `holidays.py` — `trading_holidays()` + `is_holiday(iso)` from NSE calendar.
- `fetch_data.py` — equity + delivery → `prices`.
- `fetch_fno.py` — futures (STF) + options (STO) → `futures`, `options`.
- `fetch_participant.py` — FII/DII/Pro/Client → `participant`.

**Resume logic (per dataset):**
```
done = done_dates(dataset)                # ok + holiday (pending/error retried)
for d in 2024-01-01 .. today:
    if d not in done:
        if weekend or is_holiday(d):  log 'holiday'
        else fetch; 404-on-trading-day → 'pending' (retry next run); ok → 'ok'
INSERT OR REPLACE  → no duplicates, no gaps
```
**Split/bonus:** NSE `prev_close` split-adjusted nahi hota → close-ratio `<0.6` ya `>1.6`
detect karke back-adjust (fake −90% crash hataata). Latest price untouched.

## 6. Analysis layer (`analysis.py`) — formulas

Split-adjusted daily return `r = close_t / close_{t-1} − 1`.

| Metric | Formula |
|---|---|
| Cumulative return | `close_last/close_first − 1` |
| CAGR | `(close_last/close_first)^(365/span_days) − 1` |
| Volatility (daily) | `std(r)` · Ann = `× √252` |
| Sharpe | `mean(r)/std(r)` (rf=0, daily) |
| Max drawdown | `min(close/cummax − 1)` |
| Beta | `cov(r_stock, r_mkt)/var(r_mkt)`; mkt = equal-weighted mean of all stocks' returns (NIFTY proxy) |
| Z-score | `(last_close − mean_close)/std_close` |
| 52w %ile | % of last 252 closes below latest |
| Skew / Kurtosis | `r.skew()`, `r.kurt()` |
| PCR | `Σ PE OI / Σ CE OI` (latest date) |
| Total OI / OI chg | Σ futures oi / chg_oi |
| Futures premium | near-month future close − spot |
| Max pain | strike minimizing option-writer payout |

`fno_stats()` sirf **latest date** load karta hai (whole options table OOM karti thi).
`run()` sabko `stats` table me likhta hai (numpy scalar → native cast, warna BLOB).

## 7. Dashboard (`dashboard.py`) — QuantCalc dark theme

- **Theme:** `.streamlit/config.toml` (Outfit font, indigo #6366f1 / purple #a855f7,
  bg #070a13, glass cards). Sidebar navigation (not tabs), live top-movers ticker.
- **Sidebar nav = 6 sections** (5 data-types + 1 screener):

| Section | Table | Kya |
|---|---|---|
| 📈 Equity / Cash | prices | daily OHLCV + Prev Close + Settle + Deliv Qty/% + candle |
| 🔮 Futures | futures | all expiries + premium + Σ total + est. participant split |
| ⛓️ Options | options | Sensibull sum-chain + per-expiry chains (OHLC/settle/turnover inside) + PCR + max pain |
| 🏦 Participant | participant | FII/DII/Pro/Client **sentiment** (OI+Vol, Bearish‹—›Bullish bars) + trend + cumulative flow |
| 📊 Math stats | stats | all-stock table (18 metrics + 1W/1M returns), sortable, sticky Symbol/header |
| 🎯 Next-day shortlist | (computed) | Momentum + Mean-reversion top-3 up/down + backtest hit-rate + date slider (past results ✓/✗) |

- **Render pattern:** custom HTML tables via `st.markdown(..., unsafe_allow_html=True)`
  (colored pills, OI bars, sentiment bars). Charts via Plotly.
- **Caching:** `@st.cache_data(ttl=300)` on all queries.

## 8. Automation & deployment

- `run_daily.py` — 4 steps: equity → F&O → participant → stats. Logs to file.
  `sys.stdout.reconfigure(encoding="utf-8")` (Windows cp1252 fix).
- **Windows:** `run_daily.bat` via Task Scheduler daily ~6:45 PM IST. `run_dashboard.bat`.
- **AWS EC2 (Ubuntu):** `setup_server.sh` → venv + cron (`@reboot` dashboard+update, `30 18 * * *` daily). Timezone Asia/Kolkata. Elastic IP, port 8501.
- `cleanup_orphans.py` — exited-F&O stocks ka orphan futures/options prune + VACUUM.

## 9. File map

```
config.py  db.py  universe.py  holidays.py          # setup + schema + helpers
fetch_data.py  fetch_fno.py  fetch_participant.py    # ingestion
analysis.py                                          # math + F&O stats
cleanup_orphans.py                                   # maintenance
dashboard.py  .streamlit/config.toml                 # UI + theme
run_daily.py  run_daily.bat  run_dashboard.bat       # automation (Windows)
setup_server.sh  task_scheduler_setup.txt            # automation (Linux/AWS + guide)
requirements.txt                                     # deps
README.md  GUIDE.md  ARCHITECTURE.md  LIVE_DATA.md  PLAN.md   # docs
```

## 10. Rebuild from scratch (steps)

1. `pip install -r requirements.txt` (streamlit, plotly, pandas, numpy, requests).
2. `python db.py` → empty `nse.db` with schema.
3. `python run_daily.py` → backfill 2024-01-01 → today (~1–2 hr, ~3–4 GB, resume-safe).
4. `streamlit run dashboard.py` → open `localhost:8501`.
5. Schedule `run_daily.py` daily after ~6 PM IST (Task Scheduler / cron).

**Rebuild order of modules:** config → db → holidays → universe → fetch_data →
fetch_fno → fetch_participant → analysis → run_daily → dashboard. Each is independent
and resume-safe; test each with a small date range first.

---

*Ye EOD (end-of-day) batch architecture hai. Live/real-time tick data ke liye →
[`LIVE_DATA.md`](LIVE_DATA.md).*
