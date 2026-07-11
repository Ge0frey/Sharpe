import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  resolve: {
    alias: {
      // A bare `buffer` specifier resolves to Vite's Node-builtin stub, whose
      // `Buffer` is undefined in the browser ("Module 'buffer' has been
      // externalized for browser compatibility"). The trailing slash forces
      // resolution to the npm package instead.
      buffer: 'buffer/',
    },
  },
  optimizeDeps: {
    // @solana/spl-token reads Buffer at module scope. Pre-bundling these keeps
    // their evaluation inside the dep-optimizer, after src/polyfills.ts has run.
    include: ['buffer', '@solana/spl-token', '@solana/web3.js', '@coral-xyz/anchor'],
  },
  define: {
    global: 'globalThis',
  },
  server: {
    // TxOdds' API sends no CORS headers, so the browser blocks direct calls.
    // Proxy /txapi through the dev server (server-to-server, no CORS). SSE
    // streams pass through fine. Mirrors the /txapi rewrite in vercel.json.
    proxy: {
      '/txapi': {
        target: 'https://txline-dev.txodds.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/txapi/, ''),
      },
    },
  },
})
