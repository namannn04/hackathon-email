import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The generated Prisma Client loads its engine files at runtime, so it must
  // stay outside the server bundle.
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-neon'],
};

export default nextConfig;
