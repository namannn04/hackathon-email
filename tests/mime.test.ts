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
});
