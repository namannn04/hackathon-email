import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { applySessionRefresh, mergeCookieHeader } from '@/lib/auth/session-refresh';

const REFRESHED = 'neon-auth.session_data=fresh; Path=/; HttpOnly';
const CLEARED = 'neon-auth.session_data=; Path=/; Max-Age=0';
const CLEARED_DATA = '__Secure-neon-auth.local.session_data=; Path=/; Max-Age=0';
const COOKIE = '__Secure-neon-auth.session_token=token-value';

function signedInRequest() {
  return new NextRequest('https://relay.local/dashboard', {
    headers: { cookie: COOKIE, 'user-agent': 'relay-test' },
  });
}

/**
 * Next replaces the downstream request headers with whatever is handed to
 * NextResponse.next({ request: { headers } }) and deletes the rest, so these
 * cover the header plumbing as closely as the cookie plumbing.
 */
describe('Neon Auth session refresh', () => {
  it('keeps the Cookie header on the downstream request', () => {
    const response = applySessionRefresh(
      { action: 'allow', headers: { 'x-neon-auth-middleware': 'true' }, cookies: [REFRESHED] },
      signedInRequest(),
    );
    const overridden = (response.headers.get('x-middleware-override-headers') ?? '').split(',');
    expect(overridden).toContain('cookie');
    // The session token survives and the refresh is merged in beside it.
    const forwarded = response.headers.get('x-middleware-request-cookie') ?? '';
    expect(forwarded).toContain(COOKIE);
    expect(forwarded).toContain('neon-auth.session_data=fresh');
  });

  it('adds the signal header without dropping the other request headers', () => {
    const response = applySessionRefresh(
      { action: 'allow', headers: { 'x-neon-auth-middleware': 'true' } },
      signedInRequest(),
    );
    const overridden = (response.headers.get('x-middleware-override-headers') ?? '').split(',');
    expect(overridden).toContain('user-agent');
    expect(response.headers.get('x-middleware-request-x-neon-auth-middleware')).toBe('true');
    expect(response.headers.get('x-middleware-request-user-agent')).toBe('relay-test');
  });

  it('passes the request through and applies the refreshed cookie', () => {
    const response = applySessionRefresh(
      { action: 'allow', headers: { 'x-neon-auth-middleware': 'true' }, cookies: [REFRESHED] },
      signedInRequest(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.getSetCookie()).toEqual([REFRESHED]);
  });

  it('applies every cookie a refresh returns', () => {
    const response = applySessionRefresh(
      { action: 'allow', cookies: [REFRESHED, CLEARED] },
      signedInRequest(),
    );
    expect(response.headers.getSetCookie()).toEqual([REFRESHED, CLEARED]);
  });

  it('still rewrites the request cookie when there are no signal headers', () => {
    const response = applySessionRefresh({ action: 'allow', cookies: [REFRESHED] }, signedInRequest());
    expect(response.headers.get('x-middleware-request-cookie')).toContain('neon-auth.session_data=fresh');
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('touches nothing when there is neither a signal nor a cookie', () => {
    const response = applySessionRefresh({ action: 'allow' }, signedInRequest());
    expect(response.headers.get('x-middleware-override-headers')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('never redirects a signed-out visitor, so the pages keep their own screens', () => {
    const response = applySessionRefresh({
      action: 'redirect_login',
      redirectUrl: new URL('https://relay.local/auth/sign-in'),
      cookies: [CLEARED],
    }, signedInRequest());
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
    // A stale session-data cookie is still cleared on the way through.
    expect(response.headers.getSetCookie()).toEqual([CLEARED]);
  });

  it('honours the OAuth callback redirect so the single-use verifier is not lost', () => {
    const response = applySessionRefresh({
      action: 'redirect_oauth',
      redirectUrl: new URL('https://relay.local/dashboard'),
      cookies: [REFRESHED],
    }, signedInRequest());
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://relay.local/dashboard');
    expect(response.headers.getSetCookie()).toEqual([REFRESHED]);
  });

  it('handles a decision that carries nothing at all', () => {
    const response = applySessionRefresh({ action: 'allow' }, signedInRequest());
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('hands the refreshed cookie to this render, not only to the browser', () => {
    // Without this the Server Component reads the stale cookie, refetches the
    // session upstream and throws, because a render may not write cookies.
    const response = applySessionRefresh(
      { action: 'allow', cookies: ['__Secure-neon-auth.local.session_data=fresh; Path=/; HttpOnly'] },
      signedInRequest(),
    );
    const forwarded = response.headers.get('x-middleware-request-cookie') ?? '';
    expect(forwarded).toContain('__Secure-neon-auth.local.session_data=fresh');
    expect(forwarded).toContain('__Secure-neon-auth.session_token=token-value');
  });

  it('removes an expiring cookie from the downstream request too', () => {
    const request = new NextRequest('https://relay.local/dashboard', {
      headers: { cookie: `${COOKIE}; __Secure-neon-auth.local.session_data=stale` },
    });
    const response = applySessionRefresh({ action: 'redirect_login', redirectUrl: new URL('https://relay.local/auth/sign-in'), cookies: [CLEARED_DATA] }, request);
    const forwarded = response.headers.get('x-middleware-request-cookie') ?? '';
    expect(forwarded).not.toContain('session_data');
    expect(forwarded).toContain('session_token=token-value');
  });
});

describe('merging Set-Cookie into a Cookie header', () => {
  it('replaces a cookie of the same name and keeps the rest', () => {
    expect(mergeCookieHeader('a=1; b=2', ['b=99; Path=/'])).toBe('a=1; b=99');
  });

  it('adds a cookie the request did not have', () => {
    expect(mergeCookieHeader('a=1', ['b=2; HttpOnly'])).toBe('a=1; b=2');
  });

  it('drops a cookie that is being cleared', () => {
    expect(mergeCookieHeader('a=1; b=2', ['b=; Path=/; Max-Age=0'])).toBe('a=1');
    expect(mergeCookieHeader('a=1; b=2', ['b=x; Expires=Thu, 01 Jan 1970 00:00:00 GMT'])).toBe('a=1');
  });

  it('returns null once nothing is left', () => {
    expect(mergeCookieHeader('b=2', ['b=; Max-Age=0'])).toBeNull();
    expect(mergeCookieHeader(null, [])).toBeNull();
  });

  it('keeps a value containing = intact', () => {
    expect(mergeCookieHeader(null, ['t=abc.def==; Path=/'])).toBe('t=abc.def==');
  });
});
