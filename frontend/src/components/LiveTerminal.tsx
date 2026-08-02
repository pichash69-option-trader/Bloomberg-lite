import { type LiveState } from '../api'

function n(v: number, d = 2): string {
  return v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function oi(v: number): string {
  return v.toLocaleString('en-IN')
}
function signed(v: number): string {
  return `${v >= 0 ? '+' : ''}${n(v)}`
}

const BULL = ['Long Buildup', 'Short Covering']
const BEAR = ['Short Buildup', 'Long Unwinding']
function buildupCls(b: string): string {
  if (BULL.includes(b)) return 'bg-up/15 text-up'
  if (BEAR.includes(b)) return 'bg-down/15 text-down'
  return 'bg-white/5 text-slate-400'
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-base">{children}</div>
    </div>
  )
}

function Section({ title, tag, children }: { title: string; tag: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo">
          {title}
        </span>
        <span className="text-[10px] text-slate-600">{tag}</span>
      </div>
      {children}
    </section>
  )
}

function Chip({ text }: { text: string }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${buildupCls(text)}`}>{text}</span>
}

export default function LiveTerminal({ live }: { live: LiveState | null }) {
  if (!live) {
    return <div className="mt-6 text-sm text-slate-500">live feed connect ho raha…</div>
  }
  const { cash: c, futures: f, options: o } = live
  const up = c.chg >= 0
  const atmRow = o.strikes.find((s) => s.strike === o.atm)

  return (
    <div>
      {/* ============ CASH MARKET ============ */}
      <Section title="Cash Market" tag="Buy / Sell">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="LTP">
            <span className={up ? 'text-up' : 'text-down'}>₹{n(c.ltp)}</span>
            <div className={`text-xs ${up ? 'text-up' : 'text-down'}`}>
              {up ? '▲' : '▼'} {signed(c.chg)} ({signed(c.chg_pct)}%)
            </div>
          </Tile>
          <Tile label="O / H / L">
            <span className="text-sm text-slate-300">
              {n(c.open)} / {n(c.high)} / {n(c.low)}
            </span>
          </Tile>
          <Tile label="Volume">
            <span className="text-slate-300">{oi(c.volume)}</span>
          </Tile>
          <Tile label="Bid / Ask (spread)">
            <span className="text-sm text-slate-300">
              {n(c.bid)} / {n(c.ask)}{' '}
              <span className="text-slate-500">({n(c.spread)})</span>
            </span>
          </Tile>
        </div>

        {/* Buy/Sell pressure bar */}
        <div className="mt-3 rounded-lg border border-border bg-panel p-3">
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
      </Section>

      {/* ============ FUTURES ============ */}
      <Section title="Futures" tag="Long / Short">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Tile label="Fut LTP">
            <span className="text-slate-300">₹{n(f.ltp)}</span>
          </Tile>
          <Tile label="OI">
            <span className="text-slate-300">{oi(f.oi)}</span>
          </Tile>
          <Tile label="Chg OI">
            <span className={f.chg_oi >= 0 ? 'text-up' : 'text-down'}>{signed(f.chg_oi)}</span>
          </Tile>
          <Tile label="Premium / Disc">
            <span className={f.premium >= 0 ? 'text-up' : 'text-down'}>
              {signed(f.premium)} ({signed(f.premium_pct)}%)
            </span>
          </Tile>
          <Tile label="OI Buildup">
            <Chip text={f.buildup} />
          </Tile>
        </div>
      </Section>

      {/* ============ OPTIONS ============ */}
      <Section title="Options" tag="CE / PE">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="PCR">
            <span className={o.pcr >= 1 ? 'text-up' : 'text-down'}>{n(o.pcr)}</span>
          </Tile>
          <Tile label="Max Pain">
            <span className="text-slate-300">{n(o.max_pain)}</span>
          </Tile>
          <Tile label="ATM">
            <span className="text-slate-300">{n(o.atm)}</span>
          </Tile>
          <Tile label="ATM IV / Δ">
            <span className="text-sm text-slate-300">
              {o.atm_iv}% · {o.atm_ce_delta}/{o.atm_pe_delta}
            </span>
          </Tile>
        </div>

        {/* CE vs PE OI + buildup */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-panel p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-up">Calls (CE)</span>
              <Chip text={o.ce_buildup} />
            </div>
            <div className="mt-1 font-mono text-sm text-slate-300">
              OI {oi(o.total_ce_oi)}{' '}
              <span className={o.ce_chg_oi >= 0 ? 'text-up' : 'text-down'}>
                ({signed(o.ce_chg_oi)})
              </span>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-panel p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-down">Puts (PE)</span>
              <Chip text={o.pe_buildup} />
            </div>
            <div className="mt-1 font-mono text-sm text-slate-300">
              OI {oi(o.total_pe_oi)}{' '}
              <span className={o.pe_chg_oi >= 0 ? 'text-up' : 'text-down'}>
                ({signed(o.pe_chg_oi)})
              </span>
            </div>
          </div>
        </div>

        {/* Chain table */}
        <div className="mt-3 max-h-[360px] overflow-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-right font-mono text-xs">
            <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-up">CE OI</th>
                <th className="px-3 py-2 text-up">CE LTP</th>
                <th className="px-3 py-2 text-center text-slate-400">Strike</th>
                <th className="px-3 py-2 text-down">PE LTP</th>
                <th className="px-3 py-2 text-down">PE OI</th>
              </tr>
            </thead>
            <tbody>
              {o.strikes.map((s) => {
                const isAtm = s.strike === o.atm
                return (
                  <tr
                    key={s.strike}
                    className={`border-t border-border/50 ${isAtm ? 'bg-indigo/10' : ''}`}
                  >
                    <td className="px-3 py-1 text-slate-400">{oi(s.ce.oi)}</td>
                    <td className="px-3 py-1 text-up">{n(s.ce.ltp)}</td>
                    <td
                      className={`px-3 py-1 text-center font-semibold ${
                        isAtm ? 'text-indigo' : 'text-slate-300'
                      }`}
                    >
                      {n(s.strike, 0)}
                    </td>
                    <td className="px-3 py-1 text-down">{n(s.pe.ltp)}</td>
                    <td className="px-3 py-1 text-slate-400">{oi(s.pe.oi)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {atmRow && (
          <p className="mt-2 text-[11px] text-slate-600">
            ATM {o.atm}: CE {n(atmRow.ce.ltp)} (Δ {atmRow.ce.delta}, θ {atmRow.ce.theta}) · PE{' '}
            {n(atmRow.pe.ltp)} (Δ {atmRow.pe.delta}, θ {atmRow.pe.theta})
          </p>
        )}
      </Section>
    </div>
  )
}
