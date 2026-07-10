import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LiveFeed, ReplayFeed, type FeedMode, type FeedSource } from '../feed'

type FeedCtx = {
  mode: FeedMode
  speed: number
  setMode: (m: FeedMode) => void
  setSpeed: (s: number) => void
}

const Ctx = createContext<FeedCtx | null>(null)

/**
 * Chooses which TxLINE feed the app ingests. LIVE is the real SSE stream; REPLAY
 * re-emits a finished fixture's archived records on an accelerated clock, which is
 * the only way the app has anything to ingest once the tournament is over.
 */
export function FeedProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<FeedMode>('live')
  const [speed, setSpeed] = useState(30)
  const value = useMemo(() => ({ mode, speed, setMode, setSpeed }), [mode, speed])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useFeed() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useFeed must be used inside <FeedProvider>')
  return c
}

/** Live odds + scores for one fixture, through whichever source is active. */
export function useFixtureFeed(fixtureId: number | null, kickoff: number | null) {
  const { mode, speed } = useFeed()
  const [odds, setOdds] = useState<any[]>([])
  const [scores, setScores] = useState<any[]>([])
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    if (!fixtureId) return
    setOdds([])
    setScores([])

    const src: FeedSource =
      mode === 'replay' && kickoff ? new ReplayFeed(fixtureId, kickoff, speed) : new LiveFeed()

    const unsubs = [
      src.subscribeOdds(fixtureId, (o) =>
        setOdds((prev) => (prev.some((x) => x.MessageId === o.MessageId) ? prev : [...prev, o]))),
      src.subscribeScores(fixtureId, (s) =>
        setScores((prev) => (prev.some((x) => x.Seq === s.Seq) ? prev : [...prev, s]))),
    ]
    if (src instanceof ReplayFeed) void src.start().catch(() => {})

    const tick = setInterval(() => setClock(src.now()), 250)
    return () => {
      clearInterval(tick)
      unsubs.forEach((u) => u())
      src.stop()
    }
  }, [fixtureId, kickoff, mode, speed])

  return { odds, scores, clock, mode }
}
