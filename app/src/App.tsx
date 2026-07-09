import type { ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'
import Footer from './components/Footer'
import ScrollToTop from './components/ScrollToTop'
import Landing from './pages/Landing'
import Matches from './pages/Matches'
import MatchDetail from './pages/MatchDetail'
import Portfolio from './pages/Portfolio'
import Leaderboard from './pages/Leaderboard'

/** Constrained column for the in-app screens. The landing is full-bleed and opts out. */
function Shell({ children }: { children: ReactNode }) {
  return <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-14">{children}</main>
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <ScrollToTop />
      <Nav />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/matches" element={<Shell><Matches /></Shell>} />
        <Route path="/match/:id" element={<Shell><MatchDetail /></Shell>} />
        <Route path="/portfolio" element={<Shell><Portfolio /></Shell>} />
        <Route path="/leaderboard" element={<Shell><Leaderboard /></Shell>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Footer />
    </div>
  )
}
