import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getJSON, type Health, type Universe } from './api'
import LiveTerminal from './components/LiveTerminal'
import WatchlistGrid from './components/WatchlistGrid'
import { useLive } from './hooks/useLive'

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

        {/* Status */}
        <div className="ml-auto flex items-center gap-3 text-xs">
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
            <LiveTerminal live={live} />
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
    </div>
  )
}
