import { NextResponse } from 'next/server';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'REQUEST_FAILED',
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  console.error(error);
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } },
    { status: 500 },
  );
}

export function readString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new HttpError(400, `${field} is required.`, 'VALIDATION_ERROR');
  const trimmed = value.trim();
  if (!trimmed) throw new HttpError(400, `${field} is required.`, 'VALIDATION_ERROR');
  if (trimmed.length > maxLength) {
    throw new HttpError(400, `${field} is too long.`, 'VALIDATION_ERROR');
  }
  return trimmed;
}

export function safeReturnPath(value: string | null, fallback = '/my-batches'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  try {
    const url = new URL(value, 'https://relay.local');
    return url.origin === 'https://relay.local' ? `${url.pathname}${url.search}` : fallback;
  } catch {
    return fallback;
  }
}

export function assertTrustedMutation(request: Request): void {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    throw new HttpError(403, 'Cross-site changes are not allowed.', 'CSRF_REJECTED');
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw new HttpError(403, 'The request origin is not trusted.', 'CSRF_REJECTED');
  }
}
