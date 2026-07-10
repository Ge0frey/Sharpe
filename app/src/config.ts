// Read each key by name. `const env = import.meta.env` makes Vite inline the WHOLE
// env object into the bundle — every VITE_* in .env.local, secrets included.
export const CFG = {
  api: (import.meta.env.VITE_TXLINE_API as string) ?? "https://txline-dev.txodds.com",
  rpc: (import.meta.env.VITE_RPC_URL as string) ?? "https://api.devnet.solana.com",
  clvProgram: (import.meta.env.VITE_CLV_PROGRAM as string) ?? "734ZWmPmAMGSjCshLCJQRpPNiaWBQsdaZDkvP3MAGmLz",
  txoracle: (import.meta.env.VITE_TXORACLE_PROGRAM as string) ?? "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
  // Devnet mints. TxL is Token-2022 and is data-authorisation only — never staked
  // or transferred peer-to-peer. USDT (classic SPL) is the duel stake.
  txlMint: "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
  usdtMint: "ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh",
  /** Finished fixtures with complete devnet data (scores + archived odds) — the replay demo. */
  demoFixtures: [18172379, 18179551] as number[],
};

// ─────────────────────────────────────────────────────────────────────────────
// Credentials.
//
// There is deliberately no VITE_TXLINE_JWT / VITE_TXLINE_API_TOKEN here. Vite
// inlines every VITE_* value into the built bundle, so a shared token would ship
// to anyone who loads the site — and expire 30 days later, taking the demo with
// it. Each wallet provisions the free World Cup tier itself on /onboard, and the
// tokens live in localStorage. See `src/lib/auth.ts`.
// ─────────────────────────────────────────────────────────────────────────────

let creds: { jwt: string; apiToken: string } | null = null;

export const setCreds = (c: { jwt: string; apiToken: string } | null) => { creds = c; };
export const getCreds = () => creds;
export const hasDataToken = () => Boolean(creds?.jwt && creds?.apiToken);

/**
 * `/fixtures/snapshot` is forward-looking and drops fixtures once they finish, so
 * the demo matches carry their own metadata. (Their kickoff is still proven
 * on-chain via `validate_fixture` — this is only for rendering a card.)
 */
export const DEMO_FIXTURE_META: any[] = [
  { FixtureId: 18172379, Competition: "World Cup", CompetitionId: 72, Participant1: "USA", Participant2: "Bosnia & Herzegovina", Participant1IsHome: true, StartTime: 1782950400000 },
  { FixtureId: 18179551, Competition: "World Cup", CompetitionId: 72, Participant1: "Spain", Participant2: "Austria", Participant1IsHome: true, StartTime: 1783018800000 },
];
