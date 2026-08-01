# ⚡ LIVE_DATA — EOD se Live Tick Data me convert kaise karein

Abhi project **EOD (end-of-day) batch** hai — din me ek baar NSE bhavcopy fetch hoti hai.
Ye doc batata hai ki **live / real-time tick data** pe kaise le jaana hai, **sab kuch live
calculate** karne ke liye kya-kya badalna padega, aur kya feasible hai (honestly).

---

## 1. Sabse pehle: NSE free data LIVE nahi hai ⚠️

- NSE ka **public archive (jo hum use karte hain) sirf EOD hai** — poora din ka data
  market band hone ke baad (~6 PM) publish hota hai. **Real-time tick isme milta hi nahi.**
- Live tick (LTP, volume, OI har second) ke liye **broker API ya paid data vendor** chahiye
  (demat/trading account ke saath). Ye **free NSE se replace nahi hota** — ye ek naya
  paid/authenticated data source hai.

## 2. Live data source options (ek chunna padega)

| Source | Cost | Kya deta | Notes |
|---|---|---|---|
| **Zerodha Kite Connect** | ~₹2,000/mo | WebSocket ticks: LTP, day OHLC, volume, **OI (F&O)**, market depth | Sabse popular, reliable, ~3000 instruments/connection |
| **Upstox API** | Free (account ke saath) | WebSocket ticks + OI | Free tier acchi |
| **Angel One SmartAPI** | Free | WebSocket ticks + OI | Free, thoda rate-limited |
| **Fyers / Dhan API** | Free/low | ticks + OI | Similar |
| **TrueData / GlobalDatafeeds** | Paid vendor | tick + historical + full-market | Data vendor (broker nahi), bulk symbols |

> Sab **WebSocket streaming** dete hain (subscribe karo → har tick push hota hai) + REST
> (snapshot/historical). **OI live** F&O feed me aata hai — PCR/buildup live ho sakte.

**👉 Is project ke liye CHOSEN: DhanHQ** (25,000 instrument capacity + OI live + Option-Chain
REST). Poori details neeche **section 9** me.

## 3. Kya live ho sakta, kya EOD hi rahega (honest)

| Data | Live possible? | Kyun |
|---|---|---|
| LTP, day OHLC, Volume | ✅ Live | Feed me aata |
| **OI, Chg OI (F&O)** | ✅ Live | Feed me aata → live PCR, buildup, premium |
| Futures premium (fut − spot) | ✅ Live | dono live |
| Intraday returns, live rank | ✅ Live | live price se |
| **Delivery %** | ❌ EOD only | Delivery data market band ke baad hi aata |
| **FII/DII/Participant** | ❌ EOD only | NSCCL report shaam ko publish hoti — koi live feed nahi |
| Beta, hist. volatility, CAGR, drawdown, z-score, 52w %ile | ⚠️ Hybrid | Inko **history** chahiye → EOD history + aaj ka live price |

**Nateeja:** "Market data" (price/volume/OI) live ho sakta; "delivery + participant +
long-history stats" inherently EOD/hybrid rahenge. Isliye best = **hybrid** (neeche).

## 4. Recommended architecture — HYBRID (EOD history + live overlay)

```
        ┌─────────────── EOD layer (jaisa abhi hai, rakho) ───────────────┐
        │  NSE archive → nse.db (history + stats + participant + delivery) │
        └──────────────────────────────────────────────────────────────────┘
                                     +
        ┌─────────────── LIVE layer (naya) ──────────────────────────────┐
        │  Broker WebSocket ──▶ tick handler ──▶ live store (Redis/in-mem) │
        │       (LTP, vol, OI)      (rolling calc)   current-day state      │
        └──────────────────────────────────────────────────────────────────┘
                                     │
                          Dashboard merge: history (nse.db) + live (store)
```

- **EOD layer** waisa hi — history, participant, delivery, base stats.
- **LIVE layer** = ek **alag long-running process** (Streamlit se alag) jo market-hours me
  WebSocket subscribe karta hai aur current-day state (LTP, day OHLC, volume, OI, chg_OI)
  maintain karta hai + rolling metrics update karta hai.
- **Dashboard** dono ko merge karke dikhata hai (history + aaj live).

## 5. Component-by-component changes

**a) Ingestion — `fetch_*` → streaming subscriber**
- Naya module `stream.py`: broker SDK se connect, symbols subscribe (token list),
  `on_ticks(ticks)` callback me har tick handle karo.
