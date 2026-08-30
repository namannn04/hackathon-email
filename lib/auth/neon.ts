import { createNeonAuth } from '@neondatabase/auth/next/server';

type NeonAuth = ReturnType<typeof createNeonAuth>;
let authInstance: NeonAuth | undefined;

export function isNeonAuthConfigured(): boolean {
  return Boolean(process.env.NEON_AUTH_BASE_URL && (process.env.NEON_AUTH_COOKIE_SECRET?.length ?? 0) >= 32);
}

export function getNeonAuth(): NeonAuth {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !secret || secret.length < 32) {
    throw new Error('NEON_AUTH_BASE_URL and a 32+ character NEON_AUTH_COOKIE_SECRET are required.');
  }
  authInstance ??= createNeonAuth({
    baseUrl,
    cookies: { secret, sessionDataTtl: 300 },
  });
  return authInstance;
}
