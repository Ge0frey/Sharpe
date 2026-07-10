import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { setCreds, getCreds } from '../config'
import { loadCreds, clearCreds, onboard, type Creds, type OnboardStep } from '../lib/auth'
import { useClv } from './useClv'

type AuthCtx = {
  creds: Creds | null
  ready: boolean
  step: OnboardStep | null
  busy: boolean
  error: string | null
  run: () => Promise<void>
  reset: () => void
}

const Ctx = createContext<AuthCtx>({
  creds: null, ready: false, step: null, busy: false, error: null,
  run: async () => {}, reset: () => {},
})

/**
 * Holds the wallet's TxLINE credentials. They are provisioned once per wallet on
 * /onboard and cached in localStorage — nothing is baked into the bundle, so the
 * repo can be public and each judge mints their own free World Cup tier.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage } = useWallet()
  const { clv } = useClv()
  const [creds, setLocal] = useState<Creds | null>(null)
  const [step, setStep] = useState<OnboardStep | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wallet = publicKey?.toBase58() ?? null

  // Re-hydrate whenever the connected wallet changes; creds are per-wallet.
  useEffect(() => {
    const c = wallet ? loadCreds(wallet) : null
    setLocal(c)
    setCreds(c)
    setError(null)
  }, [wallet])

  const run = useCallback(async () => {
    if (!wallet || !signMessage) { setError('Connect a wallet that can sign messages.'); return }
    setBusy(true); setError(null)
    try {
      const c = await onboard(clv.provider as any, signMessage, setStep)
      setLocal(c); setCreds(c)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally { setBusy(false); setStep(null) }
  }, [wallet, signMessage, clv])

  const reset = useCallback(() => {
    if (wallet) clearCreds(wallet)
    setLocal(null); setCreds(null)
  }, [wallet])

  const value = useMemo(
    () => ({ creds, ready: Boolean(creds && getCreds()), step, busy, error, run, reset }),
    [creds, step, busy, error, run, reset],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
