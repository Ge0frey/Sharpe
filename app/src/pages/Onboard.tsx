import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useWallet } from '@solana/wallet-adapter-react'
import { useAuth } from '../state/auth'
import { useClv } from '../state/useClv'
import { requestFaucet } from '../lib/auth'
import { usdtBalance } from '../chain/actions'
import { explorerTx } from '../lib/explorer'
import { isUserRejection } from '../lib/wallet'
import { useToast } from '../state/toast'
import { Button, Card } from '../components/ui'
import Icon from '../components/Icon'

const STEPS = [
  { id: 'jwt', title: 'Guest token', detail: 'POST /auth/guest/start — a 30-day JWT, no account needed.' },
  { id: 'subscribe', title: 'Subscribe (free)', detail: 'subscribe(1, 4) on-chain — World Cup tier, 4 weeks, costs 0 TxL.' },
  { id: 'sign', title: 'Prove ownership', detail: 'Sign `txSig::jwt` so the subscription and the token cannot be replayed apart.' },
  { id: 'activate', title: 'Activate', detail: 'POST /api/token/activate — returns your personal API token.' },
] as const

export default function Onboard() {
  const { connected, publicKey } = useWallet()
  const { creds, step, busy, error, run, reset } = useAuth()
  const { clv } = useClv()
  const toast = useToast()
  const nav = useNavigate()
  const [usdt, setUsdt] = useState<number | null>(null)
  const [faucetBusy, setFaucetBusy] = useState(false)

  useEffect(() => {
    if (!publicKey) { setUsdt(null); return }
    usdtBalance(clv, publicKey).then(setUsdt).catch(() => setUsdt(0))
  }, [publicKey, clv, faucetBusy])

  const activeIdx = step ? STEPS.findIndex((s) => s.id === step) : -1
  const doneAll = Boolean(creds)

  async function faucet() {
    setFaucetBusy(true)
    try {
      const sig = await requestFaucet(clv.provider as any)
      toast.success('Devnet USDT received from the TxLINE faucet', { href: explorerTx(sig) })
    } catch (e: any) {
      if (!isUserRejection(e)) toast.error(e?.message ?? String(e))
    } finally { setFaucetBusy(false) }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-display font-extrabold text-[#1E3A5F] mb-2">Get set up</h1>
      <p className="text-slate-500 mb-8 leading-relaxed">
        Sharpe reads TxLINE's free World Cup tier. No credentials are shipped with this app —
        your wallet provisions its own, once, and they stay in your browser.
      </p>

      <Card className="p-6 mb-6">
        {!connected ? (
          <div className="text-center py-6">
            <p className="text-sm text-slate-500 mb-4">Connect a devnet wallet to begin.</p>
            <WalletMultiButton />
          </div>
        ) : (
          <>
            <ol className="space-y-4 mb-6">
              {STEPS.map((s, i) => {
                const state = doneAll || (activeIdx > i) ? 'done' : activeIdx === i ? 'active' : 'idle'
                return (
                  <li key={s.id} className="flex gap-3">
                    <span className={`mt-0.5 w-6 h-6 shrink-0 rounded-full grid place-items-center text-[11px] font-bold ${
                      state === 'done' ? 'bg-emerald-100 text-emerald-600'
                        : state === 'active' ? 'bg-[#FF6B35]/15 text-[#FF6B35]'
                        : 'bg-slate-100 text-slate-400'}`}>
                      {state === 'done' ? <Icon icon="lucide:check" />
                        : state === 'active' ? <Icon icon="lucide:loader-circle" className="animate-spin" />
                        : i + 1}
                    </span>
                    <div>
                      <div className="text-sm font-bold text-[#1E3A5F]">{s.title}</div>
                      <div className="text-xs text-slate-500 leading-relaxed">{s.detail}</div>
                    </div>
                  </li>
                )
              })}
            </ol>

            {doneAll ? (
              <div className="space-y-3">
                <div className="bg-emerald-50 text-emerald-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
                  <Icon icon="lucide:shield-check" /> Activated. Your data token is stored locally.
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => nav('/matches')}>Browse matches →</Button>
                  <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 px-3">Reset</button>
                </div>
              </div>
            ) : (
              <Button onClick={run} disabled={busy} className="w-full py-3.5">
                {busy ? 'Provisioning…' : 'Provision the free World Cup tier'}
              </Button>
            )}
            {error && <p className="text-red-500 text-xs mt-3 break-words">{error}</p>}
          </>
        )}
      </Card>

      {connected && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-[#1E3A5F]">Devnet USDT</h2>
            <span className="font-num text-sm font-bold text-[#1E3A5F]">{usdt === null ? '—' : `${usdt.toFixed(2)}`}</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mb-4">
            Prop duels are staked in devnet USDT, never in TxL — the TxLINE credit token is locked
            to its program for data authorisation and cannot be transferred peer-to-peer.
          </p>
          <Button variant="ghost" className="w-full" onClick={faucet} disabled={faucetBusy}>
            {faucetBusy ? 'Requesting…' : "Get devnet USDT from TxLINE's faucet"}
          </Button>
        </Card>
      )}
    </div>
  )
}
