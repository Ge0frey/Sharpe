import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PublicKey } from '@solana/web3.js'
import { useClv } from '../state/useClv'
import { listPredictions, proveEntry, settleClose, settleOutcome, voidPrediction, provenKickoff } from '../chain/actions'
import { useFixtures } from '../state/fixtures'
import { marketFromAccount, pickOddsFor } from '../lib/domain'
import { Card, Button, Badge, CLV } from '../components/ui'
import Icon from '../components/Icon'
import Flag from '../components/Flag'
import { CountUp } from '../components/motion'
import { Sparkline, Meter } from '../components/graphics'
import { RowSkeleton } from '../components/Skeleton'
import VerifyModal from '../components/VerifyModal'
import { explorerAddr, explorerTx } from '../lib/explorer'
import { isUserRejection } from '../lib/wallet'
import { useToast } from '../state/toast'

const statusKey = (s: any) => Object.keys(s ?? {})[0] ?? 'unknown'

/**
 * The MarketDef a stored Prediction corresponds to — needed to find its odds record.
 * Derived from market + period + selection + line, because `selection` alone cannot
 * tell a 1X2 home bet from a Totals over.
 */
const marketOf = (p: any) => marketFromAccount(p)
const labelOf = (p: any) => marketOf(p).label

export default function Portfolio() {
  const { clv, wallet, connected } = useClv()
  const toast = useToast()
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [verify, setVerify] = useState<{ pred: any; fixture: any } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const { data: preds = [], isLoading } = useQuery({ queryKey: ['predictions'], queryFn: () => listPredictions(clv) })
  // Predictions outlive the fixtures snapshot, so resolve their matches by id.
  const { byId } = useFixtures(preds.map((p: any) => Number(p.fixtureId)))
  const fixtureOf = (id: number) => byId.get(id)

  const mine = connected ? preds.filter((p: any) => p.predictor.toBase58() === wallet!.publicKey.toBase58()) : preds
  const sorted = [...mine].sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt))

  // Only RANKED predictions score. `ranked` is set on-chain as
  // `Clock::now < proven_kickoff` — a backtest on a finished match still settles,
  // it just cannot claim skill it never demonstrated.
  let cumClv = 0, closedCount = 0, settledCount = 0, wins = 0, backtests = 0
  const series: number[] = [0]
  const chrono = [...mine].sort((a: any, b: any) => Number(a.createdAt) - Number(b.createdAt))
  for (const p of chrono) {
    const st = statusKey(p.status)
    if (!p.ranked) { backtests++; continue }
    if (st === 'closed' || st === 'settled') { cumClv += Number(p.clvBps); closedCount++; series.push(cumClv) }
    if (st === 'settled') { settledCount++; if (p.outcomeWin) wins++ }
  }
  const hitRate = settledCount ? Math.round((wins / settledCount) * 100) : 0

  /** The odds root covering the entry quote posts on the next 5-minute batch. */
  async function doProveEntry(p: any) {
    setBusy(p.pubkey); setErr(null)
    try {
      const m = marketOf(p)
      const rec = await pickOddsFor(Number(p.fixtureId), Number(p.entryTs), m)
      if (!rec) throw new Error('entry quote not archived yet — try again shortly')
      const sig = await proveEntry(clv, new PublicKey(p.pubkey), rec, m.priceIndex)
      toast.success('Entry line proven on-chain', { href: explorerTx(sig) })
      qc.invalidateQueries({ queryKey: ['predictions'] })
    } catch (e: any) { if (!isUserRejection(e)) setErr(e?.message ?? String(e)) } finally { setBusy(null) }
  }

  async function doSettleClose(p: any) {
    setBusy(p.pubkey); setErr(null)
    try {
      const start = await provenKickoff(clv, Number(p.fixtureId))
      const m = marketOf(p)
      // The closing line is the last quote before the whistle; the program refuses
      // anything timestamped after the proven kickoff or flagged in-play.
      const closeRec = (await pickOddsFor(Number(p.fixtureId), start - 60_000, m))
        ?? (await pickOddsFor(Number(p.fixtureId), start - 300_000, m))
        ?? (await pickOddsFor(Number(p.fixtureId), start - 900_000, m))
      if (!closeRec) throw new Error('no closing line found')
      const sig = await settleClose(clv, new PublicKey(p.pubkey), Number(p.fixtureId), closeRec, m.priceIndex)
      toast.success('Closing line proven', { href: explorerTx(sig) })
      qc.invalidateQueries({ queryKey: ['predictions'] })
    } catch (e: any) { if (!isUserRejection(e)) setErr(e?.message ?? String(e)) } finally { setBusy(null) }
  }

  async function doVoid(p: any) {
    setBusy(p.pubkey); setErr(null)
    try {
      const sig = await voidPrediction(clv, new PublicKey(p.pubkey))
      toast.success('Prediction voided, rent reclaimed', { href: explorerTx(sig) })
      qc.invalidateQueries({ queryKey: ['predictions'] })
    } catch (e: any) { if (!isUserRejection(e)) setErr(e?.message ?? String(e)) } finally { setBusy(null) }
  }
  async function doSettleOutcome(p: any) {
    setBusy(p.pubkey); setErr(null)
    try {
      const sig = await settleOutcome(clv, new PublicKey(p.pubkey), Number(p.fixtureId))
      toast.success('Result settled on-chain', { href: explorerTx(sig) })
      qc.invalidateQueries({ queryKey: ['predictions'] })
    } catch (e: any) { if (!isUserRejection(e)) setErr(e?.message ?? String(e)) } finally { setBusy(null) }
  }

  return (
    <div>
      {/* Header */}
      <header className="mb-8 reveal">
        <div className="flex items-center gap-4 mb-3">
          <span className="font-num text-sm font-bold text-[#FF6B35]/60">01</span>
          <h1 className="text-4xl md:text-5xl font-display font-extrabold text-ink">Your Portfolio</h1>
        </div>
        <p className="text-lg text-slate-600 max-w-2xl">
          {connected
            ? <>Every settled call is scored by <span className="text-[#FF6B35] font-bold">Closing Line Value</span> — the definitive benchmark of betting skill.</>
            : <>Connect a wallet to make and settle calls. Showing <span className="text-ink font-bold">all predictions</span> on the program.</>}
        </p>
      </header>

      {/* Stat strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <Card className="p-5 reveal md:col-span-1">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cumulative CLV</div>
              <div className="text-3xl font-display font-extrabold mt-1">
                {closedCount
                  ? <CountUp value={cumClv} className={cumClv >= 0 ? 'text-emerald-500' : 'text-red-500'} format={(n) => `${n >= 0 ? '+' : ''}${(n / 100).toFixed(2)}%`} />
                  : <span className="text-slate-300">—</span>}
              </div>
            </div>
            {series.length > 2 && <Sparkline points={series} className="w-28 h-9" stroke={cumClv >= 0 ? '#10B981' : '#EF4444'} />}
          </div>
        </Card>
        <Card className="p-5 reveal" style={{ animationDelay: '70ms' }}>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hit rate</div>
          <div className="text-3xl font-display font-extrabold text-ink mt-1 tabular">
            {settledCount ? <CountUp value={hitRate} format={(n) => `${Math.round(n)}%`} /> : <span className="text-slate-300">—</span>}
          </div>
          <div className="text-xs text-slate-400 mt-1">{settledCount} settled call{settledCount === 1 ? '' : 's'}</div>
        </Card>
        <Card className="p-5 reveal" style={{ animationDelay: '140ms' }}>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Open calls</div>
          <div className="text-3xl font-display font-extrabold text-ink mt-1 tabular">
            <CountUp value={mine.length} />
          </div>
          <div className="text-xs text-slate-400 mt-1">{closedCount} scored · {backtests} backtest</div>
        </Card>
      </div>

      {err && (
        <div className="mb-4 bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 break-words flex items-start gap-2">
          <Icon icon="lucide:triangle-alert" className="mt-0.5 shrink-0" /> {err}
        </div>
      )}
      {isLoading && <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <RowSkeleton key={i} />)}</div>}
      {!isLoading && sorted.length === 0 && (
        <Card className="p-12 text-center">
          <Icon icon="lucide:inbox" className="text-4xl text-slate-300" />
          <p className="text-slate-400 mt-3">No predictions yet. Pick a match and lock a line.</p>
        </Card>
      )}

      <div className="space-y-3">
        {sorted.map((p: any, i: number) => {
          const fx = fixtureOf(Number(p.fixtureId))
          const st = statusKey(p.status)
          const settled = st === 'settled'
          const closed = st === 'closed'
          return (
            <Card key={p.pubkey} className="p-5 reveal" style={{ animationDelay: `${i * 55}ms` }}>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                <div className="min-w-[200px]">
                  <div className="font-bold text-ink flex items-center gap-2">
                    {fx ? (
                      <>
                        <Flag name={fx.Participant1} className="text-base" /> {fx.Participant1}
                        <span className="text-slate-300 text-xs font-semibold">vs</span>
                        <Flag name={fx.Participant2} className="text-base" /> {fx.Participant2}
                      </>
                    ) : `Fixture ${p.fixtureId}`}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">Selection · <span className="text-[#FF6B35] font-semibold">{labelOf(p)}</span></div>
                  <a href={explorerAddr(p.pubkey)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-[#FF6B35] transition-colors">
                    <Icon icon="lucide:external-link" className="text-[10px]" aria-hidden /> on-chain
                  </a>
                </div>
                <Stat label="Entry" value={p.entryProbBps ? `${(p.entryProbBps / 100).toFixed(2)}%` : <span className="text-slate-300">pending proof</span>} />
                <Stat label="Close" value={p.closeProbBps ? `${(p.closeProbBps / 100).toFixed(2)}%` : '—'} />
                <div className="min-w-[120px]">
                  <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">CLV</div>
                  <div className="font-num text-sm mt-0.5">{p.closeProbBps ? <CLV bps={Number(p.clvBps)} /> : <span className="text-slate-300">—</span>}</div>
                  {!!p.closeProbBps && <div className="mt-1.5"><Meter bps={Number(p.clvBps)} /></div>}
                </div>
                <Stat label="Result" value={settled ? (p.outcomeWin ? <Badge tone="green">Won</Badge> : <Badge tone="red">Lost</Badge>) : <span className="text-slate-300">—</span>} />
                <div className="ml-auto flex items-center gap-2">
                  {!p.ranked && <Badge tone="muted">Backtest</Badge>}
                  {st === 'open' && <Button variant="outline" disabled={busy === p.pubkey} onClick={() => doProveEntry(p)}>{busy === p.pubkey ? '…' : 'Prove entry'}</Button>}
                  {st === 'entryProven' && <Badge tone="amber">Entry proven</Badge>}
                  {st === 'entryProven' && <Button variant="outline" disabled={busy === p.pubkey} onClick={() => doSettleClose(p)}>{busy === p.pubkey ? '…' : 'Settle close'}</Button>}
                  {closed && <Button variant="outline" disabled={busy === p.pubkey} onClick={() => doSettleOutcome(p)}>{busy === p.pubkey ? '…' : 'Settle result'}</Button>}
                  {!settled && connected && p.predictor.toBase58() === wallet?.publicKey.toBase58() && (
                    <button type="button" onClick={() => doVoid(p)} disabled={busy === p.pubkey}
                      className="text-[11px] font-bold text-slate-400 hover:text-red-500 px-2">Void</button>
                  )}
                  {(closed || settled) && (
                    <Button onClick={() => setVerify({ pred: p, fixture: fx })}>
                      <span className="inline-flex items-center gap-1.5"><Icon icon="lucide:file-check" /> Verify</span>
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Info */}
      <div className="mt-10 bg-white/70 ring-inset rounded-2xl p-6 flex gap-4 items-start">
        <div className="w-10 h-10 rounded-xl bg-ink/8 flex items-center justify-center shrink-0">
          <Icon icon="lucide:info" className="text-lg text-ink" />
        </div>
        <div>
          <h3 className="font-bold text-ink mb-1">How is CLV calculated?</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            CLV = closing implied probability − entry implied probability, for the side you picked. A positive result means you secured a better price
            than the final market consensus before kickoff — the gold standard for identifying long-term skill over short-term luck.
            Only <b>ranked</b> calls score: the program sets <code className="font-num text-xs">ranked</code> to true only when you commit before a
            kickoff it proved against the fixtures Merkle root. Calls made on finished matches settle exactly the same way, but are marked
            <b> Backtest</b> and never reach the leaderboard.
          </p>
        </div>
      </div>

      {verify && <VerifyModal pred={verify.pred} fixture={verify.fixture} onClose={() => setVerify(null)} />}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{label}</div>
      <div className="font-num text-sm font-semibold text-ink mt-0.5">{value}</div>
    </div>
  )
}
