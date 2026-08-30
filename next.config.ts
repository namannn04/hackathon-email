import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The generated Prisma Client loads its engine files at runtime, so it must
  // stay outside the server bundle.
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-neon'],
  // Use the TypeScript compiler API during production builds. The CLI runner
  // can drop its captured --showConfig output in restricted build workers.
  experimental: { useTypeScriptCli: false, webpackBuildWorker: false },
};

export default nextConfig;
