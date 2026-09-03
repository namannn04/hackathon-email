import { HttpError } from '@/lib/http';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function encryptSecret(value: string): Promise<string> {
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(value));
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string): Promise<string> {
  const [version, ivValue, encryptedValue] = value.split('.');
  if (version !== 'v1' || !ivValue || !encryptedValue) {
    throw new HttpError(500, 'Stored Gmail credentials are invalid.', 'TOKEN_DECRYPTION_FAILED');
  }
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(ivValue) },
      await encryptionKey(),
      fromBase64Url(encryptedValue),
    );
    return decoder.decode(decrypted);
  } catch {
    throw new HttpError(500, 'Stored Gmail credentials could not be decrypted.', 'TOKEN_DECRYPTION_FAILED');
  }
}

async function encryptionKey(): Promise<CryptoKey> {
  const configured = process.env.TOKEN_ENCRYPTION_KEY;
  if (!configured) {
    throw new HttpError(
      503,
      'Gmail token encryption has not been configured.',
      'GMAIL_NOT_CONFIGURED',
    );
  }
  const bytes = fromBase64Url(configured);
  if (bytes.byteLength !== 32) {
    throw new HttpError(500, 'TOKEN_ENCRYPTION_KEY must contain 32 bytes.', 'INVALID_ENCRYPTION_KEY');
  }
  return crypto.subtle.importKey('raw', bytes.buffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
