# 📈 Bloomberg-lite — Live-Math Terminal · DhanHQ Full-Data Plan

Single-purpose terminal: **ek stock → har ~1.5s → live math → outputs**, teeno
segments — **Cash · Futures · Options**. Sab **pure math / statistics** (educational,
trading advice nahi). **Data 100% real DhanHQ** — creds `.env` mein; sab kuch live market se.

---

## 0. Full data menu — DhanHQ se kya-kya milta

### 1️⃣ CASH MARKET (equity spot · NSE_EQ) — WebSocket **Full** / Quote REST
| Raw field | Kya |
|---|---|
| LTP · last_qty · LTT | last trade price/qty/time |
| ATP | average traded price (VWAP-jaisa) |
| Prev close · net change | |
| Day OHLC · Volume | |
| **Total Buy qty · Sell qty** | order-book pressure |
| **5-level depth** | har level: bid/ask price+qty+orders |
| Upper/Lower circuit | |
| Derived (hum) | buy/sell **pressure %**, spread, % of day-range, depth imbalance |
> ❌ Cash mein OI nahi (F&O only). Delivery% — EOD only.

### 2️⃣ FUTURES (near/next/far · NSE_FNO) — WebSocket **Full**
| Raw field | Kya |
|---|---|
| LTP · ATP · OHLC · Volume | |
| Buy/Sell qty | |
| **OI · day-high OI · day-low OI** | |
| Prev close · **Prev OI** | → Chg-OI |
| 5-level depth · circuit limits | |
| Derived (hum) | **Premium/Discount**, **basis**, **OI buildup** (Long/Short/Covering/Unwinding), multi-expiry roll |

### 3️⃣ OPTIONS (poora chain · CE & PE) — Option-Chain REST (+ expiry list)
| Raw field (per strike, CE & PE) | Kya |
|---|---|
| last_price · previous_close | premium |
| **oi · previous_oi** · volume · previous_volume | → Chg-OI |
| average_price | |
| **IV** | implied volatility |
| **Greeks Δ Γ Θ Vega** | Dhan-provided |
| top bid/ask price+qty | |
| security_id · underlying spot | |
| Expiry list | saari expiries |
| Derived (hum) | **PCR**, **max-pain**, CE/PE OI+chg+buildup, **IV skew**, **net Greeks exposure**, **Rho** (Black-Scholes) |

---

## 1. Full payload schema (har tick)
```
CASH:    ltp, last_qty, ltt, atp, prev_close, chg%, OHLC, volume,
         buy_qty, sell_qty, buy%, upper/lower circuit, depth[5]
FUTURES: ltp, atp, OHLC, volume, buy/sell qty, oi, oi_day_high/low,
         prev_oi, chg_oi, premium/disc, basis, buildup, depth[5],
         expiries[near/next/far]: {ltp, oi, premium}
OPTIONS: pcr, max_pain, atm, expiries[], total CE/PE OI + chg + buildup,
         iv_skew, net_delta, net_gamma,
         strikes[]: CE&PE → ltp, prev_close, oi, prev_oi, chg_oi, volume,
                    iv, delta, gamma, theta, vega, rho, bid, ask, buildup
```

## 2. Speed / rate-limit design
| Segment | Source | Update |
|---|---|---|
| Cash + Futures | WebSocket Full | real-time (~1s push) |
| Options chain | REST | **3s** (Dhan limit 1 req/3s per underlying+expiry) |
| Individual option strike (optional) | WebSocket Full | real-time |
| Bulk movers (optional) | market-quote REST | 1000 instr / 1s |

Per selected stock WS subscribe = **2** (equity + near future). Options via REST (har
strike subscribe nahi). Rate-limit safe.

## 3. Market-hours + honesty
- Live ticks sirf **9:15–15:30 IST** (Mon–Fri). Baaki: last snapshot.
- Option-chain REST + historical — **kabhi bhi**.
- ❌ Dhan se bhi nahi: per-stock **FII/DII**, **delivery%** (EOD), **PCR/max-pain ka past** (hum roz snapshot karke banate).

---

## 4. Build status — ✅ done (100% real DhanHQ data)

- **Instruments + history:** scrip-master → SecurityId map; real daily history backfill → `candles`.
- **Live feed:** `feed_ws.py` (WebSocket Full) drives sub-second cash + futures; options +
  circuit via option-chain/quote REST (3s). Redis → WS `/ws/live`.
- **Full outputs:** depth ladders, circuit, ATP, multi-expiry, IV-skew, net-greeks, chg-OI chain,
  OI walls, IV rank, Rho; analytics (expected-move/CI, z-score, beta, realised-vs-implied vol,
  VWAP / futures fair-value edge); order-flow & micro-price; buildup timeline.
- **Market context:** India VIX, breadth, movers heatmap (bulk quote, last-good cache).
- **Robustness:** WS auto-reconnect; token-expiry banner.

### Optional extras (future)
- Multi-expiry chain (near+next) · 20-level depth · near-ATM option strikes on WS · real
  futures/options OI history.

---

## 5. Files
```
backend/app/
  dhan_config.py   creds + client + has_creds() / mode()
  greeks.py        Black-Scholes + Δ Γ Θ Vega Rho
  live_math.py     buildup classify + chain metrics (PCR/max-pain/skew/net-greeks)
  feed.py          live feed → payload → Redis (WS ticks + option-chain REST)
  feed_ws.py       DhanHQ WebSocket (Full) manager → sub-second ticks
  history.py       real daily history backfill → candles
  instruments.py   scrip-master → SecurityId map
  main.py          REST (/health /universe /market) + WS /ws/live
frontend/src/
  components/LiveTerminal.tsx   Cash/Futures/Options full UI (tabs)
  components/MoversPanel.tsx    NIFTY-50 heatmap
  components/MarketIndices.tsx  NIFTY · India VIX · breadth
  hooks/useLive.ts             WS client → LiveState
  App.tsx                      tabs + live view
```

---

*Educational / research only. Data: DhanHQ (authenticated). Live = market-hours;
off-market = last snapshot + history.*
