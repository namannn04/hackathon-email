import type { User } from '@/generated/prisma/client';
import { writeAudit } from '@/lib/audit';
import { encryptSecret, toBase64Url } from '@/lib/crypto/secrets';
import { getPrisma } from '@/lib/db/prisma';
import { HttpError, safeReturnPath } from '@/lib/http';
import { GMAIL_SEND_SCOPE, hasGmailSendScope } from './scopes';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_TOKEN_INFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const GOOGLE_SCOPES = ['openid', 'email', 'profile', GMAIL_SEND_SCOPE];

type GoogleTokenResponse = { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string; id_token?: string; error_description?: string };
type GoogleTokenInfo = { aud?: string; iss?: string; sub?: string; email?: string; email_verified?: string; name?: string; exp?: string };

export async function createGoogleAuthorizationUrl(user: User, returnToValue: string | null, loginHint?: string | null) {
  const config = googleConfig();
  const state = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const codeVerifier = toBase64Url(crypto.getRandomValues(new Uint8Array(64)));
  const codeChallenge = toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))));
  await getPrisma().oAuthState.create({
    data: {
      state,
      userId: user.id,
      codeVerifier,
      returnTo: safeReturnPath(returnToValue),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent select_account');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (loginHint) url.searchParams.set('login_hint', loginHint);
  return url.toString();
}

export async function getGoogleAuthorizationReturnPath(state: string | null, authenticatedUserId: string) {
  if (!state) return '/my-batches';
  const stored = await getPrisma().oAuthState.findFirst({
    where: { state, userId: authenticatedUserId },
    select: { returnTo: true },
  });
  return safeReturnPath(stored?.returnTo ?? null);
}

export async function completeGoogleAuthorization(input: { code: string; state: string; authenticatedUserId: string }) {
  const config = googleConfig();
  const prisma = getPrisma();
  const state = await prisma.oAuthState.findFirst({
    where: { state: input.state, userId: input.authenticatedUserId, usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!state) throw new HttpError(400, 'The Google connection request expired or was already used.', 'INVALID_OAUTH_STATE');
  await prisma.oAuthState.update({ where: { state: state.state }, data: { usedAt: new Date() } });

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: input.code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: state.codeVerifier,
    }),
  });
  const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokens.access_token || !tokens.id_token || !tokens.expires_in) {
    throw new HttpError(400, tokens.error_description ?? 'Google did not complete the connection.', 'GOOGLE_TOKEN_EXCHANGE_FAILED');
  }
  const grantedScopes = tokens.scope ?? '';
  if (!hasGmailSendScope(grantedScopes)) {
    throw new HttpError(
      409,
      'Gmail send permission was not granted. Connect again and approve “Send email on your behalf”.',
      'GMAIL_SCOPE_REQUIRED',
    );
  }
  const infoResponse = await fetch(`${GOOGLE_TOKEN_INFO_URL}?id_token=${encodeURIComponent(tokens.id_token)}`);
  const info = (await infoResponse.json()) as GoogleTokenInfo;
  const validIssuer = info.iss === 'https://accounts.google.com' || info.iss === 'accounts.google.com';
  if (!infoResponse.ok || info.aud !== config.clientId || !validIssuer || !info.sub || !info.email || info.email_verified !== 'true' || Number(info.exp ?? 0) * 1000 <= Date.now()) {
    throw new HttpError(400, 'Google returned an invalid identity token.', 'INVALID_GOOGLE_ID_TOKEN');
  }

  const stored = await prisma.gmailAccount.upsert({
    where: { userId_googleSubject: { userId: input.authenticatedUserId, googleSubject: info.sub } },
    create: {
      userId: input.authenticatedUserId,
      googleSubject: info.sub,
      email: info.email.toLowerCase(),
      displayName: info.name,
      accessTokenCiphertext: await encryptSecret(tokens.access_token),
      refreshTokenCiphertext: tokens.refresh_token ? await encryptSecret(tokens.refresh_token) : null,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scopes: grantedScopes,
    },
    update: {
      email: info.email.toLowerCase(),
      displayName: info.name,
      accessTokenCiphertext: await encryptSecret(tokens.access_token),
      ...(tokens.refresh_token ? { refreshTokenCiphertext: await encryptSecret(tokens.refresh_token) } : {}),
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scopes: grantedScopes,
      revokedAt: null,
    },
  });
  await writeAudit({ actorId: input.authenticatedUserId, action: 'GMAIL_ACCOUNT_CONNECTED', entityType: 'gmail_account', entityId: stored.id, metadata: { email: stored.email } });
  return { returnTo: safeReturnPath(state.returnTo), email: stored.email };
}

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new HttpError(503, 'Google OAuth is not configured yet.', 'GMAIL_NOT_CONFIGURED');
  }
  const redirect = new URL(redirectUri);
  if (redirect.protocol !== 'https:' && redirect.hostname !== 'localhost') {
    throw new HttpError(500, 'GOOGLE_REDIRECT_URI must use HTTPS.', 'INVALID_GOOGLE_REDIRECT_URI');
  }
  return { clientId, clientSecret, redirectUri: redirect.toString() };
}
