export const DEFAULT_AUTH_REDIRECT = '/dashboard';

export function getSafeAuthRedirect(
  candidates: Array<string | null | undefined>,
  fallback = DEFAULT_AUTH_REDIRECT,
): string {
  for (const value of candidates) {
    const target = sanitizeSameOriginPath(value);
    if (target) return target;
  }
  return fallback;
}

function sanitizeSameOriginPath(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (
    !candidate
    || !candidate.startsWith('/')
    || candidate.startsWith('//')
    || candidate.includes('\\')
    || /[\u0000-\u001f\u007f]/.test(candidate)
  ) return null;

  const base = new URL('https://relay.local');
  const parsed = new URL(candidate, base);
  if (parsed.origin !== base.origin) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
