import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PublicKey } from '@solana/web3.js'
import { useClv } from '../state/useClv'
import { useAuth } from '../state/auth'
import { txline } from '../lib/txline'
import { DUEL_MARKETS, isSettleableLine, marketKey, type DuelMarket, statKeys } from '../lib/domain'
import { createDuel, joinDuel, cancelDuel, refundDuel, resolveDuel, claimDuel, listDuels, usdtBalance } from '../chain/actions'
import { explorerAddr, explorerTx } from '../lib/explorer'
import { isUserRejection } from '../lib/wallet'
import { useToast } from '../state/toast'
import { Button, Card, Badge } from '../components/ui'
import Icon from '../components/Icon'
import { Skeleton } from '../components/Skeleton'

const statusOf = (d: any) => Object.keys(d.status)[0]
const usdt = (n: any) => (Number(n) / 1e6).toFixed(2)

/** Mirrors `DUEL_REFUND_GRACE_MS` in programs/clv/src/constants.rs. */
const REFUND_GRACE_MS = 7 * 24 * 60 * 60 * 1000
const refundable = (d: any) => statusOf(d) === 'matched' && Date.now() > Number(d.expiresAt) + REFUND_GRACE_MS

export default function Duels() {
  const { clv, connected, wallet } = useClv()
  const { ready } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)

  const fixtures = useQuery({ queryKey: ['fixtures'], enabled: ready, queryFn: () => txline.fixtures() })
  const duels = useQuery({ queryKey: ['duels'], queryFn: () => listDuels(clv) })
  const balance = useQuery({
    queryKey: ['usdt', wallet?.publicKey?.toBase58()],
    enabled: !!wallet,
    queryFn: () => usdtBalance(clv, wallet!.publicKey),
  })

  // A duel can only be created before the proven kickoff.
  const upcoming = useMemo(
    () => (fixtures.data ?? []).filter((f: any) => Number(f.StartTime) > Date.now()).sort((a: any, b: any) => a.StartTime - b.StartTime),
    [fixtures.data],
  )

  async function act(label: string, fn: () => Promise<string>) {
    setBusy(label)
    try {
      const sig = await fn()
      toast.success(`${label} confirmed`, { href: explorerTx(sig) })
      qc.invalidateQueries({ queryKey: ['duels'] })
      qc.invalidateQueries({ queryKey: ['usdt'] })
    } catch (e: any) {
      if (!isUserRejection(e)) toast.error(e?.message ?? String(e))
    } finally { setBusy(null) }
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-display font-extrabold text-[#1E3A5F] mb-2">Prop duels</h1>
        <p className="text-slate-500 max-w-2xl leading-relaxed">
          Head-to-head wagers on markets no bookmaker lists — combined corners, cards, first-half totals.
          Both stakes sit in a neutral vault whose only authority is the program. A Merkle proof of the
          final stats decides the winner. No admin, no oracle, no rake.
        </p>
        {wallet && (
          <div className="mt-3 text-sm text-slate-500">
            Your devnet USDT: <span className="font-num font-bold text-[#1E3A5F]">{balance.data?.toFixed(2) ?? '—'}</span>
            {' · '}<a className="text-[#FF6B35] font-bold hover:underline" href="/onboard">get more from the TxLINE faucet</a>
          </div>
        )}
      </header>

      {connected && <CreateForm fixtures={upcoming} onCreate={(f, m, s, over) => act('Create duel', async () => (await createDuel(clv, f, m, s, over)).sig)} busy={busy === 'Create duel'} />}

      <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-10 mb-4">Open & settled duels</h2>
      {duels.isLoading && <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>}
      {duels.data?.length === 0 && (
        <Card className="p-10 text-center text-slate-400 text-sm">No duels yet. Create the first one.</Card>
      )}
      <div className="space-y-3">
        {(duels.data ?? []).map((d: any) => (
          <DuelRow key={d.pubkey} d={d} me={wallet?.publicKey?.toBase58()} busy={busy}
            onJoin={() => act('Join duel', () => joinDuel(clv, new PublicKey(d.pubkey)))}
            onCancel={() => act('Cancel duel', () => cancelDuel(clv, new PublicKey(d.pubkey)))}
            onResolve={() => act('Resolve duel', () => resolveDuel(clv, new PublicKey(d.pubkey)))}
            onClaim={() => act('Claim duel', () => claimDuel(clv, new PublicKey(d.pubkey)))}
            onRefund={() => act('Refund duel', () => refundDuel(clv, new PublicKey(d.pubkey)))} />
        ))}
      </div>
    </div>
  )
}