- Har tick → live store update (symbol → {ltp, o/h/l, vol, oi, chg_oi, ts}).
- Reconnect/heartbeat logic (WebSocket drop hota hai), sirf market-hours (9:15–15:30 IST).

**b) Storage — SQLite kaafi nahi, live ke liye**
- SQLite tick write-throughput handle nahi kar sakti (hazaaron writes/sec).
- **Live store options:** Redis (fast key-value, pub/sub), ya **in-memory dict/pandas**
  (single process) + har N-second **snapshot** parquet/SQLite me.
- EOD `nse.db` waisa hi rahe (history). Din ke end pe live day ka final snapshot → nse.db
  me daily row (taaki history complete rahe).

**c) Calculations — batch → streaming/rolling**
- **Live (feed se seedha):** PCR = Σ live PE OI / Σ live CE OI · OI buildup (live price chg
  + live chg_OI) · futures premium (live fut − live spot) · intraday return · live movers.
- **Hybrid (history + live):** beta/vol/drawdown/z-score/52w%ile — inke liye EOD history
  series lo, uske aage **aaj ka live price** append karke recompute (har N-second, poore
  tick pe nahi — throttle).
- Rolling engine: har tick pe nahi, ek **timer (e.g. 1–5 sec)** pe recompute (varna CPU
  bhar jayega). Vectorized rakho.

**d) Dashboard — Streamlit real-time limits**
- Streamlit true real-time ke liye nahi bana. 3 options:
  1. **`st.fragment(run_every="2s")`** — sirf live wale hisse ko har 2s auto-rerun karo
     (baaki page static). **Sabse pragmatic.**
  2. **`streamlit-autorefresh`** package — poora page interval pe refresh.
  3. **Proper real-time stack** (agar sub-second chahiye): FastAPI + WebSocket backend +
     React/Plotly-Dash frontend. Zyada kaam, par true live.
- Live store se read fast hona chahiye (Redis/in-mem), warna har refresh slow.

## 6. Migration roadmap (steps)

1. **Broker account + API key** lo (Zerodha/Upstox/Angel). Instrument token list samjho.
2. `pip install` broker SDK (`kiteconnect` / `upstox-python-sdk` / `smartapi-python`).
3. **`stream.py`** likho: WebSocket connect → subscribe (liquid F&O tokens) → `on_ticks`
   → live store update. Market-hours + reconnect handle karo.
4. **Live store:** Redis install (ya in-memory dict) — current-day state rakho.
5. **`live_calc.py`:** timer pe (1–5s) live PCR/buildup/premium/movers + hybrid stats
   (history + live) compute → store me likhe.
6. **Dashboard me live section:** `st.fragment(run_every="2s")` — live store se read karke
   current values dikhao (EOD sections waise ke waise).
7. **End-of-day:** live day ka final snapshot `nse.db` ki daily rows me merge (history
   continue), phir purana EOD `run_daily.py` waise hi chale (backup/verify).
8. Test off-market (broker "replay"/historical feed se), phir live market me.

## 7. Challenges (dhyan rakho)

- **Cost:** Kite ~₹2000/mo; free brokers (Upstox/Angel) me rate-limits/symbol-caps.
- **Symbol cap:** ek connection ~3000 tokens subscribe kar sakta. F&O me har stock ke
  bahut strikes → sirf **near-ATM strikes + futures** subscribe karo (sab nahi).
- **Throughput:** liquid F&O me hazaaron ticks/sec — buffer + throttle karo, har tick pe
  recompute mat karo.
- **Resilience:** WebSocket drop, market halts, auth-token daily expiry (broker) handle karo.
- **Streamlit:** fragment refresh + heavy custom-HTML tables slow ho sakte — live section
  chhota/light rakho (metrics + ek chhoti table), heavy tables EOD me.
- **Market hours only:** live sirf 9:15–15:30 IST; baaki time EOD/last-snapshot dikhao.
- **Storage:** raw ticks store karna (audit/replay) = GB/din — sirf snapshots rakho, raw
  ticks parquet me rotate/discard karo.

## 8. Feasibility summary

| Chahiye | Free? | Effort |
|---|---|---|
| Live LTP/Vol/OI/PCR/premium (near-ATM + futures) | ⚠️ broker account (free tier possible) | Medium — `stream.py` + fragment |
| Full-chain live (saare strikes) | ❌ paid/high (symbol cap) | High |
| Delivery% / FII-DII live | ❌ impossible (EOD data hi hai) | — |
| Sub-second true real-time UI | ⚠️ FastAPI+React stack | High |

