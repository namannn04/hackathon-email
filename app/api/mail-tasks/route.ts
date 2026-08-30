import { requireOrganizer } from '@/lib/auth/current-user';
import { assertTrustedMutation, HttpError, jsonError, readString } from '@/lib/http';
import { createMailTask, type ImagePlacement } from '@/lib/mail-tasks/manage';
import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 5;

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const actor = await requireOrganizer();
    const form = await request.formData();
    const toEmail = readString(form.get('toEmail'), 'To email', 320).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      throw new HttpError(400, 'Enter a valid To email address.', 'INVALID_TO_EMAIL');
    }
    const batchSize = Number(form.get('batchSize') ?? 300);
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 499) {
      throw new HttpError(400, 'Set size must be between 1 and 499 because the fixed To address also counts toward Gmail’s 500-recipient message limit.', 'INVALID_BATCH_SIZE');
    }
    const result = await createMailTask({
      eventId: readString(form.get('eventId'), 'Event', 80),
      name: readString(form.get('name'), 'Mail task name', 120),
      toEmail,
      subject: readString(form.get('subject'), 'Subject', 180),
      bodyText: readString(form.get('bodyText'), 'Email content', 50_000),
      bodyHtml: readOptionalHtml(form.get('bodyHtml')),
      images: await readImages(form.getAll('images')),
      imagePlacement: readPlacement(form.get('imagePlacement')),
      batchSize,
    }, actor);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// The organizer writes this HTML and only allowlisted organizers reach here.
// It is never rendered in the app, only placed in the outgoing message.
function readOptionalHtml(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 200_000) {
    throw new HttpError(400, 'HTML body is too long.', 'VALIDATION_ERROR');
  }
  return trimmed;
}

function readPlacement(value: unknown): ImagePlacement {
  return value === 'below' ? 'below' : 'above';
}

async function readImages(entries: FormDataEntryValue[]) {
  const files = entries.filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (!files.length) return [];
  if (files.length > MAX_IMAGES) {
    throw new HttpError(400, `Attach at most ${MAX_IMAGES} images.`, 'TOO_MANY_IMAGES');
  }
  let total = 0;
  const images = [];
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
