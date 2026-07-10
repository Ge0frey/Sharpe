/**
 * Node globals that Solana libraries expect, installed before anything else loads.
 *
 * This MUST be the first import in `main.tsx`, and it must be a separate module.
 * ES modules evaluate every import in declaration order *before* any statement in
 * the importing module's body runs — so assigning `globalThis.Buffer` inside
 * `main.tsx` happens far too late: `@solana/spl-token` reads `Buffer` at its own
 * top level and throws `ReferenceError: Buffer is not defined` while the import
 * graph is still being evaluated.
 *
 * `vite.config.ts` aliases `buffer` to the npm package, because Vite otherwise
 * resolves the bare specifier to its Node-builtin stub, whose `Buffer` is
 * `undefined` in the browser.
 */
import { Buffer } from "buffer";

const g = globalThis as any;
g.Buffer ??= Buffer;
g.global ??= globalThis;

if (import.meta.env.DEV && typeof g.Buffer?.from !== "function") {
  throw new Error("Buffer polyfill failed to install — check the `buffer` alias in vite.config.ts");
}
