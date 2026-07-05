import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useClv } from '../state/useClv'
import { MARKETS, pickOdds, probPct, decimal } from '../lib/domain'
import { openPrediction } from '../chain/actions'
import { Button, Card } from './ui'
import Icon from './Icon'

export default function Ticket({ fixture }: { fixture: any }) {
  const { clv, connected } = useClv()
  const qc = useQueryClient()
  const start = Number(fixture.StartTime)
  const fixtureId = fixture.FixtureId
  const [sel, setSel] = useState('home')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ sig: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // The "opening line" we lock as the entry (earliest available pre-match 1X2).
  const { data: entryRec, isLoading } = useQuery({
    queryKey: ['entryRec', fixtureId],
    queryFn: async () => (await pickOdds(fixtureId, start - 3 * 3600_000)) ?? (await pickOdds(fixtureId, start - 3600_000)),
  })

  const market = MARKETS.find((m) => m.key === sel)!

  async function submit() {
    if (!entryRec) return
    setBusy(true); setErr(null)
    try {
      const r = await openPrediction(clv, fixtureId, market, entryRec)
      setDone({ sig: r.sig })
      qc.invalidateQueries({ queryKey: ['predictions'] })
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally { setBusy(false) }
  }

  if (done) return (
    <Card className="p-8 text-center elev-lg animate-pop">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 mx-auto flex items-center justify-center mb-4 ring-pulse">
        <Icon icon="lucide:shield-check" className="text-emerald-500 text-3xl" />
      </div>
      <div className="text-lg font-display font-extrabold text-[#1E3A5F] mb-1">Entry line proven on-chain</div>
      <p className="text-sm text-slate-500 leading-relaxed mb-5">Your opening line is locked and cryptographically verified. Track your CLV in the portfolio.</p>
      <Link to="/portfolio"><Button className="w-full">Go to Portfolio →</Button></Link>
    </Card>
  )

  return (
    <Card className="overflow-hidden elev-lg">
      {/* Ticket header strip */}
      <div className="accent-gradient px-6 py-4 flex items-center gap-2 text-white relative">
        <Icon icon="lucide:ticket" className="text-xl" />
        <h2 className="text-base font-display font-extrabold tracking-tight">SKILL TICKET</h2>
        <span className="ml-auto font-num text-[10px] font-bold uppercase tracking-widest opacity-80">No stake</span>
        {/* perforation notches */}
        <span className="absolute -bottom-2 left-0 w-4 h-4 rounded-full bg-[#F8F7F5] -translate-x-1/2" />
        <span className="absolute -bottom-2 right-0 w-4 h-4 rounded-full bg-[#F8F7F5] translate-x-1/2" />
      </div>

      <div className="p-6">
        {isLoading && <p className="text-slate-400 text-sm">Loading opening line…</p>}
        {entryRec && (
          <>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Select your call</label>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {MARKETS.map((m) => {
                const price = entryRec.Prices[m.priceIndex]
                const active = sel === m.key
                return (
                  <button key={m.key} onClick={() => setSel(m.key)}
                    className={`rounded-xl p-3 text-center transition-all duration-300 ${
                      active
                        ? 'bg-[#FF6B35]/10 ring-2 ring-[#FF6B35] text-[#1E3A5F] -translate-y-0.5 shadow-sm'
                        : 'bg-[#F8F7F5] hover:bg-slate-100 text-[#1E3A5F]'
                    }`}>
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{m.label}</div>
                    <div className="font-num font-extrabold text-lg mt-1">{decimal(price)}</div>
                    <div className="font-num text-[11px] text-slate-400">{probPct(price).toFixed(1)}%</div>
                  </button>
                )
              })}
            </div>

            <div className="bg-[#F8F7F5] rounded-xl p-4 mb-5 space-y-2.5">
              <Row label="Your call" value={market.label} />
              <Row label="Entry implied prob" value={`${probPct(entryRec.Prices[market.priceIndex]).toFixed(2)}%`} accent />
              <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500 leading-relaxed">
                Proven from the consensus line via <span className="text-[#1E3A5F] font-bold">validate_odds</span>. Pure skill call — no stake.
              </div>
            </div>

            {connected
              ? <Button onClick={submit} disabled={busy} className="w-full py-4 text-base">
                  {busy
                    ? <span className="inline-flex items-center gap-2"><Icon icon="lucide:loader-circle" className="animate-spin" /> Proving entry on-chain…</span>
                    : <span className="inline-flex items-center gap-2">Lock {market.label} & prove entry <Icon icon="lucide:arrow-right" /></span>}
                </Button>
              : <div className="text-sm text-slate-500 text-center py-3 bg-[#F8F7F5] rounded-xl">Connect a devnet wallet to lock a call.</div>}

            {err && <p className="text-red-500 text-xs mt-3 break-words">{err}</p>}
          </>
        )}
      </div>
    </Card>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500 font-medium">{label}</span>
      <span className={`font-num text-sm font-bold ${accent ? 'text-[#FF6B35]' : 'text-[#1E3A5F]'}`}>{value}</span>
    </div>
  )
}
