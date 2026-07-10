/**
 * One feed interface, two implementations.
 *
 * LIVE   — the TxLINE SSE streams, filtered by fixture, resumable via Last-Event-ID.
 * REPLAY — a finished fixture's archived odds ladder and scores, re-emitted on an
 *          accelerated clock.
 *
 * Replay exists because the tournament ends before the judging window: without it
 * there is nothing to ingest and the app looks static. It is not a mock — every
 * record it emits is a real TxLINE record, and every one of them still proves.
 */
export type FeedMode = "live" | "replay";

export interface FeedSource {
  readonly mode: FeedMode;
  /** Simulated wall-clock (ms). For live this is `Date.now()`. */
  now(): number;
  subscribeOdds(fixtureId: number, cb: (o: any) => void): () => void;
  subscribeScores(fixtureId: number, cb: (s: any) => void): () => void;
  stop(): void;
}

export { LiveFeed } from "./live";
export { ReplayFeed } from "./replay";
