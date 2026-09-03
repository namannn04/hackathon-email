import { describe, expect, it } from 'vitest';
import {
  formatToAddresses,
  GMAIL_MESSAGE_RECIPIENT_LIMIT,
  maxBccForToCount,
  parseToAddresses,
  readToAddresses,
} from '@/lib/sending/addresses';

describe('parsing the fixed To field', () => {
  it('reads two comma-separated addresses as two', () => {
    const parse = parseToAddresses('organizer@example.com, team@example.com');
    expect(parse.addresses).toEqual(['organizer@example.com', 'team@example.com']);
    expect(parse.invalid).toEqual([]);
  });

  it('tolerates loose spacing and trailing commas', () => {
    expect(parseToAddresses('  a@example.com ,b@example.com,  ').addresses)
      .toEqual(['a@example.com', 'b@example.com']);
  });

  it('lowercases so the same address is never counted twice', () => {
    const parse = parseToAddresses('Team@Example.com, team@example.com');
    expect(parse.addresses).toEqual(['team@example.com']);
    expect(parse.duplicates).toEqual(['team@example.com']);
  });

  it('reports a bad entry instead of dropping it silently', () => {
    const parse = parseToAddresses('good@example.com, not-an-email, also bad@x');
    expect(parse.addresses).toEqual(['good@example.com']);
    expect(parse.invalid).toEqual(['not-an-email', 'also bad@x']);
  });

  it('rejects an address that would smuggle a second one in', () => {
    // A comma is the separator, so it can never survive inside one address.
    expect(parseToAddresses('a@example.com').addresses).toEqual(['a@example.com']);
    expect(parseToAddresses('"a,b"@example.com').invalid.length).toBe(2);
  });

  it('finds nothing in an empty or comma-only field', () => {
    expect(parseToAddresses('').addresses).toEqual([]);
    expect(parseToAddresses(' , , ').addresses).toEqual([]);
  });

  it('round-trips through the stored form', () => {
    const addresses = ['a@example.com', 'b@example.com'];
    const stored = formatToAddresses(addresses);
    expect(stored).toBe('a@example.com, b@example.com');
    expect(readToAddresses(stored)).toEqual(addresses);
  });

  it('reads a single stored address, the shape every existing task has', () => {
    expect(readToAddresses('organizer@example.com')).toEqual(['organizer@example.com']);
  });
});

describe('how many Bcc recipients a set may hold', () => {
  it('leaves one slot per To address', () => {
    expect(maxBccForToCount(1)).toBe(499);
    expect(maxBccForToCount(2)).toBe(498);
    expect(maxBccForToCount(5)).toBe(495);
  });

  it('never returns less than one, whatever it is handed', () => {
    expect(maxBccForToCount(0)).toBe(499);
    expect(maxBccForToCount(GMAIL_MESSAGE_RECIPIENT_LIMIT + 10)).toBe(1);
  });

  it('keeps To plus Bcc within the limit Gmail enforces', () => {
    for (const toCount of [1, 2, 3, 4, 5]) {
      expect(toCount + maxBccForToCount(toCount)).toBeLessThanOrEqual(GMAIL_MESSAGE_RECIPIENT_LIMIT);
    }
  });
});
