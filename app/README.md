# Sharpe — web app

The React frontend for [Sharpe](../README.md): commit predictions, prove entry and closing lines against TxLINE's Merkle roots on Solana, and settle CLV bets and prop duels. Talks to the `clv` program on Solana devnet and the TxLINE World Cup data tier. No backend of its own — every proof and settlement is a permissionless on-chain call the UI exposes as a button.

**Live:** https://sharpe-dusky.vercel.app (Solana devnet)

## Stack

- **Vite 8** + **React 19** (React Compiler on via `babel-plugin-react-compiler`), TypeScript
- **Tailwind CSS 4** (`@tailwindcss/vite`)
- **Solana**: `@solana/web3.js`, `@coral-xyz/anchor`, `@solana/spl-token`, wallet-adapter (`react` + `react-ui` + `wallets`)
- **@tanstack/react-query** for chain/feed state, **react-router-dom 7** for routing, **recharts** for the odds chart
- **@noble/hashes** + **tweetnacl** for the sha256 commitments and TxLINE auth signatures
- **Vitest** for the codec and domain golden-vector tests

## Quickstart

```bash
npm install
npm test        # 38 tests: codec + domain golden vectors
npm run dev
```

No `.env` is required to run — `src/config.ts` falls back to devnet defaults with `??`. Each wallet provisions TxLINE's free World Cup tier itself at `/onboard`, in one click.

### Scripts

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b` typecheck, then `vite build` to `dist/` |
| `npm run preview` | Serve the built `dist/` |
| `npm test` | `vitest run` |
| `npm run lint` | ESLint |

## Environment

Copy `.env.example` to `.env.local`. Vite inlines `VITE_*` at **build** time, so on Vercel set these in the dashboard (Production + Preview) before the first build — a variable added after a deploy does nothing until you rebuild. An empty string is not nullish; leave a variable out entirely rather than set it to `""`.

| Var | Purpose |
|---|---|
| `VITE_TXLINE_API` | API base, default `/txapi` — a same-origin path proxied to `https://txline-dev.txodds.com` (dev via `vite.config.ts`, prod via `vercel.json`) to dodge CORS. Direct cross-origin calls are blocked |
| `VITE_RPC_URL` | Solana RPC. Use a dedicated RPC (e.g. Helius) — `api.devnet.solana.com` throttles the `getProgramAccounts` calls that Portfolio, Duels and Leaderboard make every render |
| `VITE_CLV_PROGRAM` | Display-only (Footer, Landing). The program the app actually talks to comes from `src/chain/idl/clv.json`'s `address` field |
| `VITE_TXORACLE_PROGRAM` | Display-only |

## Layout

```
src/
  main.tsx, App.tsx, polyfills.ts   entry, routes, Buffer/global shims
  config.ts                         env with devnet fallbacks
  pages/
    Landing.tsx                     the pitch
    Onboard.tsx                     one-click TxLINE World Cup tier provisioning
    Matches.tsx                     live + replay fixtures
    MatchDetail.tsx                 open a prediction; the odds chart
    Duels.tsx                       create / join / resolve / claim prop duels
    Portfolio.tsx                   prove_entry, settle_close, settle_outcome buttons
    Leaderboard.tsx                 ranked CLV, backtests excluded
  feed/{live,replay}.ts             one FeedSource, two implementations
  lib/
    auth.ts, txline.ts              TxLINE signing + API
    codec.ts (+ .test.ts)           16 golden-vector tests vs frozen /validation responses
    domain.ts (+ .test.ts)          22 tests: market derivation + odds selection
    __fixtures__/                   frozen real TxLINE /validation responses
  chain/{program,actions}.ts        Anchor program + instruction builders
  chain/idl/                        clv + txoracle IDLs
  components/VerifyModal.tsx        four live .view() calls into TxLINE
  state/                            react-query providers, auth, feed, toast
```

## Build notes

- `src/polyfills.ts` must run before any `@solana/*` module reads `Buffer` at module scope. `vite.config.ts` pre-bundles `buffer`, `@solana/spl-token`, `@solana/web3.js` and `@coral-xyz/anchor` and aliases bare `buffer` → `buffer/` (trailing slash forces the npm package, not Vite's browser stub).
- `vercel.json` proxies `/txapi/*` to `https://txline-dev.txodds.com/*` (CORS), rewrites all other paths to `/index.html` (SPA), and sets `nosniff`, `DENY` framing, and a strict referrer policy.

See the [root README](../README.md) for the on-chain program, settlement guards, and deployed addresses, and [docs/USER-FLOW.md](../docs/USER-FLOW.md) for the full cold-tab-to-settled-bet walkthrough.
