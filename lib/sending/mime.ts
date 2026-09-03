import { toBase64Url } from '@/lib/crypto/secrets';

export type InlineImage = {
  contentId: string;
  filename: string;
  mimeType: string;
  dataBase64: string;
};

export function buildGmailMime(input: {
  sender: string;
  to: string;
  recipients: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  messageId: string;
  batchId: string;
  images?: InlineImage[];
  unsubscribeUrl?: string;
  date?: Date;
}): string {
  const sender = cleanHeader(input.sender);
  const to = cleanHeader(input.to);
  const recipients = input.recipients.map(cleanHeader);
  const seed = input.batchId.replace(/[^a-z0-9]/gi, '');
  const altBoundary = `relay_alt_${seed}`;
  const relatedBoundary = `relay_rel_${seed}`;
  const images = input.images ?? [];

  const alternative = [
    `--${altBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(toStandardBase64(input.bodyText)),
    `--${altBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(toStandardBase64(input.bodyHtml)),
    `--${altBoundary}--`,
  ];

  const headers = [
    `From: ${sender}`,
    `To: ${to}`,
    // A test message goes to the sender alone, and an empty "Bcc:" header is
    // malformed, so the header only appears when there is a set behind it.
    ...(recipients.length ? [foldAddressHeader('Bcc', recipients)] : []),
    `Subject: ${encodeHeader(input.subject)}`,
    `Message-ID: ${cleanHeader(input.messageId)}`,
    `Date: ${(input.date ?? new Date()).toUTCString().replace('GMT', '+0000')}`,
    // Mailbox providers surface this as their own "Unsubscribe" control, and
    // its absence is a negative signal on bulk mail. One-Click POST is
    // deliberately not advertised: the whole set shares one Bcc'd body, so a
    // POST could not say which recipient to remove. The link asks instead.
    ...(input.unsubscribeUrl
      ? [`List-Unsubscribe: <${cleanHeader(input.unsubscribeUrl)}>, <mailto:${cleanHeader(sender)}?subject=Unsubscribe>`]
      : []),
    'MIME-Version: 1.0',
  ];

  // Without images the message is a plain text/html alternative. With them the
  // alternative becomes the first part of a multipart/related tree so that each
  // image can be addressed from the HTML by its cid: URL.
  const lines = images.length
    ? [
        ...headers,
        `Content-Type: multipart/related; boundary="${relatedBoundary}"; type="multipart/alternative"`,
        '',
        `--${relatedBoundary}`,
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        '',
        ...alternative,
        ...images.flatMap((image) => [
          `--${relatedBoundary}`,
          `Content-Type: ${cleanHeader(image.mimeType)}; name="${cleanFilename(image.filename)}"`,
          'Content-Transfer-Encoding: base64',
          `Content-ID: <${cleanContentId(image.contentId)}>`,
          `Content-Disposition: inline; filename="${cleanFilename(image.filename)}"`,
          '',
          wrapBase64(image.dataBase64.replace(/\s/g, '')),
        ]),
        `--${relatedBoundary}--`,
        '',
      ]
    : [
        ...headers,
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        '',
        ...alternative,
        '',
      ];

  return toBase64Url(new TextEncoder().encode(lines.join('\r\n')));
}

function cleanHeader(value: string): string {
  return value.replace(/[\r\n\0]/g, '').trim();
}

function cleanFilename(value: string): string {
  return cleanHeader(value).replace(/["\\]/g, '').slice(0, 120) || 'image';
}

function cleanContentId(value: string): string {
  return value.replace(/[^a-z0-9._-]/gi, '').slice(0, 64) || 'image';
}

function encodeHeader(value: string): string {
  return `=?UTF-8?B?${toStandardBase64(cleanHeader(value))}?=`;
}

function foldAddressHeader(name: string, addresses: string[]): string {
  if (!addresses.length) return `${name}:`;

  // Keep the comma attached to the address before a fold. A folded address
  // list still needs a comma between every mailbox; dropping it at the line
  // break makes Gmail reject larger lists as an "Invalid Bcc header".
  const tokens = addresses.map((address, index) =>
    `${address}${index < addresses.length - 1 ? ',' : ''}`,
  );
  const lines: string[] = [];
  let current = `${name}:`;
  for (const token of tokens) {
    const segment = ` ${token}`;
    if (current !== `${name}:` && current.length + segment.length > 78) {
      lines.push(current);
      current = segment;
    } else {
      current += segment;
    }
  }
  lines.push(current);
  return lines.join('\r\n');
}

function toStandardBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join('\r\n') ?? '';
}
