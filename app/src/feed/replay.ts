import { txline } from "../lib/txline";
import type { FeedSource } from "./index";

/**
 * Replays a finished fixture from its archived TxLINE data on an accelerated clock.
 *
 * The odds ladder comes from `/api/odds/updates/{epochDay}/{hour}/{interval}` —
 * 5-minute buckets covering the pre-kickoff window. On fixture 18172379 that is
 * ~1,950 records, thickening from 30 two hours out to 850 in the final five
 * minutes, which is what makes the chart move the way a real market does.
 *
 * Everything emitted here is a genuine record with a genuine Merkle proof. Replay
 * changes *when* records arrive, never *what* they say.
 */
const BUCKET_MS = 5 * 60_000;
const WINDOW_BEFORE_MS = 3 * 60 * 60_000; // 3h of pre-kickoff market
const WINDOW_AFTER_MS = 2.5 * 60 * 60_000; // through full time

type Sub = { at: number; rec: any; kind: "odds" | "scores" };

export class ReplayFeed implements FeedSource {
  readonly mode = "replay" as const;

  private events: Sub[] = [];
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private oddsCbs = new Set<(o: any) => void>();
  private scoresCbs = new Set<(s: any) => void>();
  private started = false;
  private startWall = 0;

  private readonly fixtureId: number
  private readonly kickoff: number
  private readonly speed: number

  /** @param speed wall-clock acceleration, e.g. 30 = 30x */
  constructor(fixtureId: number, kickoff: number, speed = 30) {
    // Parameter properties are erased syntax; tsconfig has `erasableSyntaxOnly`.
    this.fixtureId = fixtureId
    this.kickoff = kickoff
    this.speed = speed
  }

  /** Simulated match time, mapped from real elapsed time since `start()`. */
  now(): number {
    if (!this.started) return this.kickoff - WINDOW_BEFORE_MS;
    return this.kickoff - WINDOW_BEFORE_MS + (Date.now() - this.startWall) * this.speed;
  }

  private async loadOdds(): Promise<any[]> {
    const from = this.kickoff - WINDOW_BEFORE_MS;
    const buckets: Promise<any[]>[] = [];
    for (let t = from; t <= this.kickoff; t += BUCKET_MS) {
      const d = new Date(t);
      buckets.push(
        txline.oddsUpdates(Math.floor(t / 86_400_000), d.getUTCHours(), Math.floor(d.getUTCMinutes() / 5), this.fixtureId)
          .catch(() => [] as any[]),
      );
    }
    const all = (await Promise.all(buckets)).flat();
    // The bucket endpoint can return neighbours; keep this fixture, dedupe by MessageId.
    const seen = new Set<string>();
    return all
      .filter((o) => Number(o?.FixtureId) === this.fixtureId && o?.MessageId && !seen.has(o.MessageId) && seen.add(o.MessageId))
      .sort((a, b) => Number(a.Ts) - Number(b.Ts));
  }

  private async loadScores(): Promise<any[]> {
    const snap = await txline.scoresSnapshot(this.fixtureId).catch(() => [] as any[]);
    return (Array.isArray(snap) ? snap : [])
      .filter((e) => e?.Seq != null && Number(e.Ts) >= this.kickoff - WINDOW_BEFORE_MS)
      .sort((a, b) => Number(a.Seq) - Number(b.Seq));
  }

  /** Fetch the archive and schedule every record at its accelerated offset. */
  async start(): Promise<void> {
    if (this.started) return;
    const [odds, scores] = await Promise.all([this.loadOdds(), this.loadScores()]);
    const base = this.kickoff - WINDOW_BEFORE_MS;
    const horizon = this.kickoff + WINDOW_AFTER_MS;

    this.events = [
      ...odds.map((rec) => ({ at: Number(rec.Ts), rec, kind: "odds" as const })),
      ...scores.map((rec) => ({ at: Number(rec.Ts), rec, kind: "scores" as const })),
    ]
      .filter((e) => e.at >= base && e.at <= horizon)
      .sort((a, b) => a.at - b.at);

    this.started = true;
    this.startWall = Date.now();

    for (const e of this.events) {
      const delay = Math.max(0, (e.at - base) / this.speed);
      const t = setTimeout(() => {
        if (e.kind === "odds") this.oddsCbs.forEach((cb) => cb(e.rec));
        else this.scoresCbs.forEach((cb) => cb(e.rec));
      }, delay);
      this.timers.add(t);
    }
  }

  subscribeOdds(_fixtureId: number, cb: (o: any) => void) {
    this.oddsCbs.add(cb);
    return () => this.oddsCbs.delete(cb);
  }
  subscribeScores(_fixtureId: number, cb: (s: any) => void) {
    this.scoresCbs.add(cb);
    return () => this.scoresCbs.delete(cb);
  }
  stop() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.oddsCbs.clear();
    this.scoresCbs.clear();
    this.started = false;
  }
}
