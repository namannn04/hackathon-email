import { fromBase64Url, toBase64Url } from '@/lib/crypto/secrets';
import { HttpError } from '@/lib/http';

/**
 * Signs the mail task an unsubscribe link belongs to.
 *
 * The link cannot identify a person: one Gmail message carries the whole set in
 * Bcc, so every recipient reads the identical body. The token therefore names
 * the mail task, and the unsubscribe page asks which address received it. That
 * address is then checked against the event's own recipient list before
 * anything is suppressed, so a link cannot be used to suppress a stranger.
 *
 * Signed rather than stored: no extra table, and a tampered task id is
 * rejected instead of silently pointing at someone else's event.
 */

const VERSION = 'u1';
const KEY_INFO = 'relay-unsubscribe-v1';

export async function createUnsubscribeToken(mailTaskId: string): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(mailTaskId));
  return `${VERSION}.${payload}.${await sign(`${VERSION}.${payload}`)}`;
}

export async function readUnsubscribeToken(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  const [version, payload, signature] = token.split('.');
  if (version !== VERSION || !payload || !signature) return null;
  const expected = await sign(`${version}.${payload}`);
  if (!timingSafeEqual(signature, expected)) return null;
  try {
    const mailTaskId = new TextDecoder().decode(fromBase64Url(payload));
    return /^[A-Za-z0-9_-]{1,80}$/.test(mailTaskId) ? mailTaskId : null;
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrl(origin: string, token: string): string {
  const url = new URL('/unsubscribe', new URL(origin).origin);
  url.searchParams.set('t', token);
  return url.toString();
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    await signingKeyBytes(),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}

/**
 * Derived from the existing encryption key with a fixed label, so unsubscribe
 * signing uses a distinct key from token encryption without a new env var.
 */
async function signingKeyBytes(): Promise<ArrayBuffer> {
  const configured = process.env.TOKEN_ENCRYPTION_KEY;
  if (!configured) {
    throw new HttpError(503, 'TOKEN_ENCRYPTION_KEY is not set, so unsubscribe links cannot be signed.', 'UNSUBSCRIBE_NOT_CONFIGURED');
  }
  const base = fromBase64Url(configured);
  const material = new Uint8Array(base.byteLength + KEY_INFO.length);
  material.set(new Uint8Array(base.buffer, base.byteOffset, base.byteLength), 0);
  material.set(new TextEncoder().encode(KEY_INFO), base.byteLength);
  return crypto.subtle.digest('SHA-256', material);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}
