import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getJSON, type Health, type Universe } from './api'
import LiveTerminal from './components/LiveTerminal'
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
  const match = (s: string) => s.toLowerCase().includes(q)
  const watched = all.filter((s) => watch.includes(s) && match(s))
  const rest = all.filter(match)

  const row = (sym: string) => (
    <div key={sym} className="flex items-center">
      <button
        onClick={() => toggleWatch(sym)}
        className={`px-1 text-sm ${
          watch.includes(sym) ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-400'
        }`}
        title="watchlist"
      >
        {watch.includes(sym) ? '★' : '☆'}
      </button>
      <button
        onClick={() => setSelected(sym)}
        className={`flex-1 rounded px-2 py-1.5 text-left text-sm transition ${
          selected === sym ? 'bg-indigo/20 text-indigo' : 'text-slate-300 hover:bg-white/5'
        }`}
      >
        {sym}
      </button>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-border bg-panel px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-indigo to-purple text-sm font-bold">
            B
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide">
              Bloomberg-lite <span className="text-indigo">· Live-Math Terminal</span>
            </div>
            <div className="text-[11px] text-slate-500">
              Cash · Futures · Options — live math, har ~1.5s · educational only
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                live ? 'animate-pulse bg-up' : 'bg-slate-600'
              }`}
            />
            {live ? `LIVE · ${health.data?.mode ?? 'mock'}` : 'idle'}
          </span>
          <span className="flex items-center gap-1.5">
            <Dot ok={!!health.data?.db} /> DB
          </span>
          <span className="flex items-center gap-1.5">
            <Dot ok={!!health.data?.redis} /> Redis
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Picker */}
        <aside className="flex w-56 shrink-0 flex-col overflow-hidden border-r border-border bg-panel/60">
          <div className="p-3 pb-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full rounded border border-border bg-black/30 px-2.5 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {watched.length > 0 && (
              <>
                <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-yellow-500/70">
                  Watchlist ({watched.length})
                </div>
                <div className="mb-3 space-y-0.5">{watched.map(row)}</div>
              </>
            )}
            <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Underlyings ({rest.length})
            </div>
            <div className="space-y-0.5">{rest.map(row)}</div>
            {uni.isLoading && <div className="px-2 text-sm text-slate-500">loading…</div>}
            {uni.isError && <div className="px-2 text-sm text-down">backend offline?</div>}
          </div>
        </aside>

        {/* Main panel */}
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {selected ? (
            <div>
              <div className="flex items-baseline justify-between">
                <h1 className="text-xl font-semibold">{selected}</h1>
                {live && (
                  <span className="font-mono text-[11px] text-slate-600">
                    updated {live.ts.slice(11, 19)} UTC
                  </span>
                )}
              </div>
              <LiveTerminal live={live} />
            </div>
          ) : (
            <div className="grid h-full place-items-center text-center">
              <div>
                <div className="text-2xl">⚡</div>
                <div className="mt-2 text-slate-400">Left se ek stock select karo</div>
                <div className="mt-1 text-xs text-slate-600">
                  Cash · Futures · Options — live math · backend {health.data?.status ?? '…'}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <footer className="border-t border-border bg-panel px-5 py-2 text-center text-[11px] text-slate-600">
        ⚠️ Educational / research tool — trading advice nahi. Data: DhanHQ.
      </footer>
    </div>
  )
}
