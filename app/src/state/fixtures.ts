import { useQuery } from '@tanstack/react-query'
import { txline } from '../lib/txline'
import { DEMO_FIXTURE_META } from '../config'
import { listProvenFixtures } from '../chain/actions'
import { useClv } from './useClv'

/** The fields a fixture card needs. `/fixtures/snapshot` and `/fixtures/validation` both carry them. */
export type FixtureMeta = {
  FixtureId: number
  Competition: string
  CompetitionId: number
  Participant1: string
  Participant2: string
  Participant1IsHome: boolean
  StartTime: number
}

const uniq = (ids: number[]) =>
  [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b)

/**
 * `/fixtures/snapshot` is a forward-looking window and drops a fixture the moment it
 * finishes. `/fixtures/validation` resolves any fixture, finished or not.
 */
export async function fetchFixtureMeta(fixtureId: number): Promise<FixtureMeta | null> {
  try {
    const s = (await txline.fixtureValidation(fixtureId) as any).snapshot
    return {
      // `snapshot.FixtureId` is the internal packed id, whose high bits carry a sport
      // tag. The public id every other endpoint uses is the one we asked for.
      FixtureId: fixtureId,
      Competition: s.Competition,
      CompetitionId: s.CompetitionId,
      Participant1: s.Participant1,
      Participant2: s.Participant2,
      Participant1IsHome: !!s.Participant1IsHome,
      StartTime: Number(s.StartTime),
    }
  } catch {
    return null // no credentials, or TxLINE cannot resolve it. Callers fall back to the id.
  }
}

/** Fixture ids with a Merkle-proven kickoff on-chain. */
export function useProvenFixtureIds(): number[] {
  const { clv } = useClv()
  const { data = [] } = useQuery({
    queryKey: ['proven-fixtures'],
    staleTime: 60_000,
    queryFn: () => listProvenFixtures(clv),
  })
  return uniq((data as any[]).map((f) => Number(f.fixtureId)))
}

/**
 * Every fixture we can render, keyed by public id. Merges the live snapshot, the
 * hardcoded demo set, and anything else named in `extraIds` that the snapshot has
 * already dropped.
 */
export function useFixtures(extraIds: number[] = []) {
  const snapshot = useQuery({ queryKey: ['fixtures'], queryFn: txline.fixtures })
  const rows: any[] = (snapshot.data as any[]) ?? []

  const known = new Set<number>([
    ...rows.map((f) => Number(f.FixtureId)),
    ...DEMO_FIXTURE_META.map((f) => f.FixtureId),
  ])
  const missing = uniq(extraIds).filter((id) => !known.has(id))

  const extra = useQuery({
    queryKey: ['fixture-meta', missing],
    enabled: missing.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      (await Promise.all(missing.map(fetchFixtureMeta))).filter(Boolean) as FixtureMeta[],
  })

  const byId = new Map<number, FixtureMeta>()
  for (const f of rows) byId.set(Number(f.FixtureId), f as FixtureMeta)
  for (const f of DEMO_FIXTURE_META) byId.set(f.FixtureId, f as FixtureMeta)
  for (const f of extra.data ?? []) byId.set(f.FixtureId, f)

  return {
    byId,
    fixture: (id: number) => byId.get(id),
    /** Raw `/fixtures/snapshot` rows: forward-looking, so effectively the upcoming board. */
    rows,
    isLoading: snapshot.isLoading || extra.isLoading,
    error: snapshot.error,
  }
}
