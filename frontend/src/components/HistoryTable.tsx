import { useMemo } from 'react'
import { type Candle } from '../api'

function fmtNum(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtVol(v: number | null): string {
  if (v == null) return '—'
  return v.toLocaleString('en-IN')
}

type Row = Candle & { chgPct: number | null }

export default function HistoryTable({ candles }: { candles: Candle[] }) {
  // Compute day-over-day change%, then show latest first.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = candles.map((c, i) => {
      const prev = i > 0 ? candles[i - 1].close : null
      const chgPct = prev ? ((c.close - prev) / prev) * 100 : null
      return { ...c, chgPct }
    })
    return out.reverse()
  }, [candles])

  return (
    <div className="max-h-[440px] overflow-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-right font-mono text-xs">
        <thead className="sticky top-0 bg-panel">
          <tr className="text-[11px] uppercase tracking-wider text-slate-500">
            <th className="px-3 py-2 text-left font-semibold">Date</th>
            <th className="px-3 py-2 font-semibold">Open</th>
            <th className="px-3 py-2 font-semibold">High</th>
            <th className="px-3 py-2 font-semibold">Low</th>
            <th className="px-3 py-2 font-semibold">Close</th>
            <th className="px-3 py-2 font-semibold">Chg%</th>
            <th className="px-3 py-2 font-semibold">Volume</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.time} className="border-t border-border/60 hover:bg-white/[0.03]">
              <td className="px-3 py-1.5 text-left text-slate-300">{r.time}</td>
              <td className="px-3 py-1.5 text-slate-400">{fmtNum(r.open)}</td>
              <td className="px-3 py-1.5 text-slate-400">{fmtNum(r.high)}</td>
              <td className="px-3 py-1.5 text-slate-400">{fmtNum(r.low)}</td>
              <td className="px-3 py-1.5 text-slate-200">{fmtNum(r.close)}</td>
              <td
                className={`px-3 py-1.5 ${
                  r.chgPct == null
                    ? 'text-slate-600'
                    : r.chgPct >= 0
                      ? 'text-up'
                      : 'text-down'
                }`}
              >
                {r.chgPct == null
                  ? '—'
                  : `${r.chgPct >= 0 ? '+' : ''}${r.chgPct.toFixed(2)}%`}
              </td>
              <td className="px-3 py-1.5 text-slate-400">{fmtVol(r.volume)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
