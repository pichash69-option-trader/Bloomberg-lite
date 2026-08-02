// REST + WS base. Frontend runs on host; backend published at localhost:8000.
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
export const WS_URL = API_URL.replace(/^http/, 'ws')

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export type Health = { status: string; db: boolean; redis: boolean; mode: string }
export type Universe = { count: number; underlyings: string[] }

// ---- Market depth ----
export type DepthLevel = {
  bid_price: number
  bid_qty: number
  bid_orders: number
  ask_price: number
  ask_qty: number
  ask_orders: number
}

// ---- Option chain leg (per strike) ----
export type OptionLeg = {
  ltp: number
  prev_close: number
  oi: number
  prev_oi: number
  chg_oi: number
  volume: number
  iv: number
  bid: number
  ask: number
  delta: number
  gamma: number
  theta: number
  vega: number
  rho: number
}
export type ChainRow = { strike: number; ce: OptionLeg; pe: OptionLeg }

export type FutExpiry = { label: string; ltp: number; oi: number; premium: number }

export type OptDepthSide = {
  ltp: number
  bid: number
  ask: number
  oi: number
  depth: DepthLevel[]
}
export type OptDepth = { symbol: string; strike: number; ce: OptDepthSide; pe: OptDepthSide }

// ---- Live-math payload (Cash / Futures / Options), pushed every ~1.5s ----
export type CashLive = {
  ltp: number
  last_qty: number
  atp: number
  prev_close: number
  chg: number
  chg_pct: number
  open: number
  high: number
  low: number
  volume: number
  buy_qty: number
  sell_qty: number
  buy_pct: number
  bid: number
  ask: number
  spread: number
  upper_circuit: number
  lower_circuit: number
  depth: DepthLevel[]
}
export type FutLive = {
  ltp: number
  atp: number
  oi: number
  oi_day_high: number
  oi_day_low: number
  chg_oi: number
  premium: number
  premium_pct: number
  basis: number
  buildup: string
  depth: DepthLevel[]
  expiries: FutExpiry[]
}
export type OptLive = {
  pcr: number
  max_pain: number
  atm: number
  expiries: string[]
  total_ce_oi: number
  total_pe_oi: number
  ce_chg_oi: number
  pe_chg_oi: number
  atm_iv: number
  atm_ce_delta: number
  atm_pe_delta: number
  iv_skew: number
  net_delta: number
  net_gamma: number
  ce_buildup: string
  pe_buildup: string
  strikes: ChainRow[]
}
export type Analytics = {
  expected_move: number
  ci68: [number, number]
  ci95: [number, number]
  hist_vol_daily_pct: number
  z_score: number
  vwap_edge: number
  fut_theo_premium: number
  fut_fv_edge: number
}
export type LiveState = {
  symbol: string
  ts: string
  mock: boolean
  cash: CashLive
  futures: FutLive
  options: OptLive
  analytics: Analytics
}
