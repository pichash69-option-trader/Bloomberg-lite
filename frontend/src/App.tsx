import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getJSON, type Health, type Universe } from './api'
import CandleChart from './components/CandleChart'
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
              Bloomberg-lite <span className="text-indigo">· F&amp;O Terminal</span>
            </div>
            <div className="text-[11px] text-slate-500">
              NIFTY 50 · history + live · educational / research only
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <Dot ok={!!health.data?.db} /> DB
          </span>
          <span className="flex items-center gap-1.5">
            <Dot ok={!!health.data?.redis} /> Redis
          </span>
          <span className="rounded bg-black/30 px-2 py-1 font-mono text-slate-400">
            {health.data?.status ?? '…'}
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Picker */}
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-border bg-panel/60 p-3">
          <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Underlyings {uni.data ? `(${uni.data.count})` : ''}
          </div>
          <div className="space-y-0.5">
            {uni.data?.underlyings.map((sym) => (
              <button
                key={sym}
                onClick={() => setSelected(sym)}
                className={`w-full rounded px-2.5 py-1.5 text-left text-sm transition ${
                  selected === sym
                    ? 'bg-indigo/20 text-indigo'
                    : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                {sym}
              </button>
            ))}
            {uni.isLoading && <div className="px-2 text-sm text-slate-500">loading…</div>}
            {uni.isError && (
              <div className="px-2 text-sm text-down">backend offline?</div>
            )}
          </div>
        </aside>

        {/* Main panel */}
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {selected ? (
            <div>
              <div className="flex items-baseline justify-between">
                <h1 className="text-xl font-semibold">{selected}</h1>
                <span className="flex items-center gap-1.5 rounded bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      live ? 'animate-pulse bg-up' : 'bg-slate-600'
                    }`}
                  />
                  {live ? 'LIVE · mock' : 'connecting…'}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {/* LTP — live */}
                <div className="rounded-lg border border-border bg-panel p-4">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">
                    LTP
                  </div>
                  {live ? (
                    <>
                      <div
                        className={`mt-1 font-mono text-lg ${
                          live.chg >= 0 ? 'text-up' : 'text-down'
                        }`}
                      >
                        ₹{live.ltp.toFixed(2)}
                      </div>
                      <div
                        className={`text-xs ${
                          live.chg >= 0 ? 'text-up' : 'text-down'
                        }`}
                      >
                        {live.chg >= 0 ? '▲' : '▼'} {live.chg.toFixed(2)} (
                        {live.chg_pct.toFixed(2)}%)
                      </div>
                    </>
                  ) : (
                    <div className="mt-1 font-mono text-lg text-slate-600">—</div>
                  )}
                </div>
                {/* Placeholders — Phase 3 */}
                {['Premium', 'PCR', 'Max Pain'].map((k) => (
                  <div
                    key={k}
                    className="rounded-lg border border-border bg-panel p-4"
                  >
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">
                      {k}
                    </div>
                    <div className="mt-1 font-mono text-lg text-slate-600">—</div>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-lg border border-border bg-panel p-3">
                <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Price history — candle + volume
                </div>
                <CandleChart symbol={selected} />
              </div>
            </div>
          ) : (
            <div className="grid h-full place-items-center text-center">
              <div>
                <div className="text-2xl">📈</div>
                <div className="mt-2 text-slate-400">
                  Left se ek underlying select karo
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  Phase 0 scaffold · backend {health.data?.status ?? '…'}
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
