import { getD1 } from '@/db';
import { decryptSecret, encryptSecret } from '@/lib/crypto/secrets';
import { HttpError } from '@/lib/http';
import { googleConfig } from './oauth';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

type AccountCredentials = {
  id: string;
  userId: string;
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string | null;
  tokenExpiresAt: string;
  revokedAt: string | null;
};

type GmailErrorBody = {
  error?: { code?: number; message?: string; status?: string };
};

export class GmailApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'GmailApiError';
  }
}

export async function findMessageByRfc822Id(input: {
  accountId: string;
  userId: string;
  messageId: string;
}) {
  const accessToken = await getAccessToken(input.accountId, input.userId);
  const url = new URL(`${GMAIL_API}/messages`);
  url.searchParams.set('q', `rfc822msgid:${input.messageId}`);
  url.searchParams.set('maxResults', '1');
  let response = await gmailFetch(url, accessToken);
  if (response.status === 401) {
    response = await gmailFetch(url, await getAccessToken(input.accountId, input.userId, true));
  }
  if (!response.ok) throw await gmailError(response);
  const data = (await response.json()) as { messages?: Array<{ id: string; threadId: string }> };
  return data.messages?.[0] ?? null;
}

export async function sendRawGmailMessage(input: {
  accountId: string;
  userId: string;
  raw: string;
}) {
  const url = `${GMAIL_API}/messages/send`;
  let response = await gmailFetch(url, await getAccessToken(input.accountId, input.userId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ raw: input.raw }),
  });
  if (response.status === 401) {
    response = await gmailFetch(url, await getAccessToken(input.accountId, input.userId, true), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ raw: input.raw }),
    });
  }
  if (!response.ok) throw await gmailError(response);
  return (await response.json()) as { id: string; threadId: string; labelIds?: string[] };
}

async function getAccessToken(accountId: string, userId: string, forceRefresh = false): Promise<string> {
  const d1 = getD1();
  const account = await d1
    .prepare(
      `SELECT id, user_id AS userId, access_token_ciphertext AS accessTokenCiphertext,
              refresh_token_ciphertext AS refreshTokenCiphertext,
              token_expires_at AS tokenExpiresAt, revoked_at AS revokedAt
       FROM gmail_accounts
       WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
    )
    .bind(accountId, userId)
    .first<AccountCredentials>();
  if (!account) {
    throw new HttpError(404, 'That Gmail account is not connected to your account.', 'GMAIL_ACCOUNT_NOT_FOUND');
  }

  if (!forceRefresh && Date.parse(account.tokenExpiresAt) > Date.now() + 60_000) {
    return decryptSecret(account.accessTokenCiphertext);
  }
  if (!account.refreshTokenCiphertext) {
    throw new HttpError(409, 'Reconnect this Gmail account before sending.', 'GMAIL_RECONNECT_REQUIRED');
  }

  const { clientId, clientSecret } = googleConfig();
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: await decryptSecret(account.refreshTokenCiphertext),
    }),
  });
  const result = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !result.access_token || !result.expires_in) {
    if (result.error === 'invalid_grant') {
      await d1
        .prepare('UPDATE gmail_accounts SET revoked_at = ?, updated_at = ? WHERE id = ? AND user_id = ?')
        .bind(new Date().toISOString(), new Date().toISOString(), accountId, userId)
        .run();
      throw new HttpError(409, 'Google access was revoked. Reconnect this Gmail account.', 'GMAIL_RECONNECT_REQUIRED');
    }
    throw new GmailApiError(
      result.error_description ?? 'Google could not refresh the Gmail session.',
      result.error ?? 'TOKEN_REFRESH_FAILED',
      response.status >= 500 || response.status === 429,
      response.status,
    );
  }

  const accessToken = await encryptSecret(result.access_token);
  const expiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString();
  await d1
    .prepare(
      `UPDATE gmail_accounts
       SET access_token_ciphertext = ?, token_expires_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(accessToken, expiresAt, new Date().toISOString(), accountId, userId)
    .run();
  return result.access_token;
}

function gmailFetch(url: string | URL, accessToken: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${accessToken}`);
  return fetch(url, { ...init, headers });
}

async function gmailError(response: Response): Promise<GmailApiError> {
  const body = (await response.json().catch(() => ({}))) as GmailErrorBody;
  const providerCode = body.error?.status ?? `HTTP_${response.status}`;
  const retryable =
    response.status === 408 ||
    response.status === 429 ||
    response.status >= 500 ||
    ['RESOURCE_EXHAUSTED', 'UNAVAILABLE', 'INTERNAL'].includes(providerCode);
  return new GmailApiError(
    body.error?.message ?? 'Gmail could not process the request.',
    providerCode,
    retryable,
    response.status,
  );
}