**Sabse practical pehla step:** free broker (Upstox/Angel) API se **near-ATM strikes +
futures ka live LTP/OI** stream karo, ek `st.fragment(run_every="2s")` live section banao
jo live PCR + buildup + premium + movers dikhaye — baaki poora EOD dashboard waisa hi rahe.
Ye ~80% value 20% effort me deta.

---

## 9. DhanHQ — chosen live source (concrete)

Docs: [docs.dhanhq.co/api/v2](https://docs.dhanhq.co/api/v2/) ·
[Live Market Feed](https://docs.dhanhq.co/api/v2/guides/live-market-feed) ·
[Option Chain](https://docs.dhanhq.co/api/v2/option-chain/get-option-chain) ·
[Rate limits](https://docs.dhanhq.co/api/v2/guides/rate-limits)

### a) Live Market Feed (WebSocket)
- **Endpoint:** `wss://api-feed.dhan.co?version=2&token=<access-token>&clientId=<client-id>&authType=2`
- **3 modes** (RequestCode se choose):
  - **Ticker** — LTP + last-trade-time (lightest)
  - **Quote** — LTP + day **OHLC + volume** + ATP + buy/sell qty
  - **Full** — Quote **+ OI + market depth (5 levels)** ← **F&O ke liye (OI live)**
- **Response = binary packets** (Little Endian): 8-byte header + payload → parse karna padta
  (ya `dhanhq` Python lib use karo, wo handle karti).
- **Subscribe:** JSON message, `RequestCode` + `InstrumentList` (`ExchangeSegment` +
  `SecurityId`). **Max 100 instruments per message** (multiple messages bhej sakte).
- **Keepalive:** server 10s ping; 40s no-pong → disconnect (auto-pong via lib).

### b) 🔥 Capacity (Kite se behtar)
> **5 WebSocket connections/user × 5000 instruments each = 25,000 instruments.**
> Isliye ~210 spot + ~630 futures + **kaafi saare option strikes** live cover ho sakte —
> "sirf near-ATM" ki majboori nahi.

### c) 🔥 Option Chain REST (killer feature)
Ek underlying+expiry ka **poora chain (saare strikes): OI + Greeks + IV + LTP + volume**
ek REST call me. → **Live PCR / max-pain / full chain** ke liye har strike WebSocket pe
subscribe karne ki zaroorat NAHI — bas ye REST **poll** karo (rate-limit ke hisaab se).

### d) Support
- **Historical OHLC (REST)** — backfill (ya hamara NSE EOD chalta rahe).
- **Instruments/scrip master** — `SecurityId` + `ExchangeSegment` (NSE_EQ / NSE_FNO...) =
  hamara symbol→token mapping.
- **Auth:** access token (Dhan portal) + `clientId`, `authType=2`. Token expiry → refresh.
- **Python lib:** `pip install dhanhq` (WebSocket connect + binary parse + REST wrappers).

### e) Feature → DhanHQ mapping

| Hamara feature | DhanHQ se |
|---|---|
| Live LTP / day OHLC / volume | WebSocket **Quote/Full** |
| **Live OI + Chg OI** (fut + opt) | WebSocket **Full** |
| Live futures **premium** | fut LTP − spot LTP (dono live) |
| Live **PCR / max-pain / full chain** | **Option Chain REST** (poll) |
| Live movers / intraday returns | live LTP + EOD prev-close |
| History / base stats | EOD `nse.db` + aaj ka live |
| Delivery % / FII-DII | ❌ EOD hi (Dhan me bhi nahi — data hi EOD hai) |

### f) Architecture (Dhan hybrid)
```
DhanHQ WebSocket (Full) ─▶ ~210 spot + ~630 futures + near-ATM options ─▶ live store
DhanHQ Option Chain REST ─▶ (poll) full-chain PCR / max-pain per focus stock
NSE EOD → nse.db ─────────▶ history + delivery + FII/DII (jaisa hai)
Dashboard: st.fragment(run_every="2s") = live store + REST + nse.db merge
```

### g) Caveats
- **Binary parsing** (ya `dhanhq` lib). Access token **daily-ish refresh**.
- **Rate limits** — Option-Chain REST + other endpoints pe (docs `/guides/rate-limits`) →
  poll frequency uske hisaab se.
- **Delivery% + FII/DII kabhi live nahi** — NSE ke EOD reports, koi API live nahi de sakti.

---

*Base architecture (EOD): [`ARCHITECTURE.md`](ARCHITECTURE.md). Ye doc us par live layer
overlay karne ka blueprint hai. v2.0 kickoff: [`Claude2.0.md`](Claude2.0.md).*
