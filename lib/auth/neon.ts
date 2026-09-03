import { createNeonAuth } from '@neondatabase/auth/next/server';

type NeonAuth = ReturnType<typeof createNeonAuth>;
let authInstance: NeonAuth | undefined;

/**
 * How long a signed session-data cookie is trusted before Neon Auth refetches
 * the session upstream and rewrites the cookie. Shared with middleware.ts,
 * which performs that refresh where writing a cookie is allowed.
 */
export const SESSION_DATA_TTL_SECONDS = 300;
export const AUTH_LOGIN_URL = '/auth/sign-in';

export function neonAuthCookieConfig(): { baseUrl: string; secret: string } | null {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !secret || secret.length < 32) return null;
  return { baseUrl, secret };
}

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
    cookies: { secret, sessionDataTtl: SESSION_DATA_TTL_SECONDS },
  });
  return authInstance;
}