function CreateForm({ fixtures, onCreate, busy }: {
  fixtures: any[]
  onCreate: (fixtureId: number, m: DuelMarket, stake: number, takesOver: boolean) => void
  busy: boolean
}) {
  const [fixtureId, setFixtureId] = useState<number | null>(null)
  const [mk, setMk] = useState(DUEL_MARKETS[0].key)
  const [line, setLine] = useState(DUEL_MARKETS[0].lineX10)
  const [stake, setStake] = useState(5)
  const [over, setOver] = useState(true)

  const base = DUEL_MARKETS.find((m) => m.key === mk)!
  const market: DuelMarket = { ...base, lineX10: line }
  const [ka, kb] = statKeys(market.family, market.period)
  const singleStat = marketKey(market.marketArg) === 'teamTotal'
  // `selection` 2/3 addresses participant 2, so a TeamTotal on the away side proves key B.
  const shownKeys = singleStat ? String(market.selection >= 2 ? kb : ka) : `${ka} + ${kb}`
  const lineOk = isSettleableLine(line)
  const fx = fixtures.find((f) => f.FixtureId === fixtureId)

  return (
    <Card className="p-6">
      <h2 className="text-base font-display font-extrabold text-[#1E3A5F] mb-4">Offer a duel</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Match">
          <select className="w-full bg-[#F8F7F5] rounded-xl px-3 py-2.5 text-sm" value={fixtureId ?? ''}
            onChange={(e) => setFixtureId(Number(e.target.value) || null)}>
            <option value="">Select an upcoming match…</option>
            {fixtures.map((f) => (
              <option key={f.FixtureId} value={f.FixtureId}>
                {f.Participant1} v {f.Participant2} — {new Date(Number(f.StartTime)).toUTCString().slice(0, 22)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Market">
          <select className="w-full bg-[#F8F7F5] rounded-xl px-3 py-2.5 text-sm" value={mk}
            onChange={(e) => { const m = DUEL_MARKETS.find((x) => x.key === e.target.value)!; setMk(m.key); setLine(m.lineX10) }}>
            {DUEL_MARKETS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </Field>

        <Field label={`Line ×10 (half-integer; stat ${shownKeys})`}>
          <input type="number" step="1" min="5" className="w-full bg-[#F8F7F5] rounded-xl px-3 py-2.5 text-sm font-num"
            value={line} onChange={(e) => setLine(Number(e.target.value))} />
          <p className={`text-[11px] mt-1 ${lineOk ? 'text-slate-400' : 'text-amber-600'}`}>
            {lineOk ? market.describe(line) : 'Must end in .5 — a whole line can push, and a push has no boolean answer.'}
          </p>
        </Field>

        <Field label="Your stake (devnet USDT)">
          <input type="number" step="1" min="1" className="w-full bg-[#F8F7F5] rounded-xl px-3 py-2.5 text-sm font-num"
            value={stake} onChange={(e) => setStake(Number(e.target.value))} />
        </Field>
      </div>

      <div className="flex items-center gap-2 mt-4 mb-5">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-2">You take</span>
        {[true, false].map((o) => (
          <button key={String(o)} type="button" onClick={() => setOver(o)}
            className={`px-4 py-2 rounded-xl text-sm font-bold ${over === o ? 'bg-[#FF6B35]/10 ring-2 ring-[#FF6B35] text-[#1E3A5F]' : 'bg-[#F8F7F5] text-slate-500'}`}>
            {o ? market.sides[0] : market.sides[1]}
          </button>
        ))}
      </div>

      <Button className="w-full py-3.5" disabled={busy || !fixtureId || !lineOk || stake <= 0}
        onClick={() => fixtureId && onCreate(fixtureId, market, stake, over)}>
        {busy ? 'Escrowing…' : `Offer ${stake} USDT · ${over ? market.sides[0] : market.sides[1]} ${(line / 10).toFixed(1)}`}
      </Button>
      {fx && (
        <p className="text-[11px] text-slate-400 mt-3 text-center">
          Locks at the proven kickoff, {new Date(Number(fx.StartTime)).toUTCString()}.
        </p>
      )}
    </Card>
  )
}

function DuelRow({ d, me, busy, onJoin, onCancel, onResolve, onClaim, onRefund }: any) {
  const st = statusOf(d)
  const mine = me === d.creator.toBase58()
  const isTaker = me === d.taker.toBase58()
  const winner = d.outcomeTrue === d.creatorTakesTrue ? d.creator : d.taker
  const iWon = st !== 'matched' && me === winner.toBase58()

  const tone = { open: 'amber', matched: 'navy', resolved: 'accent', settled: 'green', cancelled: 'muted', refunded: 'muted' }[st] ?? 'muted'

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={tone as any}>{st}</Badge>
        <div className="font-bold text-sm text-[#1E3A5F]">
          {d.hasStatB ? `stat ${d.statAKey} + ${d.statBKey}` : `stat ${d.statAKey}`}
          {' '}{d.comparison === 1 ? '<' : d.comparison === 2 ? '=' : '>'} {d.threshold}
        </div>
        <div className="text-xs text-slate-400 font-num">fixture {String(d.fixtureId)}</div>
        <div className="ml-auto font-num text-sm font-bold text-[#1E3A5F]">
          {usdt(d.stakeAmount)} <span className="text-slate-400 font-normal">USDT/side</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-500">
        <span>creator takes <b className="text-[#1E3A5F]">{d.creatorTakesTrue ? 'Over' : 'Under'}</b>{mine && ' (you)'}</span>
        {st !== 'open' && <span>taker takes <b className="text-[#1E3A5F]">{d.creatorTakesTrue ? 'Under' : 'Over'}</b>{isTaker && ' (you)'}</span>}
        {(st === 'resolved' || st === 'settled') && (
          <span>proven predicate <b className="text-[#1E3A5F]">{String(d.outcomeTrue)}</b> → winner <a className="text-[#FF6B35] hover:underline" href={explorerAddr(winner.toBase58())} target="_blank" rel="noreferrer">{winner.toBase58().slice(0, 8)}…</a>{iWon && ' (you)'}</span>
        )}
        <a className="text-slate-400 hover:text-[#FF6B35] inline-flex items-center gap-1" href={explorerAddr(d.pubkey)} target="_blank" rel="noreferrer">
          escrow <Icon icon="lucide:external-link" className="text-[10px]" />
        </a>
      </div>

      <div className="flex gap-2 mt-4">
        {st === 'open' && !mine && <Button onClick={onJoin} disabled={!!busy}>Take the other side</Button>}
        {st === 'open' && mine && <Button variant="outline" onClick={onCancel} disabled={!!busy}>Cancel & refund</Button>}
        {st === 'matched' && <Button variant="outline" onClick={onResolve} disabled={!!busy}>Resolve from proof</Button>}
        {refundable(d) && (
          <button type="button" onClick={onRefund} disabled={!!busy}
            className="text-[11px] font-bold text-slate-400 hover:text-[#FF6B35] px-2"
            title="The result never became provable. Both sides take their own stake back.">
            Refund both sides
          </button>
        )}
        {st === 'resolved' && <Button onClick={onClaim} disabled={!!busy}>Pay the winner</Button>}
        {st === 'settled' && <span className="text-xs text-emerald-600 font-bold inline-flex items-center gap-1.5"><Icon icon="lucide:shield-check" /> paid {usdt(Number(d.stakeAmount) * 2)} USDT</span>}
      </div>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</span>
      {children}
    </label>
  )
}
