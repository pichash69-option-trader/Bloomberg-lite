# 📈 Bloomberg-lite — Live-Math Terminal · DhanHQ Full-Data Plan

Single-purpose terminal: **ek stock → har ~1.5s → live math → outputs**, teeno
segments — **Cash · Futures · Options**. Sab **pure math / statistics** (educational,
trading advice nahi). Ek hi payload contract mock aur real dono use karte — creds
daalte hi seamless swap.

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

## 4. Build phases (verify-able)

### R0 — Full schema + UI (mock, **abhi**, bina creds) 🟢
- `greeks.py` → Rho (already computed per-leg)
- Payload poora expand (upar schema); `mock_feed` sab fields generate kare
- `LiveTerminal` UI expand: **depth ladder**, circuit, ATP, multi-expiry futures,
  IV-skew, net-greeks, per-strike chg-OI/buildup/bid-ask/Rho
- *Verify: mock pe poora rich terminal*

### R1 — Real REST (creds, market-hours nahi chahiye) 🟡
- `dhan_config.get_dhan()` (ready)
- Real **option-chain** (`dhan.option_chain` + `expiry_list`) → map to shape, fallback mock
- Real **quote snapshot** (`dhan.quote_data`) cash+futures — off-market bhi last snapshot
- Auto-switch: creds ho → real, warna mock
- *Verify: asli PCR/greeks/IV + last quote (raat ko bhi)*

### R2 — Real WebSocket feed (creds + market-hours) 🟡
- `feed.py`: DhanHQ **MarketFeed(Full)** — equity + near future, background thread → Redis
- `live_manager`: select pe subscribe / swap pe unsubscribe
- Reconnect + token-expiry handling
- *Verify: market-hours mein asli live ticks*

### R3 — Extras (full ka full) 🟡
- Multi-expiry chain (near+next) · **20-level depth** · near-ATM option strikes WS pe live ·
  real **historical backfill**

---

## 5. Files
```
backend/app/
  dhan_config.py   creds + client + has_creds()/mode()    [ready]
  greeks.py        Black-Scholes + Δ Γ Θ Vega Rho          [ready]
  chain.py         synth_chain (mock) / build_real_chain (R1)
  live_math.py     buildup + derived (skew, net-greeks)
  mock_feed.py     synthetic full payload  (R0)
  feed.py          real DhanHQ MarketFeed → Redis          (R2)
  live_manager.py  subscribe/unsubscribe on select         (R2)
  main.py          WS /ws/live + REST
frontend/src/
  components/LiveTerminal.tsx   Cash/Futures/Options full UI
  hooks/useLive.ts             WS client → LiveState
  App.tsx                      picker + live view
```

---

*Educational / research only. Data: DhanHQ (authenticated). Live = market-hours;
off-market = last snapshot + history.*
