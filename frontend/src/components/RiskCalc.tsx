import { useState } from 'react'

function inr(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function RiskCalc() {
  const [capital, setCapital] = useState(100000)
  const [riskPct, setRiskPct] = useState(1)
  const [entry, setEntry] = useState(100)
  const [stop, setStop] = useState(95)
  const [target, setTarget] = useState(115)

  const riskPerShare = Math.abs(entry - stop)
  const riskAmount = (capital * riskPct) / 100
  const qty = riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 0
  const positionValue = qty * entry
  const rewardPerShare = Math.abs(target - entry)
  const rr = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0
  const totalRisk = qty * riskPerShare
  const totalReward = qty * rewardPerShare
  const capitalUsedPct = capital > 0 ? (positionValue / capital) * 100 : 0

  const field = (label: string, val: number, set: (n: number) => void, step = 1) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="number"
        value={val}
        step={step}
        onChange={(e) => set(parseFloat(e.target.value) || 0)}
        className="w-full rounded border border-border bg-black/30 px-3 py-2 font-mono text-sm text-slate-200 outline-none focus:border-indigo"
      />
    </label>
  )

  const result: [string, string, string?][] = [
    ['Risk per share', `₹${inr(riskPerShare)}`],
    ['Risk amount (budget)', `₹${inr(riskAmount)}`],
    ['Position size (qty)', `${qty.toLocaleString('en-IN')}`],
    ['Position value', `₹${inr(positionValue)}`],
    ['Capital used', `${inr(capitalUsedPct)}%`],
    ['Total risk (to stop)', `₹${inr(totalRisk)}`, 'text-down'],
    ['Total reward (to target)', `₹${inr(totalReward)}`, 'text-up'],
    ['Risk : Reward', `1 : ${inr(rr)}`, rr >= 2 ? 'text-up' : 'text-slate-300'],
  ]

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold">Risk / Position-Sizing</h1>
      <p className="mt-1 text-sm text-slate-500">
        Kitni quantity leni chahiye taaki ek trade par sirf tay risk% jaaye. Educational —
        advice nahi.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {field('Account capital ₹', capital, setCapital, 1000)}
        {field('Risk per trade %', riskPct, setRiskPct, 0.25)}
        {field('Entry price', entry, setEntry, 0.05)}
        {field('Stop-loss', stop, setStop, 0.05)}
        {field('Target', target, setTarget, 0.05)}
      </div>

      <div className="mt-6 rounded-lg border border-border">
        <div className="border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Result
        </div>
        <table className="w-full font-mono text-sm">
          <tbody>
            {result.map(([k, v, cls]) => (
              <tr key={k} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2 text-slate-400">{k}</td>
                <td className={`px-4 py-2 text-right ${cls ?? 'text-slate-200'}`}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entry <= stop && (
        <p className="mt-2 text-xs text-down">
          Note: long setup ke liye stop entry se neeche hona chahiye.
        </p>
      )}
    </div>
  )
}
