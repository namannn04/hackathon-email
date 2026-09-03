import { describe, expect, it } from 'vitest';
import { compileEmailBody } from '@/lib/email-html/document';
import { buildGmailMime } from '@/lib/sending/mime';

/**
 * A test email must be able to reach the organizer and nobody else. These
 * assertions run over the finished message the way sendTestEmail builds it —
 * the organizer's address as the only To, an empty recipient list, and so no
 * Bcc header at all.
 */

function decodeRaw(value: string) {
  const standard = value.replaceAll('-', '+').replaceAll('_', '/');
  const bytes = Uint8Array.from(atob(standard), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function buildTestMessage(overrides: Partial<Parameters<typeof buildGmailMime>[0]> = {}) {
  const body = compileEmailBody({ bodyHtml: '<p>Preview me</p>', contentIds: [] });
  return decodeRaw(buildGmailMime({
    sender: 'organizer@gmail.com',
    to: 'admin@example.com',
    recipients: [],
    subject: 'Geek Room Hackathon Updates',
    bodyText: body.text,
    bodyHtml: body.html,
    messageId: '<relay.test.9f1@relay.internal>',
    batchId: '9f1c2d',
    ...overrides,
  }));
}

describe('test email addressing', () => {
  it('addresses only the organizer, with no Bcc header at all', () => {
    const mime = buildTestMessage();
    const headers = mime.slice(0, mime.indexOf('\r\n\r\n'));
    expect(headers).toContain('To: admin@example.com');
    expect(headers).not.toMatch(/Bcc/i);
    expect(headers).toContain('From: organizer@gmail.com');
  });

  it('carries exactly one recipient address in the whole header block', () => {
    const headers = buildTestMessage().split('\r\n\r\n')[0];
    const addresses = headers.match(/[\w.+-]+@[\w.-]+/g) ?? [];
    // From, To, and the Message-ID's relay.internal host.
    expect(addresses.filter((address) => address.endsWith('@example.com'))).toEqual(['admin@example.com']);
  });

  it('still carries both body parts, like a real send', () => {
    const mime = buildTestMessage();
    expect(mime).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(mime).toContain('Content-Type: text/html; charset=UTF-8');
    expect(mime).toContain('Content-Type: multipart/alternative');
  });

  it('keeps a Bcc header when a real set does have recipients', () => {
    const headers = buildTestMessage({ recipients: ['a@example.com', 'b@example.com'] }).split('\r\n\r\n')[0];
    expect(headers).toContain('Bcc: a@example.com, b@example.com');
  });
});
