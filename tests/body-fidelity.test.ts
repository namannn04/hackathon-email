import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileEmailBody, renderPreviewDocument } from '@/lib/email-html/document';
import { buildGmailMime } from '@/lib/sending/mime';

/**
 * Closes the loop between what a preview shows and what a recipient receives.
 * The compiler output is stored on the mail task; the preview renders that
 * stored string and the MIME builder encodes that same stored string. These
 * tests decode the finished message back and compare it to what was previewed,
 * so the two cannot drift apart unnoticed.
 */

function decodeRaw(value: string) {
  const standard = value.replaceAll('-', '+').replaceAll('_', '/');
  const bytes = Uint8Array.from(atob(standard), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Pulls one part's decoded body out of a multipart message. */
function decodePart(mime: string, contentType: string): string {
  const marker = `Content-Type: ${contentType}`;
  const at = mime.indexOf(marker);
  expect(at, `${contentType} part is present`).toBeGreaterThan(-1);
  const bodyStart = mime.indexOf('\r\n\r\n', at) + 4;
  const bodyEnd = mime.indexOf('\r\n--', bodyStart);
  const base64 = mime.slice(bodyStart, bodyEnd === -1 ? undefined : bodyEnd).replace(/\r\n/g, '');
  return new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
}

const SAMPLE = '<div style="background-color:#f3f4f8;font-family:Arial, Helvetica, sans-serif">'
  + '<table role="presentation" width="100%" bgcolor="#111111"><tr>'
  + '<td align="center" style="padding:36px 14px"><h1 style="color:#ffffff">Two hackathons.</h1>'
  + '<a href="https://hackculture.io/challenges/trackshift-2026?ref=GR">Register →</a>'
  + '</td></tr></table></div>';

describe('the previewed body is the delivered body', () => {
  it('puts the compiled HTML into the text/html part byte for byte', () => {
    const body = compileEmailBody({ bodyHtml: SAMPLE, contentIds: [] });
    const mime = decodeRaw(buildGmailMime({
      sender: 'sender@example.com',
      to: 'organizer@example.com',
      recipients: ['one@example.com'],
      subject: 'Geek Room Hackathon Updates',
      bodyText: body.text,
      bodyHtml: body.html,
      messageId: '<relay.batch-1@relay.internal>',
      batchId: 'batch-1',
    }));

    expect(decodePart(mime, 'text/html')).toBe(body.html);
    expect(decodePart(mime, 'text/plain')).toBe(body.text);
  });

  it('delivers the same HTML the preview document embeds', () => {
    const body = compileEmailBody({ bodyHtml: SAMPLE, contentIds: [] });
    const preview = renderPreviewDocument({ bodyHtml: body.html, subject: 'x' });
    const mime = decodeRaw(buildGmailMime({
      sender: 'sender@example.com',
      to: 'organizer@example.com',
      recipients: ['one@example.com'],
      subject: 'x',
      bodyText: body.text,
      bodyHtml: body.html,
      messageId: '<relay.batch-2@relay.internal>',
      batchId: 'batch-2',
    }));

    const delivered = decodePart(mime, 'text/html');
    expect(preview).toContain(delivered);
    expect(delivered).toContain('bgcolor="#111111"');
    expect(delivered).toContain('href="https://hackculture.io/challenges/trackshift-2026?ref=GR"');
  });

  it('survives the round trip for a full pasted HTML document', () => {
    const source = readFileSync(fileURLToPath(new URL('./fixtures/newsletter.html', import.meta.url)), 'utf8');
    const body = compileEmailBody({ bodyHtml: source, contentIds: [] });
    const mime = decodeRaw(buildGmailMime({
      sender: 'sender@example.com',
      to: 'organizer@example.com',
      recipients: ['one@example.com'],
      subject: 'Geek Room Hackathon Updates',
      bodyText: body.text,
      bodyHtml: body.html,
      messageId: '<relay.batch-3@relay.internal>',
      batchId: 'batch-3',
    }));

    const delivered = decodePart(mime, 'text/html');
    expect(delivered).toBe(body.html);
    // The parts of the design a recipient would notice are all still there.
    expect(delivered).toContain('Two hackathons.');
    expect(delivered).toContain('bgcolor="#1616d8"');
    expect(delivered).toContain('background-color:#f7f8ff');
    expect(delivered).toContain('href="https://hackculture.io/hackathons/code-cubicle-6-0"');
    expect((delivered.match(/<table/g) ?? []).length).toBe(16);
    expect((delivered.match(/<\/table>/g) ?? []).length).toBe(16);
    expect(decodePart(mime, 'text/plain')).toContain('Register for TrackShift');
  });

  it('keeps an inline image addressable from the delivered HTML', () => {
    const body = compileEmailBody({
      bodyHtml: '<p><img src="cid:image1" alt="Poster" width="560"></p>',
      contentIds: ['image1'],
    });
    const mime = decodeRaw(buildGmailMime({
      sender: 'sender@example.com',
      to: 'organizer@example.com',
      recipients: ['one@example.com'],
      subject: 'Poster',
      bodyText: body.text,
      bodyHtml: body.html,
      messageId: '<relay.batch-4@relay.internal>',
      batchId: 'batch-4',
      images: [{ contentId: 'image1', filename: 'p.png', mimeType: 'image/png', dataBase64: 'AAAB' }],
    }));

    expect(decodePart(mime, 'text/html')).toContain('src="cid:image1"');
    expect(mime).toContain('Content-ID: <image1>');
  });
});
