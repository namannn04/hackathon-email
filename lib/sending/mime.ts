import { toBase64Url } from '@/lib/crypto/secrets';

export function buildGmailMime(input: {
  sender: string;
  recipients: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  messageId: string;
  batchId: string;
}): string {
  const sender = cleanHeader(input.sender);
  const recipients = input.recipients.map(cleanHeader);
  const boundary = `relay_${input.batchId.replace(/[^a-z0-9]/gi, '')}`;
  const lines = [
    `From: ${sender}`,
    `To: ${sender}`,
    foldAddressHeader('Bcc', recipients),
    `Subject: ${encodeHeader(input.subject)}`,
    `Message-ID: ${cleanHeader(input.messageId)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(toStandardBase64(input.bodyText)),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(toStandardBase64(input.bodyHtml)),
    `--${boundary}--`,
    '',
  ];
  return toBase64Url(new TextEncoder().encode(lines.join('\r\n')));
}

function cleanHeader(value: string): string {
  return value.replace(/[\r\n\0]/g, '').trim();
}

function encodeHeader(value: string): string {
  return `=?UTF-8?B?${toStandardBase64(cleanHeader(value))}?=`;
}

function foldAddressHeader(name: string, addresses: string[]): string {
  const lines: string[] = [];
  let current = `${name}: `;
  for (const [index, address] of addresses.entries()) {
    const segment = `${index === 0 ? '' : ', '}${address}`;
    if (current.length + segment.length > 76) {
      lines.push(current);
      current = ` ${address}`;
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
