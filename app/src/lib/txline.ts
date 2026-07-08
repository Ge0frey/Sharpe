import { CFG } from "../config";

const headers = () => ({ Authorization: `Bearer ${CFG.jwt}`, "X-Api-Token": CFG.apiToken });

async function get<T = any>(path: string, params?: Record<string, any>): Promise<T> {
  const url = new URL(CFG.api + path);
  if (params) for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  const r = await fetch(url.toString(), { headers: headers() });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

export const txline = {
  fixtures: () => get<any[]>("/api/fixtures/snapshot"),
  oddsSnapshot: (id: number, asOf?: number) => get<any[]>(`/api/odds/snapshot/${id}`, asOf ? { asOf } : undefined),
  scoresSnapshot: (id: number, asOf?: number) => get<any[]>(`/api/scores/snapshot/${id}`, asOf ? { asOf } : undefined),
  oddsValidation: (messageId: string, ts: number) => get("/api/odds/validation", { messageId, ts }),
  statValidation: (fixtureId: number, seq: number, statKey: number, statKey2?: number) =>
    get("/api/scores/stat-validation", { fixtureId, seq, statKey, statKey2 }),
  streamScores: (onMsg: (d: any) => void, signal: AbortSignal) => streamSse("/api/scores/stream", onMsg, signal),
  streamOdds: (onMsg: (d: any) => void, signal: AbortSignal) => streamSse("/api/odds/stream", onMsg, signal),
};

// ---- SSE over fetch (EventSource can't set auth headers) ----
function parseSseBlock(block: string): { event?: string; data: string } | null {
  let data = "", event: string | undefined;
  for (const raw of block.split(/\r?\n/)) {
    if (!raw || raw.startsWith(":")) continue;
    const i = raw.indexOf(":");
    const field = i === -1 ? raw : raw.slice(0, i);
    const value = i === -1 ? "" : raw.slice(i + 1).replace(/^ /, "");
    if (field === "data") data += value + "\n";
    if (field === "event") event = value;
  }
  data = data.replace(/\n$/, "");
  return data || event ? { event, data } : null;
}

async function streamSse(path: string, onMsg: (d: any) => void, signal: AbortSignal) {
  const r = await fetch(CFG.api + path, {
    headers: { ...headers(), Accept: "text/event-stream", "Cache-Control": "no-cache" },
    signal,
  });
  if (!r.ok || !r.body) throw new Error(`stream ${path} -> ${r.status}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let sep = buf.match(/\r?\n\r?\n/);
    while (sep?.index !== undefined) {
      const block = buf.slice(0, sep.index);
      buf = buf.slice(sep.index + sep[0].length);
      const msg = parseSseBlock(block);
      if (msg) { try { onMsg(JSON.parse(msg.data)); } catch { /* keep-alive */ } }
      sep = buf.match(/\r?\n\r?\n/);
    }
  }
}
