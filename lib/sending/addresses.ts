/**
 * The fixed To list of a mail task.
 *
 * Gmail counts To, Cc and Bcc together against one message's recipient limit,
 * so every extra To address costs one Bcc slot. Parsing and that arithmetic
 * live here so the compose form, the create API and the send path agree on
 * exactly how many recipients a set may hold.
 *
 * Pure, so the browser can show the same numbers the server will enforce.
 */

/** Gmail rejects a single message addressed to more than this many recipients. */
export const GMAIL_MESSAGE_RECIPIENT_LIMIT = 500;

export const MAX_TO_ADDRESSES = 5;

// A comma is the separator, so it can never appear inside an address. Quotes,
// angle brackets and the other header punctuation are excluded too: they have
// meaning in an address list, and nothing legitimate here needs them.
const EMAIL_PATTERN = /^[^\s@,"<>;:\\]+@[^\s@,"<>;:\\]+\.[^\s@,"<>;:\\]+$/;

export type ToAddressParse = {
  addresses: string[];
  /** Entries that are not valid addresses, in the order they were written. */
  invalid: string[];
  /** Entries dropped because the same address appeared twice. */
  duplicates: string[];
};

/**
 * Splits a comma-separated To field into addresses, lowercased and de-duplicated.
 * Reports what it rejected instead of quietly dropping it, so the organizer can
 * see that two addresses really were read as two.
 */
export function parseToAddresses(value: string): ToAddressParse {
  const addresses: string[] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  for (const raw of value.split(',')) {
    const entry = raw.trim();
    if (!entry) continue;
    const normalized = entry.toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) {
      invalid.push(entry);
      continue;
    }
    if (seen.has(normalized)) {
      duplicates.push(normalized);
      continue;
    }
    seen.add(normalized);
    addresses.push(normalized);
  }

  return { addresses, invalid, duplicates };
}

/** The stored form: one string, exactly as the MIME To header reads. */
export function formatToAddresses(addresses: string[]): string {
  return addresses.join(', ');
}

/** Reads a stored To field back into its addresses. */
export function readToAddresses(stored: string): string[] {
  return parseToAddresses(stored).addresses;
}

/** How many Bcc recipients a set may hold once the To list is accounted for. */
export function maxBccForToCount(toCount: number): number {
  return Math.max(1, GMAIL_MESSAGE_RECIPIENT_LIMIT - Math.max(1, toCount));
}
