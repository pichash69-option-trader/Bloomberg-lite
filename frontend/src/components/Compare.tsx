import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getJSON, type Stat, type Stats } from '../api'

const METRICS: { key: keyof Stat; label: string; pct?: boolean; color?: boolean; good?: 'high' | 'low' }[] = [
  { key: 'last', label: 'Last' },
  { key: 'ret_1w', label: '1W %', pct: true, color: true },
  { key: 'ret_1m', label: '1M %', pct: true, color: true },
  { key: 'cum_return', label: 'Cum %', pct: true, color: true, good: 'high' },
  { key: 'ann_vol', label: 'Ann Vol %', pct: true, good: 'low' },
  { key: 'sharpe', label: 'Sharpe', color: true, good: 'high' },
  { key: 'max_dd', label: 'Max DD %', pct: true, color: true, good: 'high' },
]

function fmt(v: number | null | undefined, pct?: boolean): string {
  if (v == null) return '—'
  const s = v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return pct ? `${v >= 0 ? '+' : ''}${s}` : s
}

export default function Compare() {
  const { data } = useQuery({ queryKey: ['stats'], queryFn: () => getJSON<Stats>('/stats') })
  const [picks, setPicks] = useState<string[]>([])

  const all = data?.stats ?? []
  const byS: Record<string, Stat> = Object.fromEntries(all.map((s) => [s.symbol, s]))
  const cols = picks.map((p) => byS[p]).filter(Boolean)

  function addSym(s: string) {
    if (s && !picks.includes(s) && picks.length < 4) setPicks((p) => [...p, s])
  }

  // best value per metric (for subtle highlight)
  function bestOf(key: keyof Stat, good?: 'high' | 'low'): number | null {
    if (!good || !cols.length) return null
    const vals = cols.map((c) => c[key] as number).filter((v) => v != null)
    if (!vals.length) return null
    return good === 'high' ? Math.max(...vals) : Math.min(...vals)
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Compare</h1>
      <p className="mt-1 text-sm text-slate-500">
        2–4 stocks ke stats saath-saath. Educational — advice nahi.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value=""
          onChange={(e) => {
            addSym(e.target.value)
            e.target.value = ''
          }}
          className="rounded border border-border bg-black/30 px-3 py-1.5 text-sm text-slate-300"
        >
          <option value="">+ add stock…</option>
          {all
            .filter((s) => !picks.includes(s.symbol))
            .map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.symbol}
              </option>
            ))}
        </select>
        {picks.map((p) => (
          <button
            key={p}
            onClick={() => setPicks((ps) => ps.filter((x) => x !== p))}
            className="rounded bg-indigo/15 px-2.5 py-1 text-sm text-indigo hover:bg-indigo/25"
          >
            {p} ✕
          </button>
        ))}
      </div>

      {cols.length === 0 ? (
        <div className="mt-8 text-slate-500">Upar se stocks add karo (max 4).</div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-right font-mono text-sm">
            <thead>
              <tr className="bg-panel text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2 text-left">Metric</th>
                {cols.map((c) => (
                  <th key={c.symbol} className="px-4 py-2 text-slate-200">
                    {c.symbol}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => {
                const best = bestOf(m.key, m.good)
                return (
                  <tr key={m.key} className="border-t border-border/50">
                    <td className="px-4 py-2 text-left text-slate-400">{m.label}</td>
                    {cols.map((c) => {
                      const v = c[m.key] as number | null
                      const isBest = best != null && v === best
                      const cls =
                        m.color && v != null
                          ? v >= 0
                            ? 'text-up'
                            : 'text-down'
                          : 'text-slate-300'
                      return (
                        <td
                          key={c.symbol}
                          className={`px-4 py-2 ${cls} ${
                            isBest ? 'bg-indigo/10 font-semibold' : ''
                          }`}
                        >
                          {fmt(v, m.pct)}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
