import { describe, expect, it } from 'vitest';
import { buildGmailMime } from '@/lib/sending/mime';

function decodeRaw(value: string) {
  const standard = value.replaceAll('-', '+').replaceAll('_', '/');
  const bytes = Uint8Array.from(atob(standard), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

describe('Gmail MIME construction', () => {
  it('uses a stable message ID and folds a 450-recipient Bcc header safely', () => {
    const recipients = Array.from({ length: 450 }, (_, index) => `person${index}@example.com`);
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
    expect(mime).toContain('person449@example.com');
    const headerLines = mime.slice(0, mime.indexOf('\r\nSubject:')).split('\r\n').slice(2);
    expect(headerLines.every((line) => line.length <= 78)).toBe(true);
    const unfoldedBcc = headerLines.join('\r\n').replace(/\r\n[ \t]+/g, ' ');
    expect(unfoldedBcc).toBe(`Bcc: ${recipients.join(', ')}`);
    expect(mime).not.toContain('\nSubject: injected');
  });

  it('nests the alternative inside multipart/related and addresses images by cid', () => {
    const mime = decodeRaw(buildGmailMime({
      sender: 'sender@example.com',
      to: 'organizer@example.com',
      recipients: ['one@example.com'],
      subject: 'Poster',
      bodyText: 'Hello',
      bodyHtml: '<p><img src="cid:image1"></p>',
      messageId: '<relay.pic@relay.internal>',
      batchId: 'pic-1',
      images: [{ contentId: 'image1', filename: 'poster.png', mimeType: 'image/png', dataBase64: 'aGVsbG8=' }],
    }));
    expect(mime).toContain('Content-Type: multipart/related; boundary="relay_rel_pic1"; type="multipart/alternative"');
    expect(mime).toContain('Content-Type: multipart/alternative; boundary="relay_alt_pic1"');
    expect(mime).toContain('Content-ID: <image1>');
    expect(mime).toContain('Content-Disposition: inline; filename="poster.png"');
    expect(mime).toContain('aGVsbG8=');
    // The alternative must close before the image part begins.
    expect(mime.indexOf('--relay_alt_pic1--')).toBeLessThan(mime.indexOf('Content-ID: <image1>'));
    expect(mime.trimEnd().endsWith('--relay_rel_pic1--')).toBe(true);
  });

  it('keeps a plain alternative when there are no images', () => {
    const mime = decodeRaw(buildGmailMime({
      sender: 'sender@example.com',
      to: 'organizer@example.com',
      recipients: ['one@example.com'],
      subject: 'No poster',
      bodyText: 'Hello',
      bodyHtml: '<p>Hello</p>',
      messageId: '<relay.plain@relay.internal>',
      batchId: 'plain-1',
    }));
    expect(mime).toContain('Content-Type: multipart/alternative; boundary="relay_alt_plain1"');
    expect(mime).not.toContain('multipart/related');
  });

  it('strips header injection from filenames and content ids', () => {
    const mime = decodeRaw(buildGmailMime({
      sender: 'sender@example.com',
      to: 'organizer@example.com',
      recipients: ['one@example.com'],
      subject: 'Poster',
      bodyText: 'Hello',
      bodyHtml: '<p>Hello</p>',
      messageId: '<relay.evil@relay.internal>',
      batchId: 'evil-1',
      images: [{
        contentId: 'img\r\nCc: attacker@example.com',
        filename: 'a"\r\nCc: attacker@example.com.png',
        mimeType: 'image/png',
        dataBase64: 'aGVsbG8=',
      }],
    }));
    // The value stays inside a quoted header parameter; what must never happen
    // is a new header line, which only CR/LF could start.
    expect(mime).not.toMatch(/\r\nCc:/);
    expect(mime).toContain('Content-ID: <imgCcattackerexample.com>');
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

  it('omits the Bcc header when a message has no set behind it', () => {
    const mime = decodeRaw(buildGmailMime({
      sender: 'sender@example.com',
      to: 'organizer@example.com',
      recipients: [],
      subject: 'Test message',
      bodyText: 'Hello',
      bodyHtml: '<p>Hello</p>',
      messageId: '<relay.test.abc@relay.internal>',
      batchId: 'test-abc',
    }));
    expect(mime).toContain('To: organizer@example.com');
    expect(mime).not.toMatch(/^Bcc:/m);
    expect(mime).toContain('Subject: ');
  });

  it('writes several fixed To addresses as one comma-separated header', () => {
    const mime = decodeRaw(buildGmailMime({
      sender: 'sender@example.com',
      to: 'organizer@example.com, team@example.com',
      recipients: ['one@example.com'],
      subject: 'Update',
      bodyText: 'Hello',
      bodyHtml: '<p>Hello</p>',
      messageId: '<relay.b9@relay.internal>',
      batchId: 'b9',
    }));
    expect(mime).toContain('To: organizer@example.com, team@example.com');
    expect(mime).toContain('Bcc: one@example.com');
  });

  it('folds a long To list and keeps a comma between every address', () => {
    const addresses = Array.from({ length: 5 }, (_, index) => `a-very-long-organizer-address-${index}@example.com`);
    const mime = decodeRaw(buildGmailMime({
      sender: 'sender@example.com',
      to: addresses.join(', '),
      recipients: ['one@example.com'],
      subject: 'Update',
      bodyText: 'Hello',
      bodyHtml: '<p>Hello</p>',
      messageId: '<relay.b10@relay.internal>',
      batchId: 'b10',
    }));
    // Only the From line precedes To here, so drop just that one.
    const headerLines = mime.slice(0, mime.indexOf('\r\nBcc:')).split('\r\n').slice(1);
    expect(headerLines.every((line) => line.length <= 78)).toBe(true);
    expect(headerLines.join('\r\n').replace(/\r\n[ \t]+/g, ' ')).toBe(`To: ${addresses.join(', ')}`);
  });

  it('ignores blank entries in a stored To field', () => {
    const mime = decodeRaw(buildGmailMime({
      sender: 'sender@example.com',
      to: 'a@example.com, , b@example.com,',
      recipients: ['one@example.com'],
      subject: 'Update',
      bodyText: 'Hello',
      bodyHtml: '<p>Hello</p>',
      messageId: '<relay.b11@relay.internal>',
      batchId: 'b11',
    }));
    expect(mime).toContain('To: a@example.com, b@example.com');
  });
});
