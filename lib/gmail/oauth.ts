import { getD1 } from '@/db';
import type { User } from '@/db/schema';
import { auditStatement } from '@/lib/audit';
import { encryptSecret, toBase64Url } from '@/lib/crypto/secrets';
import { HttpError, safeReturnPath } from '@/lib/http';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_TOKEN_INFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
];

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenInfo = {
  aud?: string;
  iss?: string;
  sub?: string;
  email?: string;
  email_verified?: string;
  name?: string;
  exp?: string;
};

export async function createGoogleAuthorizationUrl(user: User, returnToValue: string | null) {
  const config = googleConfig();
  const state = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const codeVerifier = toBase64Url(crypto.getRandomValues(new Uint8Array(64)));
  const codeChallenge = toBase64Url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))),
  );
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();

  await getD1()
    .prepare(
      `INSERT INTO oauth_states
       (state, user_id, code_verifier, return_to, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(state, user.id, codeVerifier, safeReturnPath(returnToValue), expiresAt, now.toISOString())
    .run();

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
  return url.toString();
}

export async function completeGoogleAuthorization(input: {
  code: string;
  state: string;
  authenticatedUserId: string;
}) {
  const config = googleConfig();
  const now = new Date().toISOString();
  const oauthState = await getD1()
    .prepare(
      `UPDATE oauth_states
       SET used_at = ?
       WHERE state = ? AND user_id = ? AND used_at IS NULL AND expires_at > ?
       RETURNING code_verifier AS codeVerifier, return_to AS returnTo`,
    )
    .bind(now, input.state, input.authenticatedUserId, now)
    .first<{ codeVerifier: string; returnTo: string }>();
  if (!oauthState) {
    throw new HttpError(400, 'The Google connection request expired or was already used.', 'INVALID_OAUTH_STATE');
  }

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: input.code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: oauthState.codeVerifier,
    }),
  });
  const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokens.access_token || !tokens.id_token || !tokens.expires_in) {
    throw new HttpError(
      400,
      tokens.error_description ?? 'Google did not complete the connection.',
      'GOOGLE_TOKEN_EXCHANGE_FAILED',
    );
  }

  const infoResponse = await fetch(
    `${GOOGLE_TOKEN_INFO_URL}?id_token=${encodeURIComponent(tokens.id_token)}`,
  );
  const info = (await infoResponse.json()) as GoogleTokenInfo;
  const validIssuer = info.iss === 'https://accounts.google.com' || info.iss === 'accounts.google.com';
  if (
    !infoResponse.ok ||
    info.aud !== config.clientId ||
    !validIssuer ||
    !info.sub ||
    !info.email ||
    info.email_verified !== 'true' ||
    Number(info.exp ?? 0) * 1000 <= Date.now()
  ) {
    throw new HttpError(400, 'Google returned an invalid identity token.', 'INVALID_GOOGLE_ID_TOKEN');
  }

  const accountId = crypto.randomUUID();
  const accessToken = await encryptSecret(tokens.access_token);
  const refreshToken = tokens.refresh_token ? await encryptSecret(tokens.refresh_token) : null;
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const d1 = getD1();
  const stored = await d1
    .prepare(
        `INSERT INTO gmail_accounts
         (id, user_id, google_subject, email, display_name, access_token_ciphertext,
          refresh_token_ciphertext, token_expires_at, scopes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, google_subject) DO UPDATE SET
           email = excluded.email,
           display_name = excluded.display_name,
           access_token_ciphertext = excluded.access_token_ciphertext,
           refresh_token_ciphertext = COALESCE(excluded.refresh_token_ciphertext, gmail_accounts.refresh_token_ciphertext),
           token_expires_at = excluded.token_expires_at,
           scopes = excluded.scopes,
           revoked_at = NULL,
           updated_at = excluded.updated_at
         RETURNING id`,
    )
    .bind(
      accountId,
      input.authenticatedUserId,
      info.sub,
      info.email.toLowerCase(),
      info.name ?? null,
      accessToken,
      refreshToken,
      expiresAt,
      tokens.scope ?? GOOGLE_SCOPES.join(' '),
      now,
      now,
    )
    .first<{ id: string }>();
  if (!stored) throw new HttpError(500, 'Could not save the Gmail connection.', 'GMAIL_STORE_FAILED');
  await auditStatement({
      actorId: input.authenticatedUserId,
      action: 'GMAIL_ACCOUNT_CONNECTED',
      entityType: 'gmail_account',
      entityId: stored.id,
      metadata: { email: info.email.toLowerCase() },
    }).run();

  return { returnTo: safeReturnPath(oauthState.returnTo), email: info.email.toLowerCase() };
}

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new HttpError(
      503,
      'Google OAuth is not configured yet. Add the three Google OAuth environment values.',
      'GMAIL_NOT_CONFIGURED',
    );
  }
  const redirect = new URL(redirectUri);
  if (redirect.protocol !== 'https:' && redirect.hostname !== 'localhost') {
    throw new HttpError(500, 'GOOGLE_REDIRECT_URI must use HTTPS.', 'INVALID_GOOGLE_REDIRECT_URI');
  }
  return { clientId, clientSecret, redirectUri: redirect.toString() };
}
