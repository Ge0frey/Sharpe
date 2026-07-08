const env = import.meta.env;

export const CFG = {
  api: (env.VITE_TXLINE_API as string) ?? "https://txline-dev.txodds.com",
  jwt: (env.VITE_TXLINE_JWT as string) ?? "",
  apiToken: (env.VITE_TXLINE_API_TOKEN as string) ?? "",
  rpc: (env.VITE_RPC_URL as string) ?? "https://api.devnet.solana.com",
  clvProgram: (env.VITE_CLV_PROGRAM as string) ?? "734ZWmPmAMGSjCshLCJQRpPNiaWBQsdaZDkvP3MAGmLz",
  txoracle: (env.VITE_TXORACLE_PROGRAM as string) ?? "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
  // Only these two finished World Cup fixtures have full devnet data (scores+odds).
  demoFixtures: [18172379, 18179551] as number[],
};

export const hasDataToken = () => Boolean(CFG.jwt && CFG.apiToken);

// The two finished World Cup matches with full devnet data. They age out of the
// live /fixtures/snapshot window, so we keep their metadata to always feature them.
export const DEMO_FIXTURE_META: any[] = [
  { FixtureId: 18172379, Competition: "World Cup", CompetitionId: 72, Participant1: "USA", Participant2: "Bosnia & Herzegovina", Participant1IsHome: true, StartTime: 1782950400000 },
  { FixtureId: 18179551, Competition: "World Cup", CompetitionId: 72, Participant1: "Spain", Participant2: "Austria", Participant1IsHome: true, StartTime: 1783018800000 },
];
