import { useState } from 'react'

type SegKey = 'delivery' | 'intraday' | 'futures' | 'options'

// Approximate NSE charge rates (fractions of turnover unless noted).
// Educational — verify exact numbers with your broker.
const SEG: Record<
  SegKey,
  {
    label: string
    brokerage: (turnoverPerSide: number) => number // per side
    sttBuy: number
    sttSell: number
    exch: number
    stampBuy: number
  }
> = {
  delivery: {
    label: 'Equity Delivery',
    brokerage: () => 0,
    sttBuy: 0.001,
    sttSell: 0.001,
    exch: 0.0000297,
    stampBuy: 0.00015,
  },
  intraday: {
    label: 'Equity Intraday',
    brokerage: (t) => Math.min(20, 0.0003 * t),
    sttBuy: 0,
    sttSell: 0.00025,
    exch: 0.0000297,
    stampBuy: 0.00003,
  },
  futures: {
    label: 'Futures',
    brokerage: (t) => Math.min(20, 0.0003 * t),
    sttBuy: 0,
    sttSell: 0.0002,
    exch: 0.0000173,
    stampBuy: 0.00002,
  },
  options: {
    label: 'Options',
    brokerage: () => 20, // flat per side
    sttBuy: 0,
    sttSell: 0.001, // on sell premium
    exch: 0.0003503, // on premium
    stampBuy: 0.00003,
  },
}

const SEBI = 0.000001 // ₹10 / crore
const GST = 0.18

function inr(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ChargesCalc() {
  const [seg, setSeg] = useState<SegKey>('options')
  const [buy, setBuy] = useState(100)
  const [sell, setSell] = useState(120)
  const [qty, setQty] = useState(100)

  const r = SEG[seg]
  const buyT = buy * qty
  const sellT = sell * qty
  const turnover = buyT + sellT

  const brokerage = r.brokerage(buyT) + r.brokerage(sellT)
  const stt = r.sttBuy * buyT + r.sttSell * sellT
  const exch = r.exch * turnover
  const sebi = SEBI * turnover
  const gst = GST * (brokerage + exch + sebi)
  const stamp = r.stampBuy * buyT
  const total = brokerage + stt + exch + sebi + gst + stamp

  const gross = (sell - buy) * qty
  const net = gross - total
  const breakevenPts = qty ? total / qty : 0

  const rows: [string, number][] = [
    ['Brokerage', brokerage],
    ['STT', stt],
    ['Exchange txn', exch],
    ['SEBI', sebi],
    ['GST (18%)', gst],
    ['Stamp duty', stamp],
  ]

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

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold">Charges / Brokerage Calculator</h1>
      <p className="mt-1 text-sm text-slate-500">
        Buy/sell ke baad asli net P&amp;L — saare charges ke saath. (Approx NSE rates —
        apne broker se verify karo.)
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {(Object.keys(SEG) as SegKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setSeg(k)}
            className={`rounded px-3 py-1.5 text-sm ${
              seg === k ? 'bg-indigo/20 text-indigo' : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {SEG[k].label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        {field('Buy price', buy, setBuy, 0.05)}
        {field('Sell price', sell, setSell, 0.05)}
        {field('Quantity', qty, setQty, 1)}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border">
          <div className="border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Charges breakdown
          </div>
          <table className="w-full font-mono text-sm">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k} className="border-b border-border/50">
                  <td className="px-4 py-1.5 text-slate-400">{k}</td>
                  <td className="px-4 py-1.5 text-right text-slate-300">₹{inr(v)}</td>
                </tr>
              ))}
              <tr>
                <td className="px-4 py-2 font-semibold text-slate-300">Total charges</td>
                <td className="px-4 py-2 text-right font-semibold text-down">₹{inr(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Result
          </div>
          <div className="mt-3 space-y-2 font-mono text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Gross P&amp;L</span>
              <span className={gross >= 0 ? 'text-up' : 'text-down'}>₹{inr(gross)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Total charges</span>
              <span className="text-down">− ₹{inr(total)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base">
              <span className="font-semibold text-slate-200">Net P&amp;L</span>
              <span className={`font-semibold ${net >= 0 ? 'text-up' : 'text-down'}`}>
                ₹{inr(net)}
              </span>
            </div>
            <div className="flex justify-between pt-1 text-xs">
              <span className="text-slate-500">Breakeven move needed</span>
              <span className="text-slate-400">₹{inr(breakevenPts)} / unit</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
