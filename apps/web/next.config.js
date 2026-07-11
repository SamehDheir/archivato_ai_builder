const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the shared TS package directly from source.
  transpilePackages: ['@archivato/shared'],
  // Emit a self-contained server bundle for Docker (`.next/standalone`).
  // Vercel builds its own output and does not need (or want) standalone, so skip
  // it there — `VERCEL` is set on every Vercel build.
  output: process.env.VERCEL ? undefined : 'standalone',
  // In a monorepo, trace workspace deps from the repo root so the standalone
  // output includes @archivato/shared and hoisted node_modules.
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

module.exports = nextConfig;
