import { beforeAll, describe, expect, it } from 'vitest';
import { compileEmailBody, UNSUBSCRIBE_PLACEHOLDER } from '@/lib/email-html/document';
import { buildGmailMime } from '@/lib/sending/mime';
import {
  buildUnsubscribeUrl,
  createTestUnsubscribeToken,
  createUnsubscribeToken,
  isTestUnsubscribeId,
  readUnsubscribeToken,
} from '@/lib/unsubscribe/token';

beforeAll(() => {
  // 32 bytes, base64url, as the app requires.
  process.env.TOKEN_ENCRYPTION_KEY = 'A'.repeat(43);
});

function decodeRaw(value: string) {
  const standard = value.replaceAll('-', '+').replaceAll('_', '/');
  const bytes = Uint8Array.from(atob(standard), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

describe('unsubscribe token', () => {
  it('round-trips the mail task it was signed for', async () => {
    const token = await createUnsubscribeToken('mt123abc');
    expect(await readUnsubscribeToken(token)).toBe('mt123abc');
  });

  it('rejects a tampered payload', async () => {
    const token = await createUnsubscribeToken('mt123abc');
    const [version, , signature] = token.split('.');
    const forged = `${version}.${Buffer.from('mtSOMEONEELSE').toString('base64url')}.${signature}`;
    expect(await readUnsubscribeToken(forged)).toBeNull();
  });

  it('rejects a tampered signature, a wrong version and junk', async () => {
    const token = await createUnsubscribeToken('mt123abc');
    const [version, payload] = token.split('.');
    expect(await readUnsubscribeToken(`${version}.${payload}.AAAA`)).toBeNull();
    expect(await readUnsubscribeToken(`u9.${payload}.${token.split('.')[2]}`)).toBeNull();
    expect(await readUnsubscribeToken('not-a-token')).toBeNull();
    expect(await readUnsubscribeToken('')).toBeNull();
    expect(await readUnsubscribeToken(null)).toBeNull();
  });

  it('marks a test send so its link is not mistaken for a broken one', async () => {
    const id = await readUnsubscribeToken(await createTestUnsubscribeToken());
    expect(id).toBeTruthy();
    expect(isTestUnsubscribeId(id!)).toBe(true);
  });

  it('does not mark a real mail task as a test', async () => {
    const id = await readUnsubscribeToken(await createUnsubscribeToken('mt4310e1e2130c'));
    expect(isTestUnsubscribeId(id!)).toBe(false);
  });

  it('gives every test link a different id', async () => {
    const [a, b] = await Promise.all([createTestUnsubscribeToken(), createTestUnsubscribeToken()]);
    expect(a).not.toBe(b);
  });

  it('builds the link against whichever origin is running', async () => {
    const token = await createUnsubscribeToken('mt1');
    expect(buildUnsubscribeUrl('http://localhost:3000', token))
      .toBe(`http://localhost:3000/unsubscribe?t=${token}`);
    expect(buildUnsubscribeUrl('https://eventemailsender.namandadhich.in', token))
      .toBe(`https://eventemailsender.namandadhich.in/unsubscribe?t=${token}`);
    // A trailing path on the configured origin is ignored, not concatenated.
    expect(buildUnsubscribeUrl('https://eventemailsender.namandadhich.in/', token))
      .toBe(`https://eventemailsender.namandadhich.in/unsubscribe?t=${token}`);
  });
});

describe('unsubscribe in the message body', () => {
  const url = 'https://eventemailsender.namandadhich.in/unsubscribe?t=u1.abc.def';

  it('appends a footer when the author did not place the link', () => {
    const body = compileEmailBody({ bodyHtml: '<p>Hello</p>', contentIds: [], unsubscribeUrl: url });
    expect(body.html).toContain('<p>Hello</p>');
    expect(body.html).toContain(`href="${url.replaceAll('&', '&amp;')}"`);
    expect(body.html).toContain('Unsubscribe');
  });

  it('uses the author’s own placement when the placeholder is present', () => {
    const body = compileEmailBody({
      bodyHtml: `<p>Bye — <a href="${UNSUBSCRIBE_PLACEHOLDER}">opt out</a></p>`,
      contentIds: [],
      unsubscribeUrl: url,
    });
    expect(body.html).toContain('>opt out</a>');
    expect(body.html).not.toContain(UNSUBSCRIBE_PLACEHOLDER);
    // No second footer when the author already placed one.
    expect(body.html.match(/unsubscribe\?t=/g)?.length).toBe(1);
  });

  it('carries the link into the plain-text part too', () => {
    const html = compileEmailBody({ bodyHtml: '<p>Hello</p>', contentIds: [], unsubscribeUrl: url });
    expect(html.text).toContain(url);

    const typed = compileEmailBody({ bodyText: 'Hello there', contentIds: [], unsubscribeUrl: url });
    expect(typed.text).toContain('Hello there');
    expect(typed.text).toContain(`Unsubscribe: ${url}`);
  });

  it('adds nothing when no link is configured', () => {
    const body = compileEmailBody({ bodyHtml: '<p>Hello</p>', contentIds: [] });
    expect(body.html).toBe('<p>Hello</p>');
    expect(body.text).toBe('Hello');
  });
});

describe('unsubscribe headers on the wire', () => {
  const url = 'https://eventemailsender.namandadhich.in/unsubscribe?t=u1.abc.def';

  function headersOf(overrides: Partial<Parameters<typeof buildGmailMime>[0]> = {}) {
    const mime = decodeRaw(buildGmailMime({
      sender: 'organizer@gmail.com',
      to: 'organizer@gmail.com',
      recipients: ['a@example.com'],
      subject: 'Update',
      bodyText: 'Hello',
      bodyHtml: '<p>Hello</p>',
      messageId: '<relay.b1@relay.internal>',
      batchId: 'b1',
      unsubscribeUrl: url,
      date: new Date(Date.UTC(2026, 8, 3, 9, 30, 0)),
      ...overrides,
    }));
    return mime.slice(0, mime.indexOf('\r\n\r\n'));
  }

  it('advertises the link and a mailto fallback', () => {
    expect(headersOf()).toContain(`List-Unsubscribe: <${url}>, <mailto:organizer@gmail.com?subject=Unsubscribe>`);
  });

  it('does not claim one-click, which a Bcc’d set cannot honour', () => {
    expect(headersOf()).not.toMatch(/List-Unsubscribe-Post/i);
  });

  it('sets an RFC-shaped Date header', () => {
    expect(headersOf()).toContain('Date: Thu, 03 Sep 2026 09:30:00 +0000');
  });

  it('omits the header when no link is configured', () => {
    expect(headersOf({ unsubscribeUrl: undefined })).not.toMatch(/List-Unsubscribe/i);
  });
});
