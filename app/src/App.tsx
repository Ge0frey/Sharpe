import { Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'
import Icon from './components/Icon'
import Matches from './pages/Matches'
import MatchDetail from './pages/MatchDetail'
import Portfolio from './pages/Portfolio'
import Leaderboard from './pages/Leaderboard'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-14">
        <Routes>
          <Route path="/" element={<Matches />} />
          <Route path="/match/:id" element={<MatchDetail />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="bg-white border-t border-slate-100 py-8">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-[#1E3A5F]/10 flex items-center justify-center">
              <Icon icon="lucide:shield-check" className="text-[#FF6B35] text-sm" />
            </div>
            <p className="text-sm text-slate-500">
              Every entry line, closing line, and result is a <span className="text-[#FF6B35] font-bold">Merkle proof</span> verified on Solana via TxLINE. No oracle to trust.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Devnet Active
          </div>
        </div>
      </footer>
    </div>
  )
}
