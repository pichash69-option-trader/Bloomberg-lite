import { useQuery } from '@tanstack/react-query'
import { getJSON } from '../api'

type Mover = { symbol: string; ltp: number; chg_pct: number }
type Market = { available: boolean; gainers?: Mover[]; losers?: Mover[] }

function List({
  title,
  items,
  onSelect,
  color,
}: {
  title: string
  items: Mover[]
  onSelect: (s: string) => void
  color: string
}) {
  return (
    <div>
      <div className={`mb-2 text-[11px] font-semibold uppercase tracking-wider ${color}`}>
        {title}
      </div>
      <div className="space-y-1">
        {items.map((m) => (
          <button
            key={m.symbol}
            onClick={() => onSelect(m.symbol)}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-panel px-3 py-2 transition hover:border-indigo/50"
          >
            <span className="text-sm font-medium text-slate-200">{m.symbol}</span>
            <span className="flex items-center gap-4 font-mono text-xs">
              <span className="text-slate-400">₹{m.ltp.toLocaleString('en-IN')}</span>
              <span className={color}>
                {m.chg_pct >= 0 ? '▲+' : '▼'}
                {m.chg_pct.toFixed(2)}%
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function MoversPanel({ onSelect }: { onSelect: (s: string) => void }) {
  const { data } = useQuery({
    queryKey: ['market'],
    queryFn: () => getJSON<Market>('/market'),
    refetchInterval: 5000,
  })
  if (!data?.available)
    return <div className="mt-4 text-sm text-slate-500">market data load ho raha…</div>

  return (
    <div className="mt-2">
      <p className="mb-4 text-sm text-slate-500">
        Live intraday movers (NIFTY 50). Kisi par click → terminal mein kholo.
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        <List title="Top Gainers" items={data.gainers ?? []} onSelect={onSelect} color="text-up" />
        <List title="Top Losers" items={data.losers ?? []} onSelect={onSelect} color="text-down" />
      </div>
    </div>
  )
}
