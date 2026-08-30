import { decryptSecret, encryptSecret } from '@/lib/crypto/secrets';
import { getPrisma } from '@/lib/db/prisma';
import { HttpError } from '@/lib/http';
import { googleConfig } from './oauth';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
type GmailErrorBody = { error?: { code?: number; message?: string; status?: string } };

export class GmailApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly retryable: boolean, public readonly status: number) {
    super(message);
    this.name = 'GmailApiError';
  }
}

export async function sendRawGmailMessage(input: { accountId: string; userId: string; raw: string }) {
  const url = `${GMAIL_API}/messages/send`;
  const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ raw: input.raw }) };
  let response = await gmailFetch(url, await getAccessToken(input.accountId, input.userId), init);
  if (response.status === 401) response = await gmailFetch(url, await getAccessToken(input.accountId, input.userId, true), init);
  if (!response.ok) throw await gmailError(response);
  return (await response.json()) as { id: string; threadId: string };
}

async function getAccessToken(accountId: string, userId: string, forceRefresh = false) {
  const prisma = getPrisma();
  const account = await prisma.gmailAccount.findFirst({ where: { id: accountId, userId, revokedAt: null } });
  if (!account) throw new HttpError(404, 'That Gmail account is not connected to your account.', 'GMAIL_ACCOUNT_NOT_FOUND');
  if (!forceRefresh && account.tokenExpiresAt.getTime() > Date.now() + 60_000) return decryptSecret(account.accessTokenCiphertext);
  if (!account.refreshTokenCiphertext) throw new HttpError(409, 'Reconnect this Gmail account before sending.', 'GMAIL_RECONNECT_REQUIRED');

  const config = googleConfig();
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'refresh_token', refresh_token: await decryptSecret(account.refreshTokenCiphertext) }),
  });
  const result = (await response.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!response.ok || !result.access_token || !result.expires_in) {
    if (result.error === 'invalid_grant') {
      await prisma.gmailAccount.update({ where: { id: account.id }, data: { revokedAt: new Date() } });
      throw new HttpError(409, 'Google access was revoked. Reconnect this Gmail account.', 'GMAIL_RECONNECT_REQUIRED');
    }
    throw new GmailApiError(result.error_description ?? 'Google could not refresh the Gmail session.', result.error ?? 'TOKEN_REFRESH_FAILED', response.status >= 500 || response.status === 429, response.status);
  }
  await prisma.gmailAccount.update({
    where: { id: account.id },
    data: { accessTokenCiphertext: await encryptSecret(result.access_token), tokenExpiresAt: new Date(Date.now() + result.expires_in * 1000) },
  });
  return result.access_token;
}

function gmailFetch(url: string | URL, accessToken: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${accessToken}`);
  return fetch(url, { ...init, headers });
}

async function gmailError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as GmailErrorBody;
  const code = body.error?.status ?? `HTTP_${response.status}`;
  const retryable = response.status === 408 || response.status === 429 || response.status >= 500 || ['RESOURCE_EXHAUSTED', 'UNAVAILABLE', 'INTERNAL'].includes(code);
  return new GmailApiError(body.error?.message ?? 'Gmail could not process the request.', code, retryable, response.status);
}
