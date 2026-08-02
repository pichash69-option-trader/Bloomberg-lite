import { useQuery } from '@tanstack/react-query'
import { getJSON, type Position, type Stats } from '../api'

function inr(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function PaperView({
  positions,
  onClose,
  onClear,
}: {
  positions: Position[]
  onClose: (id: number) => void
  onClear: () => void
}) {
  // Mark prices: latest close for all 50 stocks.
  const { data } = useQuery({ queryKey: ['stats'], queryFn: () => getJSON<Stats>('/stats') })
  const mark: Record<string, number> = Object.fromEntries(
    (data?.stats ?? []).map((s) => [s.symbol, s.last]),
  )

  const rows = positions.map((p) => {
    const ltp = mark[p.symbol] ?? p.entry
    const pnl = (ltp - p.entry) * p.qty * (p.side === 'buy' ? 1 : -1)
    return { ...p, ltp, pnl }
  })
  const totalPnl = rows.reduce((s, r) => s + r.pnl, 0)
  const invested = rows.reduce((s, r) => s + r.entry * r.qty, 0)

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Paper Trades</h1>
        {positions.length > 0 && (
          <button
            onClick={onClear}
            className="rounded bg-down/10 px-3 py-1 text-xs text-down hover:bg-down/20"
          >
            Clear all
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Practice trades — asli paisa nahi. Mark = latest close. Educational.
      </p>

      {positions.length === 0 ? (
        <div className="mt-8 text-slate-500">
          Koi position nahi. Terminal mein kisi stock par <b>Paper Buy/Sell</b> karo.
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-panel p-4">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Positions</div>
              <div className="mt-1 font-mono text-lg text-slate-300">{positions.length}</div>
            </div>
            <div className="rounded-lg border border-border bg-panel p-4">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Invested</div>
              <div className="mt-1 font-mono text-lg text-slate-300">₹{inr(invested)}</div>
            </div>
            <div className="rounded-lg border border-border bg-panel p-4">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Total P&amp;L</div>
              <div
                className={`mt-1 font-mono text-lg ${totalPnl >= 0 ? 'text-up' : 'text-down'}`}
              >
                {totalPnl >= 0 ? '+' : ''}₹{inr(totalPnl)}
              </div>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-right font-mono text-xs">
              <thead className="bg-panel text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Symbol</th>
                  <th className="px-3 py-2">Side</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Entry</th>
                  <th className="px-3 py-2">Mark</th>
                  <th className="px-3 py-2">P&amp;L</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/50">
                    <td className="px-3 py-1.5 text-left text-slate-200">{r.symbol}</td>
                    <td
                      className={`px-3 py-1.5 ${r.side === 'buy' ? 'text-up' : 'text-down'}`}
                    >
                      {r.side.toUpperCase()}
                    </td>
                    <td className="px-3 py-1.5 text-slate-400">{r.qty}</td>
                    <td className="px-3 py-1.5 text-slate-400">{inr(r.entry)}</td>
                    <td className="px-3 py-1.5 text-slate-400">{inr(r.ltp)}</td>
                    <td className={`px-3 py-1.5 ${r.pnl >= 0 ? 'text-up' : 'text-down'}`}>
                      {r.pnl >= 0 ? '+' : ''}
                      {inr(r.pnl)}
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        onClick={() => onClose(r.id)}
                        className="text-slate-500 hover:text-down"
                      >
                        close
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
