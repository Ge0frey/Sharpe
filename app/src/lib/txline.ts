import { CFG, getCreds } from "../config";

/** Both headers are required on every data call. Credentials come from /onboard. */
const headers = () => {
  const c = getCreds();
  if (!c) throw new Error("not onboarded — visit /onboard to provision the free World Cup tier");
  return { Authorization: `Bearer ${c.jwt}`, "X-Api-Token": c.apiToken };
};

async function get<T = any>(path: string, params?: Record<string, any>): Promise<T> {
  const url = new URL(CFG.api + path, window.location.origin);
  if (params) for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  const r = await fetch(url.toString(), { headers: headers() });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

export const txline = {
  /** Forward-looking: finished fixtures fall out of this window. Use `fixtureValidation` for those. */
  fixtures: () => get<any[]>("/api/fixtures/snapshot"),
  /** Resolves metadata for ANY fixture id, finished or not — and proves it. */
  fixtureValidation: (fixtureId: number) => get("/api/fixtures/validation", { fixtureId }),

  oddsSnapshot: (id: number, asOf?: number) => get<any[]>(`/api/odds/snapshot/${id}`, asOf ? { asOf } : undefined),
  /** 5-minute bucket of odds updates. Dense near kickoff; the replay ladder. */
  oddsUpdates: (epochDay: number, hourOfDay: number, interval: number, fixtureId?: number) =>
    get<any[]>(`/api/odds/updates/${epochDay}/${hourOfDay}/${interval}`, fixtureId ? { fixtureId } : undefined),
  oddsValidation: (messageId: string, ts: number) => get("/api/odds/validation", { messageId, ts }),

  scoresSnapshot: (id: number, asOf?: number) => get<any[]>(`/api/scores/snapshot/${id}`, asOf ? { asOf } : undefined),
  statValidation: (fixtureId: number, seq: number, statKey: number, statKey2?: number) =>
    get("/api/scores/stat-validation", { fixtureId, seq, statKey, statKey2 }),

  streamScores: (onMsg: (d: any) => void, signal: AbortSignal, fixtureId?: number, lastEventId?: string) =>
    streamSse("/api/scores/stream", onMsg, signal, fixtureId, lastEventId),
  streamOdds: (onMsg: (d: any) => void, signal: AbortSignal, fixtureId?: number, lastEventId?: string) =>
    streamSse("/api/odds/stream", onMsg, signal, fixtureId, lastEventId),
};

// ── SSE over fetch (EventSource cannot set auth headers) ─────────────────────

function parseSseBlock(block: string): { id?: string; event?: string; data: string } | null {
  let data = "", event: string | undefined, id: string | undefined;
  for (const raw of block.split(/\r?\n/)) {
    if (!raw || raw.startsWith(":")) continue;
    const i = raw.indexOf(":");
    const field = i === -1 ? raw : raw.slice(0, i);
    const value = i === -1 ? "" : raw.slice(i + 1).replace(/^ /, "");
    if (field === "data") data += value + "\n";
    if (field === "event") event = value;
    if (field === "id") id = value;
  }
  data = data.replace(/\n$/, "");
  return data || event ? { id, event, data } : null;
}

/**
 * Heartbeats arrive roughly every 20s; a shorter probe window looks like a dead
 * stream. `Last-Event-ID` (format `"<epochMs>:<index>"`) resumes after a drop.
 * Returns the last event id seen, so a reconnect can pick up where it left off.
 */
async function streamSse(
  path: string,
  onMsg: (d: any) => void,
  signal: AbortSignal,
  fixtureId?: number,
  lastEventId?: string,
): Promise<string | undefined> {
  const url = new URL(CFG.api + path, window.location.origin);
  if (fixtureId) url.searchParams.set("fixtureId", String(fixtureId));

  const h: Record<string, string> = { ...headers(), Accept: "text/event-stream", "Cache-Control": "no-cache" };
  if (lastEventId) h["Last-Event-ID"] = lastEventId;

  const r = await fetch(url.toString(), { headers: h, signal });
  if (!r.ok || !r.body) throw new Error(`stream ${path} -> ${r.status}`);

  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let seen = lastEventId;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let sep = buf.match(/\r?\n\r?\n/);
    while (sep?.index !== undefined) {
      const block = buf.slice(0, sep.index);
      buf = buf.slice(sep.index + sep[0].length);
      const msg = parseSseBlock(block);
      if (msg) {
        if (msg.id) seen = msg.id;
        if (msg.event !== "heartbeat") {
          try { onMsg(JSON.parse(msg.data)); } catch { /* keep-alive or partial */ }
        }
      }
      sep = buf.match(/\r?\n\r?\n/);
    }
  }
  return seen;
}
