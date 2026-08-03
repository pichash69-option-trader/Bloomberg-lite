import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getJSON, type DepthLevel, type LiveState, type OptDepth } from '../api'

function n(v: number | undefined, d = 2): string {
  return (v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function oi(v: number | undefined): string {
  return (v ?? 0).toLocaleString('en-IN')
}
function signed(v: number | undefined): string {
  return `${(v ?? 0) >= 0 ? '+' : ''}${n(v)}`
}

const BULL = ['Long Buildup', 'Short Covering']
const BEAR = ['Short Buildup', 'Long Unwinding']
function buildupCls(b: string): string {
  if (BULL.includes(b)) return 'bg-up/15 text-up'
  if (BEAR.includes(b)) return 'bg-down/15 text-down'
  return 'bg-white/5 text-slate-400'
}
function Chip({ text }: { text: string }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${buildupCls(text)}`}>{text}</span>
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-sm">{children}</div>
    </div>
  )
}

function Section({ title, tag, children }: { title: string; tag: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline gap-2 border-b border-border/60 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo">{title}</span>
        <span className="text-[10px] text-slate-600">{tag}</span>
      </div>
      {children}
    </section>
  )
}

function DepthLadder({ depth }: { depth: DepthLevel[] }) {
  if (!depth?.length) return null
  const maxQty = Math.max(...depth.flatMap((d) => [d.bid_qty, d.ask_qty]), 1)
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full font-mono text-[11px]">
        <thead className="bg-panel text-[9px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-2 py-1 text-left">Ord</th>
            <th className="px-2 py-1 text-right">Bid Qty</th>
            <th className="px-2 py-1 text-right text-up">Bid</th>
            <th className="px-2 py-1 text-left text-down">Ask</th>
            <th className="px-2 py-1 text-right">Ask Qty</th>
            <th className="px-2 py-1 text-right">Ord</th>
          </tr>
        </thead>
        <tbody>
          {depth.map((d, i) => (
            <tr key={i} className="border-t border-border/40">
              <td className="px-2 py-0.5 text-left text-slate-500">{d.bid_orders}</td>
              <td className="relative px-2 py-0.5 text-right text-slate-300">
                <span
                  className="absolute inset-y-0 right-0 bg-up/10"
                  style={{ width: `${(d.bid_qty / maxQty) * 100}%` }}
                />
                <span className="relative">{oi(d.bid_qty)}</span>
              </td>
              <td className="px-2 py-0.5 text-right text-up">{n(d.bid_price)}</td>
              <td className="px-2 py-0.5 text-left text-down">{n(d.ask_price)}</td>
              <td className="relative px-2 py-0.5 text-right text-slate-300">
                <span
                  className="absolute inset-y-0 left-0 bg-down/10"
                  style={{ width: `${(d.ask_qty / maxQty) * 100}%` }}
                />
                <span className="relative">{oi(d.ask_qty)}</span>
              </td>
              <td className="px-2 py-0.5 text-right text-slate-500">{d.ask_orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Market-microstructure from the depth ladder (grounded in Quant Bible §6).
function Micro({ depth }: { depth: DepthLevel[] }) {
  if (!depth?.length) return null
  const bidQty = depth.reduce((s, d) => s + d.bid_qty, 0)
  const askQty = depth.reduce((s, d) => s + d.ask_qty, 0)
  const ofi = (bidQty - askQty) / (bidQty + askQty || 1) // −1 sell … +1 buy
  const bestBid = depth[0].bid_price
  const bestAsk = depth[0].ask_price
  const bb = depth[0].bid_qty
  const ba = depth[0].ask_qty
  const mid = (bestBid + bestAsk) / 2
  const spreadBps = mid ? ((bestAsk - bestBid) / mid) * 10000 : 0
  // Micro-price: order-flow-weighted fair value (leans toward heavier book side).
  const micro = bb + ba ? (bestBid * ba + bestAsk * bb) / (bb + ba) : mid
  const lean = micro > mid ? 'up' : micro < mid ? 'down' : 'flat'

  return (
    <div className="rounded-lg border border-border bg-panel p-3">
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">
        Order-flow &amp; microstructure (5-lvl)
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-down">Sell</span>
        <span className={`font-mono ${ofi >= 0 ? 'text-up' : 'text-down'}`}>
          OFI {ofi >= 0 ? '+' : ''}
          {ofi.toFixed(2)}
        </span>
        <span className="text-up">Buy</span>
      </div>
      <div className="relative mt-1 h-2 rounded-full bg-white/5">
        <div className="absolute left-1/2 top-0 h-full w-px bg-slate-600" />
        <div
          className={`absolute top-0 h-full ${ofi >= 0 ? 'bg-up' : 'bg-down'}`}
          style={{
            left: ofi >= 0 ? '50%' : `${50 + ofi * 50}%`,
            width: `${Math.abs(ofi) * 50}%`,
          }}
        />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 font-mono text-xs">
        <div>
          <div className="text-[9px] uppercase text-slate-500">Spread</div>
          <span className="text-slate-300">{spreadBps.toFixed(1)} bps</span>
        </div>
        <div>
          <div className="text-[9px] uppercase text-slate-500">Mid</div>
          <span className="text-slate-300">{n(mid)}</span>
        </div>
        <div>
          <div className="text-[9px] uppercase text-slate-500">Micro-price</div>
          <span className="text-slate-300">{n(micro)}</span>
        </div>
        <div>
          <div className="text-[9px] uppercase text-slate-500">Lean</div>
          <span className={lean === 'up' ? 'text-up' : lean === 'down' ? 'text-down' : 'text-slate-400'}>
            {lean === 'up' ? '▲ up' : lean === 'down' ? '▼ down' : 'flat'}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function LiveTerminal({ live }: { live: LiveState | null }) {
  const [depthStrike, setDepthStrike] = useState<number | null>(null)
  const depthQ = useQuery({
    queryKey: ['optdepth', live?.symbol, depthStrike],
    queryFn: () =>
      getJSON<OptDepth>(
        `/optdepth?symbol=${encodeURIComponent(live!.symbol)}&strike=${depthStrike}`,
      ),
    enabled: !!live && depthStrike != null,
  })

  // Buildup timeline: log futures-buildup changes over the session.
  const [buildupLog, setBuildupLog] = useState<{ t: string; b: string }[]>([])
  useEffect(() => {
    setBuildupLog([])
  }, [live?.symbol])
  useEffect(() => {
    if (!live) return
    const b = live.futures.buildup
    setBuildupLog((log) =>
      log.length && log[log.length - 1].b === b
        ? log
        : [...log.slice(-11), { t: live.ts.slice(11, 19), b }],
    )
  }, [live?.symbol, live?.futures.buildup])

  const [tab, setTab] = useState<'analytics' | 'cash' | 'futures' | 'options'>('cash')

  if (!live) return <div className="mt-6 text-sm text-slate-500">live feed connect ho raha…</div>
  const { cash: c, futures: f, options: o, analytics: a } = live
  const up = c.chg >= 0
  const atmRow = o.strikes.find((s) => s.strike === o.atm)
  const maxOi = Math.max(...(o.strikes ?? []).flatMap((s) => [s.ce.oi, s.pe.oi]), 1)
  const zAbs = Math.abs(a?.z_score ?? 0)
  const zCls = zAbs >= 2 ? 'text-down' : zAbs >= 1 ? 'text-yellow-400' : 'text-slate-300'

  const TABS = [
    { key: 'analytics', label: 'Analytics' },
    { key: 'cash', label: 'Cash' },
    { key: 'futures', label: 'Futures' },
    { key: 'options', label: 'Options' },
  ] as const

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-1 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? 'border-indigo text-indigo'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ============ ANALYTICS ============ */}
      {tab === 'analytics' && a && (
        <Section title="Analytics" tag="fair-value · stats · Quant Bible §2-3, §6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <Tile label="Expected Move (1d)">
              <span className="text-slate-300">±{n(a.expected_move)}</span>
            </Tile>
            <Tile label="68% Range">
              <span className="text-slate-300">{n(a.ci68[0])}–{n(a.ci68[1])}</span>
            </Tile>
            <Tile label="95% Range">
              <span className="text-slate-300">{n(a.ci95[0])}–{n(a.ci95[1])}</span>
            </Tile>
            <Tile label="Move Z-score">
              <span className={zCls}>
                {signed(a.z_score)}σ {zAbs >= 2 ? '⚠' : ''}
              </span>
            </Tile>
            <Tile label="Hist Vol (daily)">
              <span className="text-slate-300">{a.hist_vol_daily_pct}%</span>
            </Tile>
            <Tile label="VWAP Edge">
              <span className={a.vwap_edge >= 0 ? 'text-up' : 'text-down'}>{signed(a.vwap_edge)}</span>
            </Tile>
            <Tile label="Fut Theo Prem">
              <span className="text-slate-300">{n(a.fut_theo_premium)}</span>
            </Tile>
            <Tile label="Fut FV Edge">
              <span className={a.fut_fv_edge >= 0 ? 'text-up' : 'text-down'}>
                {signed(a.fut_fv_edge)} {a.fut_fv_edge >= 0 ? '(rich)' : '(cheap)'}
              </span>
            </Tile>
            <Tile label="Beta (vs NIFTY)">
              <span className="text-slate-300">{a.beta}</span>
            </Tile>
            <Tile label="Realized Vol">
              <span className="text-slate-300">{a.realized_vol}%</span>
            </Tile>
            <Tile label="Implied Vol">
              <span className="text-slate-300">{a.implied_vol}%</span>
            </Tile>
            <Tile label="Vol Premium">
              <span className={a.vol_premium >= 0 ? 'text-up' : 'text-down'}>
                {signed(a.vol_premium)} {a.vol_premium >= 0 ? '(rich)' : '(cheap)'}
              </span>
            </Tile>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-slate-600">
            Expected move &amp; ranges ATM-IV se · Z-score = aaj ka move hist daily-vol ke kitne σ
            (|z|≥2 = extreme) · VWAP/FV edge = price vs fair value. Educational, advice nahi.
          </p>
        </Section>
      )}

      {/* ============ CASH MARKET ============ */}
      {tab === 'cash' && (
      <Section title="Cash Market" tag="Buy / Sell">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Tile label="LTP">
            <span className={`text-base ${up ? 'text-up' : 'text-down'}`}>₹{n(c.ltp)}</span>
            <div className={`text-xs ${up ? 'text-up' : 'text-down'}`}>
              {up ? '▲' : '▼'} {signed(c.chg)} ({signed(c.chg_pct)}%)
            </div>
          </Tile>
          <Tile label="Open / High / Low">
            <span className="text-slate-300">{n(c.open)}/{n(c.high)}/{n(c.low)}</span>
          </Tile>
          <Tile label="ATP">
            <span className="text-slate-300">{n(c.atp)}</span>
          </Tile>
          <Tile label="Volume">
            <span className="text-slate-300">{oi(c.volume)}</span>
          </Tile>
          <Tile label="Bid / Ask (spr)">
            <span className="text-slate-300">
              {n(c.bid)}/{n(c.ask)} <span className="text-slate-500">({n(c.spread)})</span>
            </span>
          </Tile>
          <Tile label="Circuit ↑ / ↓">
            <span className="text-slate-300">
              <span className="text-up">{n(c.upper_circuit)}</span> /{' '}
              <span className="text-down">{n(c.lower_circuit)}</span>
            </span>
          </Tile>
          <Tile label="Cumulative Flow">
            <span className={c.cum_flow >= 0 ? 'text-up' : 'text-down'}>{signed(c.cum_flow)}</span>
          </Tile>
          <Tile label="Last Traded Qty">
            <span className="text-slate-300">{oi(c.last_qty)}</span>
          </Tile>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {/* Buy/Sell pressure */}
          <div className="rounded-lg border border-border bg-panel p-3">
            <div className="flex justify-between text-[11px] uppercase tracking-wider">
              <span className="text-up">Buy {c.buy_pct}%</span>
              <span className="text-slate-500">Order pressure</span>
              <span className="text-down">Sell {n(100 - c.buy_pct, 1)}%</span>
            </div>
            <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-down/40">
              <div className="bg-up" style={{ width: `${c.buy_pct}%` }} />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[11px] text-slate-500">
              <span>{oi(c.buy_qty)}</span>
              <span>{oi(c.sell_qty)}</span>
            </div>
          </div>
          {/* Depth ladder */}
          <div>
            <div className="mb-1 px-1 text-[10px] uppercase tracking-wider text-slate-500">
              Market depth (5)
            </div>
            <DepthLadder depth={c.depth} />
          </div>
        </div>
        <div className="mt-3">
          <Micro depth={c.depth} />
        </div>
      </Section>
      )}

      {/* ============ FUTURES ============ */}
      {tab === 'futures' && (
      <Section title="Futures" tag="Long / Short">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Tile label="Fut LTP">
            <span className="text-slate-300">₹{n(f.ltp)}</span>
          </Tile>
          <Tile label="Fut ATP">
            <span className="text-slate-300">{n(f.atp)}</span>
          </Tile>
          <Tile label="OI">
            <span className="text-slate-300">{oi(f.oi)}</span>
          </Tile>
          <Tile label="Chg OI">
            <span className={f.chg_oi >= 0 ? 'text-up' : 'text-down'}>{signed(f.chg_oi)}</span>
          </Tile>
          <Tile label="OI Day H / L">
            <span className="text-slate-300">{oi(f.oi_day_high)}/{oi(f.oi_day_low)}</span>
          </Tile>
          <Tile label="Premium / Basis">
            <span className={f.premium >= 0 ? 'text-up' : 'text-down'}>
              {signed(f.premium)} ({signed(f.premium_pct)}%)
            </span>
          </Tile>
          <Tile label="OI Buildup">
            <Chip text={f.buildup} />
          </Tile>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {/* Multi-expiry */}
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full font-mono text-xs">
              <thead className="bg-panel text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-1.5 text-left">Expiry</th>
                  <th className="px-3 py-1.5 text-right">LTP</th>
                  <th className="px-3 py-1.5 text-right">OI</th>
                  <th className="px-3 py-1.5 text-right">Premium</th>
                </tr>
              </thead>
              <tbody>
                {(f.expiries ?? []).map((e) => (
                  <tr key={e.label} className="border-t border-border/40">
                    <td className="px-3 py-1 text-left text-slate-300">{e.label}</td>
                    <td className="px-3 py-1 text-right text-slate-400">{n(e.ltp)}</td>
                    <td className="px-3 py-1 text-right text-slate-400">{oi(e.oi)}</td>
                    <td
                      className={`px-3 py-1 text-right ${e.premium >= 0 ? 'text-up' : 'text-down'}`}
                    >
                      {signed(e.premium)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Fut depth */}
          <div>
            <div className="mb-1 px-1 text-[10px] uppercase tracking-wider text-slate-500">
              Futures depth (5)
            </div>
            <DepthLadder depth={f.depth} />
          </div>
        </div>
        <div className="mt-3">
          <Micro depth={f.depth} />
        </div>
        {buildupLog.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 px-1 text-[10px] uppercase tracking-wider text-slate-500">
              Buildup timeline (session)
            </div>
            <div className="flex flex-wrap gap-1">
              {buildupLog.map((e, i) => (
                <span
                  key={i}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${buildupCls(e.b)}`}
                >
                  {e.t} {e.b}
                </span>
              ))}
            </div>
          </div>
        )}
      </Section>
      )}

      {/* ============ OPTIONS ============ */}
      {tab === 'options' && (
      <Section title="Options" tag={`CE / PE · exp ${(o.expiries ?? []).join(' · ')}`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Tile label="PCR">
            <span className={o.pcr >= 1 ? 'text-up' : 'text-down'}>{n(o.pcr)}</span>
          </Tile>
          <Tile label="Max Pain">
            <span className="text-slate-300">{n(o.max_pain)}</span>
          </Tile>
          <Tile label="ATM">
            <span className="text-slate-300">{n(o.atm)}</span>
          </Tile>
          <Tile label="ATM IV">
            <span className="text-slate-300">{o.atm_iv}%</span>
          </Tile>
          <Tile label="IV Skew">
            <span className={o.iv_skew >= 0 ? 'text-down' : 'text-up'}>{signed(o.iv_skew)}</span>
          </Tile>
          <Tile label="Net Δ">
            <span className={o.net_delta >= 0 ? 'text-up' : 'text-down'}>{oi(o.net_delta)}</span>
          </Tile>
          <Tile label="Net Γ">
            <span className="text-slate-300">{oi(o.net_gamma)}</span>
          </Tile>
          <Tile label="Resistance (CE wall)">
            <span className="text-down">{n(o.ce_wall, 0)}</span>
          </Tile>
          <Tile label="Support (PE wall)">
            <span className="text-up">{n(o.pe_wall, 0)}</span>
          </Tile>
          <Tile label="IV Rank">
            <span className="text-slate-300">{o.iv_rank}</span>
          </Tile>
          <Tile label="Max-Pain Dist">
            <span className={o.max_pain_dist >= 0 ? 'text-up' : 'text-down'}>
              {signed(o.max_pain_dist)}
            </span>
          </Tile>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-panel p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-up">Calls (CE)</span>
              <Chip text={o.ce_buildup} />
            </div>
            <div className="mt-1 font-mono text-sm text-slate-300">
              OI {oi(o.total_ce_oi)}{' '}
              <span className={o.ce_chg_oi >= 0 ? 'text-up' : 'text-down'}>({signed(o.ce_chg_oi)})</span>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-panel p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-down">Puts (PE)</span>
              <Chip text={o.pe_buildup} />
            </div>
            <div className="mt-1 font-mono text-sm text-slate-300">
              OI {oi(o.total_pe_oi)}{' '}
              <span className={o.pe_chg_oi >= 0 ? 'text-up' : 'text-down'}>({signed(o.pe_chg_oi)})</span>
            </div>
          </div>
        </div>

        {/* Chain with chg-OI */}
        <div className="mt-3 max-h-[380px] overflow-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-right font-mono text-xs">
            <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-2 py-2 text-up">Chg OI</th>
                <th className="px-2 py-2 text-up">CE OI</th>
                <th className="px-2 py-2 text-up">CE LTP</th>
                <th className="px-2 py-2 text-center text-slate-400">Strike</th>
                <th className="px-2 py-2 text-down">PE LTP</th>
                <th className="px-2 py-2 text-down">PE OI</th>
                <th className="px-2 py-2 text-down">Chg OI</th>
              </tr>
            </thead>
            <tbody>
              {(o.strikes ?? []).map((s) => {
                const atm = s.strike === o.atm
                return (
                  <tr key={s.strike} className={`border-t border-border/50 ${atm ? 'bg-indigo/10' : ''}`}>
                    <td className={`px-2 py-1 ${s.ce.chg_oi >= 0 ? 'text-up' : 'text-down'}`}>
                      {signed(s.ce.chg_oi)}
                    </td>
                    <td className="relative px-2 py-1 text-slate-400">
                      <span
                        className="absolute inset-y-0 right-0 bg-up/10"
                        style={{ width: `${(s.ce.oi / maxOi) * 100}%` }}
                      />
                      <span className="relative">{oi(s.ce.oi)}</span>
                    </td>
                    <td className="px-2 py-1 text-up">{n(s.ce.ltp)}</td>
                    <td className="px-2 py-1 text-center">
                      <button
                        onClick={() => setDepthStrike(depthStrike === s.strike ? null : s.strike)}
                        className={`font-semibold hover:underline ${
                          depthStrike === s.strike
                            ? 'text-purple underline'
                            : atm
                              ? 'text-indigo'
                              : 'text-slate-300'
                        }`}
                        title="depth dekho"
                      >
                        {n(s.strike, 0)}
                      </button>
                    </td>
                    <td className="px-2 py-1 text-down">{n(s.pe.ltp)}</td>
                    <td className="relative px-2 py-1 text-slate-400">
                      <span
                        className="absolute inset-y-0 left-0 bg-down/10"
                        style={{ width: `${(s.pe.oi / maxOi) * 100}%` }}
                      />
                      <span className="relative">{oi(s.pe.oi)}</span>
                    </td>
                    <td className={`px-2 py-1 ${s.pe.chg_oi >= 0 ? 'text-up' : 'text-down'}`}>
                      {signed(s.pe.chg_oi)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-600">
          💡 Kisi <b>strike par click</b> karo → uska CE &amp; PE ka full 5-level depth.
        </p>

        {/* Option depth (on-demand, per strike) */}
        {depthStrike != null && depthQ.data && (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div>
              <div className="mb-1 px-1 text-[10px] uppercase tracking-wider text-up">
                {depthStrike} CE depth (5) · LTP {n(depthQ.data.ce.ltp)}
              </div>
              <DepthLadder depth={depthQ.data.ce.depth} />
            </div>
            <div>
              <div className="mb-1 px-1 text-[10px] uppercase tracking-wider text-down">
                {depthStrike} PE depth (5) · LTP {n(depthQ.data.pe.ltp)}
              </div>
              <DepthLadder depth={depthQ.data.pe.depth} />
            </div>
          </div>
        )}

        {atmRow && (
          <p className="mt-3 text-[11px] text-slate-600">
            ATM {o.atm} greeks — CE: Δ {atmRow.ce.delta} Γ {atmRow.ce.gamma} Θ {atmRow.ce.theta} Vega{' '}
            {atmRow.ce.vega} Rho {atmRow.ce.rho} · PE: Δ {atmRow.pe.delta} Θ {atmRow.pe.theta} Rho{' '}
            {atmRow.pe.rho}
          </p>
        )}
      </Section>
      )}
    </div>
  )
}
