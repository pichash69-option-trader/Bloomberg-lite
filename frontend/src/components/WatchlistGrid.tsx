import { useQuery } from '@tanstack/react-query'
import { getJSON } from '../api'

type Snap = {
  symbol: string
  ltp: number
  chg_pct: number
  pcr: number
  buildup: string
  live: boolean
}

const BULL = ['Long Buildup', 'Short Covering']
const BEAR = ['Short Buildup', 'Long Unwinding']
function bCls(b: string): string {
  if (BULL.includes(b)) return 'text-up'
  if (BEAR.includes(b)) return 'text-down'
  return 'text-slate-500'
}

export default function WatchlistGrid({
  symbols,
  onSelect,
}: {
  symbols: string[]
  onSelect: (s: string) => void
}) {
  const { data } = useQuery({
    queryKey: ['snapshot', symbols.join(',')],
    queryFn: () =>
      getJSON<{ snapshots: Snap[] }>(
        `/snapshot?symbols=${encodeURIComponent(symbols.join(','))}`,
      ),
    enabled: symbols.length > 0,
    refetchInterval: 3000,
  })
  if (!symbols.length) return null

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        ★ Watchlist — live snapshot (3s)
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {(data?.snapshots ?? symbols.map((s) => ({ symbol: s }) as Snap)).map((snap) => (
          <button
            key={snap.symbol}
            onClick={() => onSelect(snap.symbol)}
            className="rounded-lg border border-border bg-panel p-3 text-left transition hover:border-indigo/50"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-200">{snap.symbol}</span>
              {snap.live && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-up" title="live" />
              )}
            </div>
            <div className="mt-1 font-mono text-base text-slate-300">
              {snap.ltp != null ? `₹${snap.ltp.toLocaleString('en-IN')}` : '—'}
            </div>
            <div
              className={`font-mono text-xs ${
                (snap.chg_pct ?? 0) >= 0 ? 'text-up' : 'text-down'
              }`}
            >
              {snap.chg_pct != null
                ? `${snap.chg_pct >= 0 ? '▲ +' : '▼ '}${snap.chg_pct.toFixed(2)}%`
                : ''}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">
                PCR <span className="font-mono text-slate-400">{snap.pcr ?? '—'}</span>
              </span>
              <span className={`font-medium ${bCls(snap.buildup ?? '')}`}>{snap.buildup}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
