import { useQuery } from '@tanstack/react-query'
import { getJSON, type Snapshots } from '../api'

function n(v: number): string {
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function SnapshotTable({ symbol }: { symbol: string }) {
  const { data } = useQuery({
    queryKey: ['snapshots', symbol],
    queryFn: () => getJSON<Snapshots>(`/snapshots?symbol=${encodeURIComponent(symbol)}`),
  })
  if (!data || data.count === 0)
    return <div className="text-sm text-slate-500">koi snapshot nahi (job chala?)</div>

  const rows = [...data.snapshots].reverse()
  return (
    <div className="max-h-[300px] overflow-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-right font-mono text-xs">
        <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left">Date</th>
            <th className="px-3 py-2">Spot</th>
            <th className="px-3 py-2">PCR</th>
            <th className="px-3 py-2">Max Pain</th>
            <th className="px-3 py-2">Fut Prem</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date} className="border-t border-border/50">
              <td className="px-3 py-1.5 text-left text-slate-300">{r.date}</td>
              <td className="px-3 py-1.5 text-slate-400">{n(r.spot_close)}</td>
              <td className={`px-3 py-1.5 ${r.pcr >= 1 ? 'text-up' : 'text-down'}`}>
                {r.pcr.toFixed(2)}
              </td>
              <td className="px-3 py-1.5 text-slate-400">{n(r.max_pain)}</td>
              <td
                className={`px-3 py-1.5 ${r.futures_premium >= 0 ? 'text-up' : 'text-down'}`}
              >
                {r.futures_premium >= 0 ? '+' : ''}
                {n(r.futures_premium)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
