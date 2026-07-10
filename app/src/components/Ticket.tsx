import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useClv } from '../state/useClv'
import { txline } from '../lib/txline'
import { availableMarkets, findOdds, probPct, decimal, type MarketDef } from '../lib/domain'
import { openPrediction } from '../chain/actions'
import { explorerTx } from '../lib/explorer'
import { isUserRejection, useSolBalance } from '../lib/wallet'
import { useToast } from '../state/toast'
import { Button, Card } from './ui'
import Icon from './Icon'
import { Skeleton } from './Skeleton'

export default function Ticket({ fixture }: { fixture: any }) {
  const { clv, connected, wallet } = useClv()
  const balance = useSolBalance(wallet?.publicKey)
  const toast = useToast()
  const qc = useQueryClient()
  const start = Number(fixture.StartTime)
  const fixtureId = fixture.FixtureId
  const [group, setGroup] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ sig: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // One snapshot, every market. For an upcoming match take the live quotes; for a
  // finished one, the archived pre-match book. Either way `entry_ts` must predate
  // the proven kickoff, so never ask for a time at or after it.
  const { data: offers = [], isLoading } = useQuery({
    queryKey: ['book', fixtureId],
    queryFn: async () => {
      for (const asOf of [Math.min(Date.now(), start - 60_000), start - 3600_000, start - 3 * 3600_000]) {
        const d = await txline.oddsSnapshot(fixtureId, asOf).catch(() => [])
        if (Array.isArray(d) && d.length) return d
      }
      return []
    },
  })

  // Totals lines come from the feed, not a hardcoded list, and lines the program
  // refuses (quarter lines, whole lines) are dropped before the user sees them.
  const groups = useMemo(() => availableMarkets(offers), [offers])
  const activeGroup = groups.find((g) => g.key === group) ?? groups[0]
  const market: MarketDef | undefined =
    activeGroup?.markets.find((m) => m.key === sel) ?? activeGroup?.markets[0]
  const entryRec = market ? findOdds(offers, market) : null

  async function submit() {
    if (!entryRec || !market) return
    setBusy(true); setErr(null)
    try {
      const r = await openPrediction(clv, fixtureId, market, entryRec)
      setDone({ sig: r.sig })
      toast.success('Call committed on-chain', { href: explorerTx(r.sig) })
      qc.invalidateQueries({ queryKey: ['predictions'] })
    } catch (e: any) {
      if (!isUserRejection(e)) setErr(e?.message ?? String(e))
    } finally { setBusy(false) }
  }

  if (done) return (
    <Card className="p-8 text-center elev-lg animate-pop">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 mx-auto flex items-center justify-center mb-4 ring-pulse">
        <Icon icon="lucide:shield-check" className="text-emerald-500 text-3xl" />
      </div>
      <div className="text-lg font-display font-extrabold text-ink mb-1">Call committed on-chain</div>
      <p className="text-sm text-slate-500 leading-relaxed mb-5">
        Your entry quote is pinned by its message hash. TxLINE publishes the odds Merkle root for it on the
        next 5-minute batch — then anyone (you, or the keeper) can prove the line. Track it in your portfolio.
      </p>
      <Link to="/portfolio"><Button className="w-full">Go to Portfolio →</Button></Link>
      <a href={explorerTx(done.sig)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#FF6B35] hover:underline">
        View transaction <Icon icon="lucide:external-link" className="text-[10px]" aria-hidden />
      </a>
    </Card>
  )

  return (
    <Card className="overflow-hidden elev-lg">
      <div className="accent-gradient px-6 py-4 flex items-center gap-2 text-white relative">
        <Icon icon="lucide:ticket" className="text-xl" />
        <h2 className="text-base font-display font-extrabold tracking-tight">SKILL TICKET</h2>
        <span className="ml-auto font-num text-[10px] font-bold uppercase tracking-widest opacity-80">No stake</span>
        <span className="absolute -bottom-2 left-0 w-4 h-4 rounded-full bg-[#F8F7F5] -translate-x-1/2" />
        <span className="absolute -bottom-2 right-0 w-4 h-4 rounded-full bg-[#F8F7F5] translate-x-1/2" />
      </div>

      <div className="p-6">
        {isLoading && (
          <div className="space-y-5" aria-busy="true">
            <Skeleton className="h-3 w-24" />
            <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        )}

        {!isLoading && groups.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">No settleable markets are priced for this fixture yet.</p>
        )}

        {activeGroup && market && (
          <>
            {groups.length > 1 && (
              <div className="flex gap-1 mb-4 p-1 rounded-xl bg-[#F8F7F5]">
                {groups.map((g) => (
                  <button key={g.key} type="button" aria-pressed={g.key === activeGroup.key}
                    onClick={() => { setGroup(g.key); setSel(null) }}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                      g.key === activeGroup.key ? 'bg-white text-ink shadow-sm' : 'text-slate-400 hover:text-ink'}`}>
                    {g.label}
                  </button>
                ))}
              </div>
            )}

            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Select your call</label>
            <div className={`grid gap-2 mb-5 ${activeGroup.markets.length % 3 === 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {activeGroup.markets.map((m) => {
                const rec = findOdds(offers, m)
                const price = rec?.Prices[m.priceIndex]
                const active = m.key === market.key
                return (
                  <button key={m.key} type="button" aria-pressed={active} disabled={!price}
                    onClick={() => setSel(m.key)}
                    className={`rounded-xl p-3 text-center transition-[transform,background-color,box-shadow] duration-150 ease-out disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 ${
                      active
                        ? 'bg-[#FF6B35]/10 ring-2 ring-[#FF6B35] text-ink -translate-y-0.5 shadow-sm'
                        : 'bg-[#F8F7F5] hover:bg-slate-100 text-ink'
                    }`}>
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{m.label}</div>
                    <div className="font-num font-extrabold text-lg mt-1">{price ? decimal(price) : '—'}</div>
                    <div className="font-num text-[11px] text-slate-400">{price ? `${probPct(price).toFixed(1)}%` : 'not priced'}</div>
                  </button>
                )
              })}
            </div>

            <div className="bg-[#F8F7F5] rounded-xl p-4 mb-5 space-y-2.5">
              <Row label="Your call" value={market.label} />
              <Row label="Entry implied prob" value={entryRec ? `${probPct(entryRec.Prices[market.priceIndex]).toFixed(2)}%` : '—'} accent />
              <Row label="Settles on stat keys" value={market.period === 1 ? '1001 / 1002' : '1 / 2'} />
              <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500 leading-relaxed">
                Scored against the closing consensus line, both proven via <span className="text-ink font-bold">validate_odds</span>.
                Ranked only if you commit before the kickoff proven by <span className="text-ink font-bold">validate_fixture</span>. No stake.
              </div>
            </div>

            {connected ? (
              <>
                {balance !== null && balance < 0.002 && (
                  <div className="mb-3 text-xs bg-amber-50 text-amber-700 rounded-xl px-3 py-2.5 flex items-start gap-2">
                    <Icon icon="lucide:fuel" className="mt-0.5 shrink-0" aria-hidden />
                    <span>This wallet has no devnet SOL for rent + fees.{' '}
                      <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" className="font-bold underline">Get devnet SOL ↗</a>
                    </span>
                  </div>
                )}
                <Button onClick={submit} disabled={busy || !entryRec || (balance !== null && balance < 0.002)} className="w-full py-4 text-base">
                  {busy
                    ? <span className="inline-flex items-center gap-2"><Icon icon="lucide:loader-circle" className="animate-spin" /> Committing on-chain…</span>
                    : <span className="inline-flex items-center gap-2">
                        Lock {market.label}{entryRec ? ` at ${probPct(entryRec.Prices[market.priceIndex]).toFixed(1)}%` : ''} <Icon icon="lucide:arrow-right" />
                      </span>}
                </Button>
              </>
            ) : (
              <div className="text-sm text-slate-500 text-center py-3 bg-[#F8F7F5] rounded-xl">Connect a devnet wallet to lock a call.</div>
            )}

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
      <span className={`font-num text-sm font-bold ${accent ? 'text-[#FF6B35]' : 'text-ink'}`}>{value}</span>
    </div>
  )
}
