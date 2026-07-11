const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Build output directory. Overridable so a production build can be made (and
  // Lighthouse-measured) without clobbering the `.next` cache of a running
  // `next dev` — see the "don't `next build` while `next dev` runs" gotcha.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Compile the shared TS package directly from source.
  transpilePackages: ['@archivato/shared'],
  // Emit a self-contained server bundle for Docker (`.next/standalone`).
  // Vercel builds its own output and does not need (or want) standalone, so skip
  // it there — `VERCEL` is set on every Vercel build. NEXT_SKIP_STANDALONE skips
  // it for local measurement builds too: the copy step trips over Windows file
  // locks (antivirus scanning fresh chunks), and a Lighthouse run doesn't need it.
  output:
    process.env.VERCEL || process.env.NEXT_SKIP_STANDALONE
      ? undefined
      : 'standalone',
  // In a monorepo, trace workspace deps from the repo root so the standalone
  // output includes @archivato/shared and hoisted node_modules.
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

module.exports = nextConfig;
