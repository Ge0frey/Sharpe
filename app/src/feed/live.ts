import { txline } from "../lib/txline";
import type { FeedSource } from "./index";

/**
 * The real SSE streams.
 *
 * Reconnects with exponential backoff and resumes from the last event id, so a
 * dropped connection does not lose the odds ticks between then and now.
 * Deduplicates by `MessageId` (odds) and `Seq` (scores) — a resume can replay
 * the boundary event.
 */
export class LiveFeed implements FeedSource {
  readonly mode = "live" as const;
  private aborts = new Set<AbortController>();

  now() { return Date.now(); }

  private stream(
    kind: "odds" | "scores",
    fixtureId: number,
    cb: (x: any) => void,
    idOf: (x: any) => string | number | undefined,
  ): () => void {
    const ctl = new AbortController();
    this.aborts.add(ctl);
    const seen = new Set<string>();
    let lastEventId: string | undefined;
    let backoff = 1000;

    (async () => {
      while (!ctl.signal.aborted) {
        try {
          const fn = kind === "odds" ? txline.streamOdds : txline.streamScores;
          lastEventId = await fn((rec) => {
            const id = idOf(rec);
            if (id == null) return;
            const k = String(id);
            if (seen.has(k)) return; // a resume can repeat the boundary event
            seen.add(k);
            cb(rec);
          }, ctl.signal, fixtureId, lastEventId);
          backoff = 1000; // clean end of stream, not an error
        } catch (e) {
          if (ctl.signal.aborted) return;
          await new Promise((r) => setTimeout(r, backoff));
          backoff = Math.min(backoff * 2, 30_000);
        }
      }
    })();

    return () => { ctl.abort(); this.aborts.delete(ctl); };
  }

  subscribeOdds(fixtureId: number, cb: (o: any) => void) {
    return this.stream("odds", fixtureId, cb, (o) => o?.MessageId);
  }
  subscribeScores(fixtureId: number, cb: (s: any) => void) {
    return this.stream("scores", fixtureId, cb, (s) => s?.Seq);
  }
  stop() { for (const a of this.aborts) a.abort(); this.aborts.clear(); }
}
