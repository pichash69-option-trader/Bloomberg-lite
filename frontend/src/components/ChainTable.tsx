import { type Chain, type OptionLeg } from '../api'

function n(v: number, d = 2): string {
  return v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function oiFmt(v: number): string {
  return v.toLocaleString('en-IN')
}
function greekTitle(leg: OptionLeg): string {
  return `Δ ${leg.delta}  Γ ${leg.gamma}  Θ ${leg.theta}  Vega ${leg.vega}  Rho ${leg.rho}  IV ${leg.iv}%`
}

export default function ChainTable({ chain }: { chain: Chain }) {
  const { atm, spot } = chain
  return (
    <div className="max-h-[460px] overflow-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-right font-mono text-xs">
        <thead className="sticky top-0 z-10">
          <tr className="bg-panel text-[11px] uppercase tracking-wider">
            <th colSpan={4} className="border-b border-border py-1 text-center text-up">
              CALLS
            </th>
            <th className="border-b border-border py-1 text-center text-slate-400">
              Strike
            </th>
            <th colSpan={4} className="border-b border-border py-1 text-center text-down">
              PUTS
            </th>
          </tr>
          <tr className="bg-panel text-[10px] uppercase tracking-wider text-slate-500">
            <th className="px-2 py-1 font-semibold">OI</th>
            <th className="px-2 py-1 font-semibold">IV</th>
            <th className="px-2 py-1 font-semibold">Δ</th>
            <th className="px-2 py-1 font-semibold">LTP</th>
            <th className="px-2 py-1 text-center font-semibold">—</th>
            <th className="px-2 py-1 font-semibold">LTP</th>
            <th className="px-2 py-1 font-semibold">Δ</th>
            <th className="px-2 py-1 font-semibold">IV</th>
            <th className="px-2 py-1 font-semibold">OI</th>
          </tr>
        </thead>
        <tbody>
          {chain.strikes.map((row) => {
            const isAtm = row.strike === atm
            const ceItm = row.strike < spot // calls ITM below spot
            const peItm = row.strike > spot // puts ITM above spot
            return (
              <tr
                key={row.strike}
                className={`border-t border-border/50 ${
                  isAtm ? 'bg-indigo/10' : 'hover:bg-white/[0.03]'
                }`}
              >
                <td className={`px-2 py-1 ${ceItm ? 'bg-up/5' : ''} text-slate-400`}>
                  {oiFmt(row.ce.oi)}
                </td>
                <td className={`px-2 py-1 ${ceItm ? 'bg-up/5' : ''} text-slate-500`}>
                  {row.ce.iv}
                </td>
                <td className={`px-2 py-1 ${ceItm ? 'bg-up/5' : ''} text-slate-500`}>
                  {row.ce.delta}
                </td>
                <td
                  title={greekTitle(row.ce)}
                  className={`px-2 py-1 ${ceItm ? 'bg-up/5' : ''} cursor-help text-up`}
                >
                  {n(row.ce.ltp)}
                </td>
                <td
                  className={`px-2 py-1 text-center font-semibold ${
                    isAtm ? 'text-indigo' : 'text-slate-300'
                  }`}
                >
                  {n(row.strike, 0)}
                </td>
                <td
                  title={greekTitle(row.pe)}
                  className={`px-2 py-1 ${peItm ? 'bg-down/5' : ''} cursor-help text-down`}
                >
                  {n(row.pe.ltp)}
                </td>
                <td className={`px-2 py-1 ${peItm ? 'bg-down/5' : ''} text-slate-500`}>
                  {row.pe.delta}
                </td>
                <td className={`px-2 py-1 ${peItm ? 'bg-down/5' : ''} text-slate-500`}>
                  {row.pe.iv}
                </td>
                <td className={`px-2 py-1 ${peItm ? 'bg-down/5' : ''} text-slate-400`}>
                  {oiFmt(row.pe.oi)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
