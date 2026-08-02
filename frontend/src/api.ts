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

// ---- Option chain leg (per strike) ----
export type OptionLeg = {
  ltp: number
  oi: number
  volume: number
  iv: number
  delta: number
  gamma: number
  theta: number
  vega: number
  rho: number
}
export type ChainRow = { strike: number; ce: OptionLeg; pe: OptionLeg }

// ---- Live-math payload (Cash / Futures / Options), pushed every ~1.5s ----
export type CashLive = {
  ltp: number
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
}
export type FutLive = {
  ltp: number
  oi: number
  chg_oi: number
  premium: number
  premium_pct: number
  buildup: string
}
export type OptLive = {
  pcr: number
  max_pain: number
  atm: number
  total_ce_oi: number
  total_pe_oi: number
  ce_chg_oi: number
  pe_chg_oi: number
  atm_iv: number
  atm_ce_delta: number
  atm_pe_delta: number
  ce_buildup: string
  pe_buildup: string
  strikes: ChainRow[]
}
export type LiveState = {
  symbol: string
  ts: string
  mock: boolean
  cash: CashLive
  futures: FutLive
  options: OptLive
}
