import { describe, expect, it } from 'vitest';
import { extractRecipients, isValidEmail, normalizeEmail, parseCsv } from '@/lib/imports/parser';

describe('recipient import parsing', () => {
  it('handles quoted CSV cells, removes duplicates, and rejects invalid addresses', () => {
    const csv = '\uFEFFName,Email\r\n"Ada, Team",Ada@Example.com\r\nSam,sam@example.org\r\nDuplicate,ada@example.com\r\nBad,not-an-email';
    const result = extractRecipients(parseCsv(csv));
    expect(result.recipients).toEqual([
      { email: 'Ada@Example.com', normalizedEmail: 'ada@example.com' },
      { email: 'sam@example.org', normalizedEmail: 'sam@example.org' },
    ]);
    expect(result.duplicateCount).toBe(1);
    expect(result.invalidCount).toBe(1);
  });

  it('normalizes case without collapsing provider-specific aliases', () => {
    expect(normalizeEmail('  Person+Hack@Example.COM ')).toBe('person+hack@example.com');
    expect(isValidEmail('person+hack@example.com')).toBe(true);
    expect(isValidEmail('person@example')).toBe(false);
    expect(isValidEmail('.person@example.com')).toBe(false);
  });
});
