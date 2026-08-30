import { describe, expect, it } from 'vitest';
import { buildGmailMime } from '@/lib/sending/mime';

function decodeRaw(value: string) {
  const standard = value.replaceAll('-', '+').replaceAll('_', '/');
  const bytes = Uint8Array.from(atob(standard), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

describe('Gmail MIME construction', () => {
  it('uses a stable message ID and folds a large Bcc header safely', () => {
    const recipients = Array.from({ length: 300 }, (_, index) => `person${index}@example.com`);
    const raw = buildGmailMime({
      sender: 'sender@example.com',
      to: 'organizer@example.com',
      recipients,
      subject: 'Hackathon invitation',
      bodyText: 'Hello team',
      bodyHtml: '<p>Hello team</p>',
      messageId: '<relay.batch-17@relay.internal>',
      batchId: 'batch-17',
    });
    const mime = decodeRaw(raw);
    expect(mime).toContain('Message-ID: <relay.batch-17@relay.internal>');
    expect(mime).toContain('To: organizer@example.com');
    expect(mime).toContain('Bcc: person0@example.com');
    expect(mime).toContain('person299@example.com');
    const headerLines = mime.slice(0, mime.indexOf('\r\nSubject:')).split('\r\n').slice(2);
    expect(headerLines.every((line) => line.length <= 76)).toBe(true);
    expect(mime).not.toContain('\nSubject: injected');
  });

  it('strips header injection from subject values', () => {
    const mime = decodeRaw(buildGmailMime({
      sender: 'sender@example.com',
      to: 'organizer@example.com',
      recipients: ['one@example.com'],
      subject: 'Invite\r\nCc: attacker@example.com',
      bodyText: 'Hello',
      bodyHtml: '<p>Hello</p>',
      messageId: '<relay.safe@relay.internal>',
      batchId: 'safe',
    }));
    expect(mime).not.toContain('\r\nCc: attacker@example.com');
  });
});
