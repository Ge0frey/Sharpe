import { useMemo } from 'react'
import { useAnchorWallet } from '@solana/wallet-adapter-react'
import { Keypair } from '@solana/web3.js'
import { getProvider, clvProgram, txoracleProgram } from '../chain/program'

function dummyWallet() {
  const kp = Keypair.generate()
  return { publicKey: kp.publicKey, signTransaction: async (t: any) => t, signAllTransactions: async (t: any) => t }
}

/** Anchor programs bound to the connected wallet (or a read-only dummy for views/reads). */
export function useClv() {
  const wallet = useAnchorWallet()
  const provider = useMemo(() => getProvider(wallet ?? dummyWallet()), [wallet])
  const clv = useMemo(() => clvProgram(provider), [provider])
  const txo = useMemo(() => txoracleProgram(provider), [provider])
  return { wallet, connected: !!wallet, clv, txo }
}
