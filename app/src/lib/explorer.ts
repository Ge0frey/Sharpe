import { CFG } from '../config'

// Solana Explorer links, cluster auto-detected from the configured RPC.
const cluster = CFG.rpc.includes('devnet')
  ? '?cluster=devnet'
  : CFG.rpc.includes('testnet')
    ? '?cluster=testnet'
    : ''

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}${cluster}`
export const explorerAddr = (addr: string) => `https://explorer.solana.com/address/${addr}${cluster}`
