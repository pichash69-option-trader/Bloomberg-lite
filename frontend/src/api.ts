// REST + WS base. Frontend runs on host; backend published at localhost:8000.
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

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
