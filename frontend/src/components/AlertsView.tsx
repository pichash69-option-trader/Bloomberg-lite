import { useState } from 'react'
import { type Alert } from '../api'

export default function AlertsView({
  alerts,
  symbols,
  currentSymbol,
  onAdd,
  onDelete,
}: {
  alerts: Alert[]
  symbols: string[]
  currentSymbol: string | null
  onAdd: (a: Omit<Alert, 'id'>) => void
  onDelete: (id: number) => void
}) {
  const [symbol, setSymbol] = useState(currentSymbol ?? symbols[0] ?? '')
  const [metric, setMetric] = useState<'LTP' | 'PCR'>('LTP')
  const [op, setOp] = useState<'>' | '<'>('>')
  const [value, setValue] = useState(0)

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold">Alerts</h1>
      <p className="mt-1 text-sm text-slate-500">
        LTP/PCR threshold cross → notification. Live sirf select kiye stock ka evaluate
        hota (usko Terminal mein khula rakho). Educational — advice nahi.
      </p>

      {/* Add form */}
      <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-panel/60 p-3 text-sm">
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="rounded border border-border bg-black/30 px-2 py-1.5 text-slate-300"
        >
          {symbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as 'LTP' | 'PCR')}
          className="rounded border border-border bg-black/30 px-2 py-1.5 text-slate-300"
        >
          <option value="LTP">LTP</option>
          <option value="PCR">PCR</option>
        </select>
        <select
          value={op}
          onChange={(e) => setOp(e.target.value as '>' | '<')}
          className="rounded border border-border bg-black/30 px-2 py-1.5 text-slate-300"
        >
          <option value=">">&gt;</option>
          <option value="<">&lt;</option>
        </select>
        <input
          type="number"
          value={value}
          step={metric === 'PCR' ? 0.05 : 1}
          onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
          className="w-28 rounded border border-border bg-black/30 px-2 py-1.5 font-mono text-slate-200"
        />
        <button
          onClick={() => onAdd({ symbol, metric, op, value })}
          className="rounded bg-indigo/20 px-3 py-1.5 text-indigo hover:bg-indigo/30"
        >
          + Add alert
        </button>
      </div>

      {/* List */}
      {alerts.length === 0 ? (
        <div className="mt-6 text-slate-500">Koi alert nahi.</div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-panel text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Symbol</th>
                <th className="px-4 py-2">Condition</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {alerts.map((a) => (
                <tr key={a.id} className="border-t border-border/50">
                  <td className="px-4 py-2 text-slate-200">{a.symbol}</td>
                  <td className="px-4 py-2 text-slate-400">
                    {a.metric} {a.op} {a.value}
                  </td>
                  <td className="px-4 py-2">
                    {a.triggered ? (
                      <span className="text-up">✓ triggered {a.at ? `· ${a.at}` : ''}</span>
                    ) : (
                      <span className="text-slate-500">watching…</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => onDelete(a.id)}
                      className="text-slate-500 hover:text-down"
                    >
                      delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
