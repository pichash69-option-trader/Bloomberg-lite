import { useQuery } from '@tanstack/react-query'
import { getJSON } from '../api'

type IdxVal = { ltp: number; chg_pct: number }
type Market = {
  available: boolean
  nifty?: IdxVal
  vix?: IdxVal
  breadth?: { advances: number; declines: number; unchanged: number }
}

function Idx({ label, v }: { label: string; v?: IdxVal }) {
  if (!v) return null
  const up = v.chg_pct >= 0
  return (
    <span className="flex items-center gap-1">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className="font-mono text-slate-200">{v.ltp.toLocaleString('en-IN')}</span>
      <span className={`font-mono text-[11px] ${up ? 'text-up' : 'text-down'}`}>
        {up ? '+' : ''}
        {v.chg_pct.toFixed(2)}%
      </span>
    </span>
  )
}

export default function MarketIndices() {
  const { data } = useQuery({
    queryKey: ['market'],
    queryFn: () => getJSON<Market>('/market'),
    refetchInterval: 5000,
  })
  if (!data?.available) return null
  const b = data.breadth
  const total = b ? b.advances + b.declines + b.unchanged || 1 : 1

  return (
    <div className="flex items-center gap-3 text-xs">
      <Idx label="NIFTY" v={data.nifty} />
      <Idx label="VIX" v={data.vix} />
      {b && (
        <span className="flex items-center gap-1.5" title="Advances / Declines">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Breadth</span>
          <span className="font-mono text-up">▲{b.advances}</span>
          <span className="flex h-1.5 w-14 overflow-hidden rounded-full bg-down/40">
            <div className="bg-up" style={{ width: `${(b.advances / total) * 100}%` }} />
          </span>
          <span className="font-mono text-down">▼{b.declines}</span>
        </span>
      )}
    </div>
  )
}
