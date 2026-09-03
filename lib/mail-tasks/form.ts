import type { ImagePlacement } from '@/lib/email-html/document';
import { HttpError } from '@/lib/http';

/**
 * Shared parsing for the two routes that accept a composed message — creating a
 * mail task and sending a test of one. Both read the same fields under the same
 * limits, so a body that previews and tests cleanly is a body the real send
 * accepts.
 */

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 5;

export type ComposedImage = {
  filename: string;
  mimeType: string;
  dataBase64: string;
  byteSize: number;
};

export function readOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 50_000) {
    throw new HttpError(400, 'Plain-text body is too long.', 'VALIDATION_ERROR');
  }
  return value;
}

// Only organizers reach these routes, and the markup still goes through the
// email-HTML compiler before it is stored or sent, so what lands in the
// outgoing message is the same sanitised markup every preview renders.
export function readOptionalHtml(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 200_000) {
    throw new HttpError(400, 'HTML body is too long.', 'VALIDATION_ERROR');
  }
  return trimmed;
}

export function readPlacement(value: unknown): ImagePlacement {
  return value === 'below' ? 'below' : 'above';
}

export function assertBodyPresent(bodyText: string | undefined, bodyHtml: string | undefined): void {
  if (!bodyText && !bodyHtml) {
    throw new HttpError(400, 'Add an email body: write the plain-text body, the HTML body, or both.', 'BODY_REQUIRED');
  }
}

export async function readImages(entries: FormDataEntryValue[]): Promise<ComposedImage[]> {
  const files = entries.filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (!files.length) return [];
  if (files.length > MAX_IMAGES) {
    throw new HttpError(400, `Attach at most ${MAX_IMAGES} images.`, 'TOO_MANY_IMAGES');
  }
  let total = 0;
  const images: ComposedImage[] = [];
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      throw new HttpError(400, `${file.name} is not a PNG, JPEG, GIF, or WebP image.`, 'UNSUPPORTED_IMAGE_TYPE');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new HttpError(400, `${file.name} is larger than 2 MB. Every recipient set carries a copy, so keep images small.`, 'IMAGE_TOO_LARGE');
    }
    total += file.size;
    if (total > MAX_TOTAL_IMAGE_BYTES) {
      throw new HttpError(400, 'The attached images add up to more than 8 MB.', 'IMAGES_TOO_LARGE');
    }
    images.push({
      filename: file.name,
      mimeType: file.type,
      dataBase64: toBase64(new Uint8Array(await file.arrayBuffer())),
      byteSize: file.size,
    });
  }
  return images;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}
