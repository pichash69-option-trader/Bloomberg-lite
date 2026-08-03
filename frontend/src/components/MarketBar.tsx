import { useQuery } from '@tanstack/react-query'
import { getJSON } from '../api'

type Mover = { symbol: string; ltp: number; chg_pct: number }
type Market = { available: boolean; gainers?: Mover[]; losers?: Mover[] }

export default function MarketBar({ onSelect }: { onSelect: (s: string) => void }) {
  const { data } = useQuery({
    queryKey: ['market'],
    queryFn: () => getJSON<Market>('/market'),
    refetchInterval: 5000,
  })
  if (!data?.available) return null
  const movers = [...(data.gainers ?? []), ...(data.losers ?? [])]
  if (!movers.length) return null

  return (
    <div className="flex items-center gap-3 overflow-x-auto border-b border-border bg-panel/50 px-3 py-1.5 text-xs">
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-500">Movers</span>
      {movers.map((m) => (
        <button
          key={m.symbol}
          onClick={() => onSelect(m.symbol)}
          className="shrink-0 rounded px-1.5 py-0.5 hover:bg-white/5"
          title={`₹${m.ltp.toLocaleString('en-IN')}`}
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
