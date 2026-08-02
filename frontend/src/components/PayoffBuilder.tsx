import { useMemo, useState } from 'react'
import { type Chain } from '../api'

type Side = 'buy' | 'sell'
type OptType = 'CE' | 'PE'
type Leg = { id: number; side: Side; type: OptType; strike: number; qty: number }

function inr(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function PayoffBuilder({
  chain,
  symbol,
}: {
  chain: Chain | undefined
  symbol: string | null
}) {
  const [legs, setLegs] = useState<Leg[]>([])
  const [nextId, setNextId] = useState(1)

  const strikes = chain?.strikes ?? []
  const atm = chain?.atm

  function legPremium(l: Leg): number {
    const row = strikes.find((s) => s.strike === l.strike)
    if (!row) return 0
    return l.type === 'CE' ? row.ce.ltp : row.pe.ltp
  }
  function legGreek(l: Leg, g: 'delta' | 'gamma' | 'theta' | 'vega'): number {
    const row = strikes.find((s) => s.strike === l.strike)
    if (!row) return 0
    const leg = l.type === 'CE' ? row.ce : row.pe
    const sign = l.side === 'buy' ? 1 : -1
    return sign * l.qty * leg[g]
  }

  function addLeg(side: Side, type: OptType, strike: number) {
    setLegs((ls) => [...ls, { id: nextId, side, type, strike, qty: 50 }])
    setNextId((n) => n + 1)
  }
  function removeLeg(id: number) {
    setLegs((ls) => ls.filter((l) => l.id !== id))
  }

  // ---- P&L math (at expiry) ----
  const pnlAt = (S: number): number =>
    legs.reduce((sum, l) => {
      const prem = legPremium(l)
      const intrinsic = l.type === 'CE' ? Math.max(S - l.strike, 0) : Math.max(l.strike - S, 0)
      const per = l.side === 'buy' ? intrinsic - prem : prem - intrinsic
      return sum + per * l.qty
    }, 0)

  const analysis = useMemo(() => {
    if (!strikes.length || !legs.length) return null
    const ks = strikes.map((s) => s.strike)
    const lo = Math.min(...ks) * 0.9
    const hi = Math.max(...ks) * 1.1
    const steps = 240
    let maxP = -Infinity
    let maxL = Infinity
    const grid: { S: number; pnl: number }[] = []
    for (let i = 0; i <= steps; i++) {
      const S = lo + ((hi - lo) * i) / steps
      const p = pnlAt(S)
      grid.push({ S, pnl: p })
      maxP = Math.max(maxP, p)
      maxL = Math.min(maxL, p)
    }
    const breakevens: number[] = []
    for (let i = 1; i < grid.length; i++) {
      const a = grid[i - 1]
      const b = grid[i]
      if ((a.pnl <= 0 && b.pnl > 0) || (a.pnl >= 0 && b.pnl < 0)) {
        const t = a.pnl / (a.pnl - b.pnl)
        breakevens.push(a.S + t * (b.S - a.S))
      }
    }
    const netPremium = legs.reduce(
      (s, l) => s + (l.side === 'buy' ? -1 : 1) * legPremium(l) * l.qty,
      0,
    )
    const greeks = (['delta', 'gamma', 'theta', 'vega'] as const).map((g) => ({
      g,
      v: legs.reduce((s, l) => s + legGreek(l, g), 0),
    }))
    return { maxP, maxL, breakevens, netPremium, greeks }
  }, [legs, strikes])

  if (!symbol || !chain) {
    return (
      <div className="grid h-full place-items-center text-slate-500">
        Pehle Terminal se ek stock select karo (chain chahiye payoff ke liye).
      </div>
    )
  }

  const step = strikes.length > 1 ? strikes[1].strike - strikes[0].strike : 0
  const presets: [string, () => void][] = [
    ['Long Call', () => addLeg('buy', 'CE', atm!)],
    ['Long Put', () => addLeg('buy', 'PE', atm!)],
    [
      'Long Straddle',
      () => {
        addLeg('buy', 'CE', atm!)
        addLeg('buy', 'PE', atm!)
      },
    ],
    [
      'Bull Call Spread',
      () => {
        addLeg('buy', 'CE', atm!)
        addLeg('sell', 'CE', atm! + 2 * step)
      },
    ],
  ]

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">
          Payoff Builder <span className="text-slate-500">· {symbol}</span>
        </h1>
        <span className="text-[11px] text-slate-600">spot {inr(chain.spot)} · ATM {atm}</span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Legs jodo (ya preset) → expiry P&amp;L, breakeven, net Greeks. Educational — advice nahi.
      </p>

      {/* Presets + add */}
      <div className="mt-4 flex flex-wrap gap-2">
        {presets.map(([label, fn]) => (
          <button
            key={label}
            onClick={fn}
            className="rounded bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10"
          >
            + {label}
          </button>
        ))}
        {legs.length > 0 && (
          <button
            onClick={() => setLegs([])}
            className="rounded bg-down/10 px-3 py-1.5 text-sm text-down hover:bg-down/20"
          >
            Clear
          </button>
        )}
      </div>

      {/* Manual add row */}
      <div className="mt-3 flex flex-wrap items-end gap-2 text-sm">
        {(['buy', 'sell'] as Side[]).map((sd) =>
          (['CE', 'PE'] as OptType[]).map((tp) => (
            <select
              key={sd + tp}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) addLeg(sd, tp, parseFloat(e.target.value))
                e.target.value = ''
              }}
              className="rounded border border-border bg-black/30 px-2 py-1.5 text-xs text-slate-300"
            >
              <option value="">
                + {sd} {tp} @…
              </option>
              {strikes.map((s) => (
                <option key={s.strike} value={s.strike}>
                  {s.strike}
                </option>
              ))}
            </select>
          )),
        )}
      </div>

      {/* Legs */}
      {legs.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-right font-mono text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Leg</th>
                <th className="px-3 py-2">Strike</th>
                <th className="px-3 py-2">Premium</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {legs.map((l) => (
                <tr key={l.id} className="border-t border-border/50">
                  <td className="px-3 py-1.5 text-left">
                    <span className={l.side === 'buy' ? 'text-up' : 'text-down'}>
                      {l.side.toUpperCase()}
                    </span>{' '}
                    {l.type}
                  </td>
                  <td className="px-3 py-1.5 text-slate-300">{l.strike}</td>
                  <td className="px-3 py-1.5 text-slate-400">{inr(legPremium(l))}</td>
                  <td className="px-3 py-1.5 text-slate-400">{l.qty}</td>
                  <td className="px-3 py-1.5">
                    <button
                      onClick={() => removeLeg(l.id)}
                      className="text-down hover:underline"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary + payoff */}
      {analysis && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              [
                'Net Premium',
                `${analysis.netPremium >= 0 ? '+' : ''}${inr(analysis.netPremium)}`,
                analysis.netPremium >= 0 ? 'text-up' : 'text-down',
              ],
              ['Max Profit', inr(analysis.maxP), 'text-up'],
              ['Max Loss', inr(analysis.maxL), 'text-down'],
              [
                'Breakeven(s)',
                analysis.breakevens.length
                  ? analysis.breakevens.map((b) => inr(b)).join(', ')
                  : '—',
                'text-slate-300',
              ],
            ].map(([k, v, cls]) => (
              <div key={k} className="rounded-lg border border-border bg-panel p-4">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">{k}</div>
                <div className={`mt-1 font-mono text-sm ${cls}`}>{v}</div>
              </div>
            ))}
          </div>

          {/* Net greeks */}
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {analysis.greeks.map(({ g, v }) => (
              <div key={g} className="rounded-lg border border-border bg-panel p-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">
                  Net {g}
                </div>
                <div className={`mt-1 font-mono text-sm ${v >= 0 ? 'text-up' : 'text-down'}`}>
                  {v.toFixed(g === 'gamma' ? 4 : 2)}
                </div>
              </div>
            ))}
          </div>

          {/* Payoff at each strike */}
          <div className="mt-5">
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Payoff at expiry (har strike par)
            </div>
            <div className="max-h-[300px] overflow-auto rounded-lg border border-border">
              <table className="w-full text-right font-mono text-xs">
                <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Price</th>
                    <th className="px-4 py-2">P&amp;L at expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {strikes.map((s) => {
                    const p = pnlAt(s.strike)
                    return (
                      <tr key={s.strike} className="border-t border-border/50">
                        <td className="px-4 py-1.5 text-left text-slate-300">{s.strike}</td>
                        <td className={`px-4 py-1.5 ${p >= 0 ? 'text-up' : 'text-down'}`}>
                          {p >= 0 ? '+' : ''}
                          {inr(p)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
