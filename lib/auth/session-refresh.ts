import type { MiddlewareResult } from '@neondatabase/auth/server';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Turns a Neon Auth middleware decision into a Next response.
 *
 * Relay deliberately does not let this redirect unauthenticated visitors: the
 * pages render their own signed-out screens (marketing home, the branded
 * sign-in prompt) and every page, API route and query already enforces access
 * on the server. A `redirect_login` decision is therefore passed through, while
 * still applying any cookie the decision wants cleared.
 *
 * The one redirect that is honoured is `redirect_oauth`, because that consumes
 * a single-use OAuth verifier: dropping it would break the sign-in callback.
 */
export function applySessionRefresh(result: MiddlewareResult, request: NextRequest): NextResponse {
  if (result.action === 'redirect_oauth') {
    return withCookies(NextResponse.redirect(result.redirectUrl), result.cookies);
  }

  const signals = result.action === 'allow' ? result.headers : undefined;
  const refreshed = result.cookies ?? [];
  if (!signals && !refreshed.length) return NextResponse.next();

  // Passing `request.headers` to NextResponse.next() REPLACES the downstream
  // request headers: Next deletes every header missing from this object. So the
  // incoming headers are cloned first and changes are layered on top — building
  // a bare Headers here would strip Cookie and sign the visitor out.
  const headers = new Headers(request.headers);
  for (const [name, value] of Object.entries(signals ?? {})) headers.set(name, value);

  // The refreshed cookie also has to reach *this* request, not only the
  // browser. A Server Component may not write cookies, so if the render still
  // read the stale cookie it would refetch the session upstream and throw
  // "Cookies can only be modified in a Server Action or Route Handler" — which
  // is exactly what happens on the first page load after signing in, before a
  // session-data cookie exists. Rewriting the Cookie header here means the
  // render already sees a fresh session and never needs to write one.
  const cookie = mergeCookieHeader(headers.get('cookie'), refreshed);
  if (cookie === null) headers.delete('cookie');
  else headers.set('cookie', cookie);

  return withCookies(NextResponse.next({ request: { headers } }), result.cookies);
}

/**
 * Applies Set-Cookie instructions to a request's Cookie header: a new value
 * replaces the old one, and an expiring cookie is removed outright.
 */
export function mergeCookieHeader(current: string | null, setCookies: string[]): string | null {
  const jar = new Map<string, string>();
  for (const pair of (current ?? '').split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 1) continue;
    jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }

  for (const setCookie of setCookies) {
    const [assignment, ...attributes] = setCookie.split(';');
    const separator = assignment.indexOf('=');
    if (separator < 1) continue;
    const name = assignment.slice(0, separator).trim();
    const value = assignment.slice(separator + 1).trim();
    if (isExpiring(attributes, value)) jar.delete(name);
    else jar.set(name, value);
  }

  if (!jar.size) return null;
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

function isExpiring(attributes: string[], value: string): boolean {
  if (!value) return true;
  return attributes.some((attribute) => {
    const [name, raw] = attribute.split('=');
    if (name.trim().toLowerCase() === 'max-age') return Number(raw?.trim()) <= 0;
    if (name.trim().toLowerCase() === 'expires') {
      const at = Date.parse(raw?.trim() ?? '');
      return Number.isFinite(at) && at <= Date.now();
    }
    return false;
  });
}

function withCookies(response: NextResponse, cookies: string[] | undefined): NextResponse {
  for (const cookie of cookies ?? []) response.headers.append('set-cookie', cookie);
  return response;
}
