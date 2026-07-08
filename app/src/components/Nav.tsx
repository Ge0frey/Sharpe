import { Link, useLocation } from 'react-router-dom'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import Icon from './Icon'

export default function Nav() {
  const loc = useLocation()
  const link = (to: string, label: string, prefix?: string) => {
    const active = prefix ? loc.pathname.startsWith(prefix) : loc.pathname === to
    return (
      <Link to={to} className={`text-sm transition-colors ${
        active
          ? 'text-[#1E3A5F] font-bold underline decoration-2 decoration-[#FF6B35] underline-offset-8'
          : 'text-slate-400 font-medium hover:text-[#1E3A5F]'
      }`}>{label}</Link>
    )
  }
  return (
    <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md shadow-sm">
      <div className="h-[3px] accent-gradient" />
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-[72px] flex items-center justify-between">
        <div className="flex items-center gap-10">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-[#1E3A5F] flex items-center justify-center">
              <Icon icon="lucide:line-chart" className="text-white text-lg" />
            </div>
            <span className="font-display font-extrabold text-xl text-[#1E3A5F]">Sharpe</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            {link('/matches', 'Matches', '/match')}
            {link('/portfolio', 'Portfolio')}
            {link('/leaderboard', 'Leaderboard')}
          </nav>
        </div>
        <WalletMultiButton />
      </div>
    </header>
  )
}
