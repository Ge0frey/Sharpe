import { useConnection } from '@solana/wallet-adapter-react'
import { useQuery } from '@tanstack/react-query'
import type { PublicKey } from '@solana/web3.js'

/** True when a thrown error is the user declining to sign — a cancel, not a failure. */
export function isUserRejection(e: any): boolean {
  const m = (e?.message ?? String(e ?? '')).toLowerCase()
  return (
    e?.code === 4001 ||
    m.includes('user rejected') ||
    m.includes('rejected the request') ||
    m.includes('user denied') ||
    m.includes('request rejected') ||
    m.includes('transaction was rejected')
  )
}

/** Devnet SOL balance (in SOL) for a wallet, or null while disconnected/loading. */
export function useSolBalance(publicKey: PublicKey | null | undefined) {
  const { connection } = useConnection()
  const { data } = useQuery({
    queryKey: ['sol-balance', publicKey?.toBase58()],
    enabled: !!publicKey,
    refetchInterval: 20_000,
    queryFn: async () => (publicKey ? (await connection.getBalance(publicKey)) / 1e9 : 0),
  })
  return data ?? null
}
