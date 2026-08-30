export type ParsedRecipient = {
  email: string;
  normalizedEmail: string;
};

export type RecipientParseResult = {
  recipients: ParsedRecipient[];
  totalValues: number;
  invalidCount: number;
  duplicateCount: number;
};

const EMAIL_HEADERS = new Set(['email', 'emailaddress', 'emailid', 'mail']);

export function normalizeEmail(value: string): string {
  return value.trim().normalize('NFKC').toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  if (email.length < 3 || email.length > 254 || /\s/.test(email)) return false;
  const at = email.lastIndexOf('@');
  if (at <= 0 || at !== email.indexOf('@')) return false;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || domain.length > 253) return false;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;

  const labels = domain.split('.');
  if (labels.length < 2) return false;
  return labels.every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9-]+$/i.test(label) &&
      !label.startsWith('-') &&
      !label.endsWith('-'),
  );
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, '');
  return rows;
}

export function extractRecipients(rows: unknown[][]): RecipientParseResult {
  const firstRow = rows[0] ?? [];
  const emailColumn = firstRow.findIndex((value) => {
    const header = String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    return EMAIL_HEADERS.has(header);
  });

  const values =
    emailColumn >= 0
      ? rows.slice(1).map((row) => row[emailColumn])
      : rows.flatMap((row) => row);

  const seen = new Set<string>();
  const recipients: ParsedRecipient[] = [];
  let invalidCount = 0;
  let duplicateCount = 0;
  let totalValues = 0;

  for (const rawValue of values) {
    const email = String(rawValue ?? '').trim();
    if (!email) continue;
    totalValues += 1;
    if (!isValidEmail(email)) {
      invalidCount += 1;
      continue;
    }

    const normalizedEmail = normalizeEmail(email);
    if (seen.has(normalizedEmail)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(normalizedEmail);
    recipients.push({ email, normalizedEmail });
  }

  return { recipients, totalValues, invalidCount, duplicateCount };
}

export async function parseRecipientFile(file: File): Promise<RecipientParseResult> {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Recipient file must be 10 MB or smaller.');
  }

  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'csv' || file.type === 'text/csv') {
    return extractRecipients(parseCsv(await file.text()));
  }
  if (extension === 'xlsx') {
    const { readSheet } = await import('read-excel-file/web-worker');
    const rows = await readSheet(file);
    return extractRecipients(rows);
  }
  throw new Error('Upload a .csv or .xlsx file.');
}
