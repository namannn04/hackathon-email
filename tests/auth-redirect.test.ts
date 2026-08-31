import { describe, expect, it } from 'vitest';
import { getSafeAuthRedirect } from '@/lib/auth/redirect';

describe('auth redirect safety', () => {
  it('keeps dashboard and invite return paths intact', () => {
    expect(getSafeAuthRedirect(['/dashboard?eventId=event-1'])).toBe('/dashboard?eventId=event-1');
    expect(getSafeAuthRedirect(['/join/abc_123?source=email'])).toBe('/join/abc_123?source=email');
  });

  it('uses the first safe candidate and rejects external redirects', () => {
    expect(getSafeAuthRedirect(['https://evil.example', '/join/safe-token'])).toBe('/join/safe-token');
    expect(getSafeAuthRedirect(['//evil.example/path'])).toBe('/dashboard');
    expect(getSafeAuthRedirect(['/\\evil.example/path'])).toBe('/dashboard');
  });
});
