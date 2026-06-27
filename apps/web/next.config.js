/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the shared TS package directly from source.
  transpilePackages: ['@archivato/shared'],
};

module.exports = nextConfig;
