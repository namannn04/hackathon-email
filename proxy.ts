import { DEFAULT_AUTH_SKIP_ROUTES, processAuthMiddleware } from '@neondatabase/auth/server';
import { AUTH_LOGIN_URL, neonAuthCookieConfig, SESSION_DATA_TTL_SECONDS } from '@/lib/auth/neon';
import { applySessionRefresh } from '@/lib/auth/session-refresh';
import { NextResponse, type NextRequest } from 'next/server';

/** Pages that render their own signed-out state instead of requiring a session. */
const PUBLIC_ROUTES = [
  ...DEFAULT_AUTH_SKIP_ROUTES,
  '/',
  '/privacy',
  '/terms',
  '/join',
  '/auth',
  '/unsubscribe',
];

/**
 * Refreshes the Neon Auth session cookie before a page renders.
 *
 * Next.js 16 renamed this file convention from `middleware` to `proxy`.
 *
 * Neon Auth trusts its signed session-data cookie for SESSION_DATA_TTL_SECONDS
 * and then refetches the session upstream and rewrites the cookie. A React
 * Server Component is not allowed to write cookies, so when that refresh landed
 * inside a page render it threw "Cookies can only be modified in a Server
 * Action or Route Handler" and the page failed for any signed-in visitor whose
 * cached session had aged out. A proxy is the one place in a request where
 * the write is legal, so the refresh happens here instead.
 *
 * API routes are excluded by the matcher: a route handler may set cookies
 * itself, so it refreshes on its own without a second upstream round trip.
 */
export async function proxy(request: NextRequest) {
  const auth = neonAuthCookieConfig();
  if (!auth) return NextResponse.next();

  try {
    const result = await processAuthMiddleware({
      request,
      pathname: request.nextUrl.pathname,
      skipRoutes: PUBLIC_ROUTES,
      loginUrl: AUTH_LOGIN_URL,
      baseUrl: auth.baseUrl,
      cookieSecret: auth.secret,
      sessionDataTtl: SESSION_DATA_TTL_SECONDS,
    });
    return applySessionRefresh(result, request);
  } catch (error) {
    // A refresh that cannot reach the auth server must not take the page down;
    // the render still reads the existing cookie and the pages handle a missing
    // session on their own.
    console.error('[relay] Neon Auth session refresh failed', error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|.*\\.[^/]*$).*)'],
};
