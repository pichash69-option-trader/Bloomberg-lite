import { useQuery } from '@tanstack/react-query'
import { getJSON } from '../api'

type Mover = { symbol: string; last: number; chg_pct: number }
type Movers = { gainers: Mover[]; losers: Mover[] }

export default function MoversBar({ onSelect }: { onSelect: (s: string) => void }) {
  const { data } = useQuery({
    queryKey: ['movers'],
    queryFn: () => getJSON<Movers>('/movers'),
    refetchInterval: 60000,
  })
  if (!data) return null
  const items = [...data.gainers, ...data.losers]

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-panel/50 px-3 py-1.5">
      <span className="shrink-0 pr-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Movers
      </span>
      {items.map((m) => (
        <button
          key={m.symbol}
          onClick={() => onSelect(m.symbol)}
          className="shrink-0 rounded px-2 py-0.5 text-xs hover:bg-white/5"
          title={`₹${m.last.toLocaleString('en-IN')}`}
        >
          <span className="text-slate-300">{m.symbol}</span>{' '}
          <span className={`font-mono ${m.chg_pct >= 0 ? 'text-up' : 'text-down'}`}>
            {m.chg_pct >= 0 ? '▲+' : '▼'}
            {m.chg_pct.toFixed(2)}%
          </span>
        </button>
      ))}
    </div>
  )
}
