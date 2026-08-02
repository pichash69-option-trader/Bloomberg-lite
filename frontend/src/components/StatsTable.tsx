import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getJSON, type Stat, type Stats } from '../api'

type Col = { key: keyof Stat; label: string; pct?: boolean; color?: boolean }
const COLS: Col[] = [
  { key: 'symbol', label: 'Symbol' },
  { key: 'last', label: 'Last' },
  { key: 'ret_1w', label: '1W %', pct: true, color: true },
  { key: 'ret_1m', label: '1M %', pct: true, color: true },
  { key: 'cum_return', label: 'Cum %', pct: true, color: true },
  { key: 'ann_vol', label: 'Ann Vol %', pct: true },
  { key: 'sharpe', label: 'Sharpe', color: true },
  { key: 'max_dd', label: 'Max DD %', pct: true, color: true },
]

function cell(v: number | null, pct?: boolean): string {
  if (v == null) return '—'
  const s = v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return pct ? `${v >= 0 ? '+' : ''}${s}` : s
}

export default function StatsTable({ onSelect }: { onSelect: (s: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => getJSON<Stats>('/stats'),
  })
  const [sortKey, setSortKey] = useState<keyof Stat>('cum_return')
  const [dir, setDir] = useState<1 | -1>(-1)

  const rows = useMemo(() => {
    const arr = [...(data?.stats ?? [])]
    arr.sort((a, b) => {
      const x = a[sortKey]
      const y = b[sortKey]
      if (typeof x === 'string' || typeof y === 'string')
        return String(x).localeCompare(String(y)) * dir
      return (((x as number) ?? -1e9) - ((y as number) ?? -1e9)) * dir
    })
    return arr
  }, [data, sortKey, dir])

  function sortBy(k: keyof Stat) {
    if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1))
    else {
      setSortKey(k)
      setDir(k === 'symbol' ? 1 : -1)
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Math Stats — saare stocks</h1>
      <p className="mt-1 text-sm text-slate-500">
        Pure statistics (daily candles se). Column header click = sort. Row click = terminal
        mein kholo. Educational — advice nahi.
      </p>
      {isLoading && <div className="mt-4 text-sm text-slate-500">compute ho raha…</div>}
      {data && (
        <div className="mt-4 max-h-[560px] overflow-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-right font-mono text-xs">
            <thead className="sticky top-0 bg-panel">
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                {COLS.map((c, i) => (
                  <th
                    key={c.key}
                    onClick={() => sortBy(c.key)}
                    className={`cursor-pointer select-none px-3 py-2 font-semibold hover:text-slate-300 ${
                      i === 0 ? 'text-left' : ''
                    }`}
                  >
                    {c.label}
                    {sortKey === c.key ? (dir === 1 ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.symbol}
                  onClick={() => onSelect(r.symbol)}
                  className="cursor-pointer border-t border-border/50 hover:bg-white/[0.04]"
                >
                  {COLS.map((c, i) => {
                    const v = r[c.key]
                    if (i === 0)
                      return (
                        <td key={c.key} className="px-3 py-1.5 text-left text-slate-200">
                          {v}
                        </td>
                      )
                    const num = v as number | null
                    const cls =
                      c.color && num != null
                        ? num >= 0
                          ? 'text-up'
                          : 'text-down'
                        : 'text-slate-400'
                    return (
                      <td key={c.key} className={`px-3 py-1.5 ${cls}`}>
                        {cell(num, c.pct)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
