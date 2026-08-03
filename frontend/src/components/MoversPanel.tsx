import { useQuery } from '@tanstack/react-query'
import { getJSON } from '../api'

type Mover = { symbol: string; ltp: number; chg_pct: number }
type Market = { available: boolean; all?: Mover[] }

// chg% -> heatmap colour (green up / red down, intensity by magnitude).
function tileColor(chg: number): string {
  const k = Math.min(Math.abs(chg) / 4, 1) // 4% move = full intensity
  const a = (0.18 + k * 0.72).toFixed(2)
  return chg >= 0 ? `rgba(34,197,94,${a})` : `rgba(239,68,68,${a})`
}

export default function MoversPanel({ onSelect }: { onSelect: (s: string) => void }) {
  const { data } = useQuery({
    queryKey: ['market'],
    queryFn: () => getJSON<Market>('/market'),
    refetchInterval: 5000,
  })
  if (!data?.available)
    return <div className="mt-4 text-sm text-slate-500">market data load ho raha…</div>

  const all = data.all ?? [] // sorted by chg% desc
  const adv = all.filter((m) => m.chg_pct > 0.05).length
  const dec = all.filter((m) => m.chg_pct < -0.05).length

  return (
    <div className="mt-2">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          NIFTY 50 heatmap — hara = up, laal = down, gehra = bada move. Click → kholo.
        </p>
        <span className="font-mono text-xs">
          <span className="text-up">▲{adv}</span> <span className="text-down">▼{dec}</span>
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
        {all.map((m) => (
          <button
            key={m.symbol}
            onClick={() => onSelect(m.symbol)}
            style={{ backgroundColor: tileColor(m.chg_pct) }}
            className="rounded-md px-2 py-2.5 text-left transition hover:ring-1 hover:ring-white/40"
            title={`₹${m.ltp.toLocaleString('en-IN')}`}
          >
            <div className="truncate text-[11px] font-semibold text-white">{m.symbol}</div>
            <div className="font-mono text-xs text-white/90">
              {m.chg_pct >= 0 ? '+' : ''}
              {m.chg_pct.toFixed(2)}%
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
