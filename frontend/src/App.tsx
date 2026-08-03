import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getJSON, type Health, type Universe } from './api'
import LiveTerminal from './components/LiveTerminal'
import WatchlistGrid from './components/WatchlistGrid'
import MarketIndices from './components/MarketIndices'
import { useLive } from './hooks/useLive'

type Alert = {
  id: number
  symbol: string
  metric: 'LTP' | 'PCR' | 'Z'
  op: '>' | '<'
  value: number
  triggered?: boolean
  at?: string
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-up' : 'bg-down'}`}
      title={ok ? 'connected' : 'down'}
    />
  )
}

export default function App() {
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [watchOpen, setWatchOpen] = useState(false)
  const [watch, setWatch] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('watchlist') || '[]')
    } catch {
      return []
    }
  })
  useEffect(() => {
    localStorage.setItem('watchlist', JSON.stringify(watch))
  }, [watch])
  const toggleWatch = (s: string) =>
    setWatch((w) => (w.includes(s) ? w.filter((x) => x !== s) : [...w, s]))

  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => getJSON<Health>('/health'),
    refetchInterval: 5000,
  })
  const uni = useQuery({
    queryKey: ['universe'],
    queryFn: () => getJSON<Universe>('/universe'),
  })
  const live = useLive(selected)

  // ---- Alerts ----
  const [alerts, setAlerts] = useState<Alert[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('alerts') || '[]')
    } catch {
      return []
    }
  })
  useEffect(() => {
    localStorage.setItem('alerts', JSON.stringify(alerts))
  }, [alerts])
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([])
  const fire = (msg: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000)
  }
  useEffect(() => {
    if (!live) return
    const vals = { LTP: live.cash.ltp, PCR: live.options.pcr, Z: live.analytics.z_score }
    setAlerts((as) =>
      as.map((a) => {
        if (a.triggered || a.symbol !== live.symbol) return a
        const v = vals[a.metric]
        const hit = a.op === '>' ? v > a.value : v < a.value
        if (hit) {
          fire(`🔔 ${a.symbol} ${a.metric} ${a.op} ${a.value} (now ${v})`)
          return { ...a, triggered: true, at: new Date().toLocaleTimeString() }
        }
        return a
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.cash.ltp, live?.options.pcr])
  const [aMetric, setAMetric] = useState<'LTP' | 'PCR' | 'Z'>('LTP')
  const [aOp, setAOp] = useState<'>' | '<'>('>')
  const [aVal, setAVal] = useState(0)

  const all = uni.data?.underlyings ?? []
  const q = search.trim().toLowerCase()
  const matches = q ? all.filter((s) => s.toLowerCase().includes(q)).slice(0, 12) : []

  const pick = (s: string) => {
    setSelected(s)
    setSearch('')
    setWatchOpen(false)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-panel px-4 py-2.5">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-indigo to-purple text-sm font-bold">
            B
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold tracking-wide">
              Bloomberg-lite <span className="text-indigo">· Live-Math</span>
            </div>
            <div className="text-[10px] text-slate-500">Cash · Futures · Options · ~1.5s</div>
          </div>
        </div>

        {/* Search (stock picker) */}
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Search stock… (NIFTY, RELIANCE…)"
            className="w-full rounded border border-border bg-black/30 px-3 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo"
          />
          {matches.length > 0 && (
            <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-panel shadow-xl">
              {matches.map((sym) => (
                <div key={sym} className="flex items-center hover:bg-white/5">
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault()
                      toggleWatch(sym)
                    }}
                    className={`px-2 text-sm ${
                      watch.includes(sym) ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-400'
                    }`}
                    title="watchlist"
                  >
                    {watch.includes(sym) ? '★' : '☆'}
                  </button>
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pick(sym)
                    }}
                    className="flex-1 px-2 py-1.5 text-left text-sm text-slate-200"
                  >
                    {sym}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Watchlist tab */}
        <div className="relative">
          <button
            onClick={() => setWatchOpen((o) => !o)}
            className={`rounded px-3 py-1.5 text-sm ${
              watchOpen ? 'bg-indigo/20 text-indigo' : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            ★ Watchlist ({watch.length})
          </button>
          {watchOpen && (
            <div className="absolute right-0 z-50 mt-1 max-h-80 w-52 overflow-y-auto rounded-lg border border-border bg-panel p-1 shadow-xl">
              {watch.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500">
                  Khaali. Search se ☆ tap karke add karo.
                </div>
              ) : (
                watch.map((sym) => (
                  <div key={sym} className="flex items-center rounded hover:bg-white/5">
                    <button
                      onClick={() => pick(sym)}
                      className={`flex-1 px-2 py-1.5 text-left text-sm ${
                        selected === sym ? 'text-indigo' : 'text-slate-200'
                      }`}
                    >
                      {sym}
                    </button>
                    <button
                      onClick={() => toggleWatch(sym)}
                      className="px-2 text-slate-500 hover:text-down"
                      title="remove"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Alerts tab */}
        <div className="relative">
          <button
            onClick={() => setAlertsOpen((o) => !o)}
            className={`rounded px-3 py-1.5 text-sm ${
              alertsOpen ? 'bg-indigo/20 text-indigo' : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            🔔 Alerts ({alerts.length})
          </button>
          {alertsOpen && (
            <div className="absolute right-0 z-50 mt-1 w-72 rounded-lg border border-border bg-panel p-2 shadow-xl">
              <div className="mb-2 flex items-center gap-1 text-xs">
                <span className="text-slate-500">{selected ?? '(select stock)'}</span>
                <select
                  value={aMetric}
                  onChange={(e) => setAMetric(e.target.value as 'LTP' | 'PCR' | 'Z')}
                  className="rounded border border-border bg-black/30 px-1.5 py-1 text-slate-300"
                >
                  <option value="LTP">LTP</option>
                  <option value="PCR">PCR</option>
                  <option value="Z">Z-score</option>
                </select>
                <select
                  value={aOp}
                  onChange={(e) => setAOp(e.target.value as '>' | '<')}
                  className="rounded border border-border bg-black/30 px-1.5 py-1 text-slate-300"
                >
                  <option value=">">&gt;</option>
                  <option value="<">&lt;</option>
                </select>
                <input
                  type="number"
                  value={aVal}
                  onChange={(e) => setAVal(parseFloat(e.target.value) || 0)}
                  className="w-16 rounded border border-border bg-black/30 px-1.5 py-1 font-mono text-slate-200"
                />
                <button
                  disabled={!selected}
                  onClick={() =>
                    selected &&
                    setAlerts((as) => [
                      ...as,
                      { id: Date.now(), symbol: selected, metric: aMetric, op: aOp, value: aVal },
                    ])
                  }
                  className="rounded bg-indigo/20 px-2 py-1 text-indigo disabled:opacity-40"
                >
                  +
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto">
                {alerts.length === 0 ? (
                  <div className="px-1 py-2 text-xs text-slate-500">Koi alert nahi.</div>
                ) : (
                  alerts.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between border-t border-border/50 py-1 text-xs"
                    >
                      <span className="font-mono text-slate-300">
                        {a.symbol} {a.metric} {a.op} {a.value}
                      </span>
                      <span className="flex items-center gap-2">
                        {a.triggered ? (
                          <span className="text-up">✓</span>
                        ) : (
                          <span className="text-slate-600">•</span>
                        )}
                        <button
                          onClick={() => setAlerts((as) => as.filter((x) => x.id !== a.id))}
                          className="text-slate-500 hover:text-down"
                        >
                          ✕
                        </button>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Market indices — NIFTY · India VIX · Breadth */}
        <div className="ml-auto">
          <MarketIndices />
        </div>

        {/* Status */}
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                live ? 'animate-pulse bg-up' : 'bg-slate-600'
              }`}
            />
            {live ? `LIVE · ${health.data?.mode ?? 'mock'}` : 'idle'}
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <Dot ok={!!health.data?.db} /> DB
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <Dot ok={!!health.data?.redis} /> Redis
          </span>
        </div>
      </header>

      {/* Token-expired banner */}
      {health.data?.auth === false && (
        <div className="border-b border-down/40 bg-down/15 px-4 py-2 text-center text-sm text-down">
          🔑 DhanHQ token invalid/expired — real data ruk gaya. Naya token generate karke{' '}
          <code className="font-mono">.env</code> update karo, phir{' '}
          <code className="font-mono">docker compose up -d backend</code>.
        </div>
      )}

      {/* Main panel (full width) */}
      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        {selected ? (
          <div>
            <div className="flex items-baseline justify-between">
              <h1 className="text-xl font-semibold">
                {selected}
                <button
                  onClick={() => toggleWatch(selected)}
                  className={`ml-2 align-middle text-base ${
                    watch.includes(selected) ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-400'
                  }`}
                  title="watchlist"
                >
                  {watch.includes(selected) ? '★' : '☆'}
                </button>
              </h1>
              {live && (
                <span className="font-mono text-[11px] text-slate-600">
                  updated {live.ts.slice(11, 19)} UTC
                </span>
              )}
            </div>
            <LiveTerminal live={live} onSelect={setSelected} />
          </div>
        ) : watch.length > 0 ? (
          <div>
            <div className="mb-4 text-center">
              <div className="text-2xl">⚡</div>
              <div className="mt-1 text-sm text-slate-400">
                Upar search se stock chuno, ya watchlist se tap karo
              </div>
            </div>
            <WatchlistGrid symbols={watch} onSelect={setSelected} />
          </div>
        ) : (
          <div className="grid h-full place-items-center text-center">
            <div>
              <div className="text-2xl">⚡</div>
              <div className="mt-2 text-slate-400">Upar search se ek stock chuno</div>
              <div className="mt-1 text-xs text-slate-600">
                Cash · Futures · Options — live math · backend {health.data?.status ?? '…'}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-border bg-panel px-5 py-2 text-center text-[11px] text-slate-600">
        ⚠️ Educational / research tool — trading advice nahi. Data: DhanHQ.
      </footer>

      {/* Alert toasts */}
      <div className="pointer-events-none fixed right-4 top-20 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto rounded-lg border border-indigo/40 bg-panel px-4 py-2 text-sm text-slate-200 shadow-lg"
          >
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}
