import { useQuery } from '@tanstack/react-query'
import { getJSON } from '../api'

type IdxVal = { ltp: number; chg_pct: number }
type Mover = { symbol: string; ltp: number; chg_pct: number }
type Market = {
  available: boolean
  nifty?: IdxVal
  vix?: IdxVal
  breadth?: { advances: number; declines: number; unchanged: number }
  gainers?: Mover[]
  losers?: Mover[]
}

function Idx({ label, v }: { label: string; v?: IdxVal }) {
  if (!v) return null
  const up = v.chg_pct >= 0
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className="font-mono text-slate-200">{v.ltp.toLocaleString('en-IN')}</span>
      <span className={`font-mono text-[11px] ${up ? 'text-up' : 'text-down'}`}>
        {up ? '▲+' : '▼'}
        {v.chg_pct.toFixed(2)}%
      </span>
    </span>
  )
}

export default function MarketBar({ onSelect }: { onSelect: (s: string) => void }) {
  const { data } = useQuery({
    queryKey: ['market'],
    queryFn: () => getJSON<Market>('/market'),
    refetchInterval: 5000,
  })
  if (!data?.available) return null
  const b = data.breadth
  const total = b ? b.advances + b.declines + b.unchanged || 1 : 1
  const movers = [...(data.gainers ?? []), ...(data.losers ?? [])]

  return (
    <div className="flex items-center gap-4 overflow-x-auto border-b border-border bg-panel/50 px-3 py-1.5 text-xs">
      <Idx label="NIFTY" v={data.nifty} />
      <Idx label="India VIX" v={data.vix} />
      {b && (
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Breadth</span>
          <span className="font-mono text-up">▲{b.advances}</span>
          <span className="flex h-2 w-24 overflow-hidden rounded-full bg-down/40">
            <div className="bg-up" style={{ width: `${(b.advances / total) * 100}%` }} />
          </span>
          <span className="font-mono text-down">▼{b.declines}</span>
        </span>
      )}
      <span className="mx-1 shrink-0 text-slate-700">|</span>
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
