// REST + WS base. Frontend runs on host; backend published at localhost:8000.
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
export const WS_URL = API_URL.replace(/^http/, 'ws')

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export type Health = { status: string; db: boolean; redis: boolean }
export type Universe = { count: number; underlyings: string[] }

export type Candle = {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}
export type History = {
  symbol: string
  interval: string
  count: number
  candles: Candle[]
}

export type Live = {
  symbol: string
  ltp: number
  prev_close: number
  chg: number
  chg_pct: number
  ts: string
  mock: boolean
}

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
export type Chain = {
  symbol: string
  spot: number
  atm: number
  expiry_days: number
  pcr: number
  max_pain: number
  futures_premium: number
  total_ce_oi: number
  total_pe_oi: number
  strikes: ChainRow[]
  mock: boolean
}
