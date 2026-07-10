import { useMemo, type ReactNode } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@solana/wallet-adapter-react-ui/styles.css'
import { CFG } from '../config'
import { ToastProvider } from './toast'
import { AuthProvider } from './auth'
import { FeedProvider } from './feed'

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } })

export function AppProviders({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], [])
  // AuthProvider sits inside WalletProvider (it reads the connected wallet) and
  // outside everything that fetches, since TxLINE calls need its credentials.
  return (
    <ConnectionProvider endpoint={CFG.rpc}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <QueryClientProvider client={qc}>
            <ToastProvider>
              <AuthProvider>
                <FeedProvider>{children}</FeedProvider>
              </AuthProvider>
            </ToastProvider>
          </QueryClientProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
