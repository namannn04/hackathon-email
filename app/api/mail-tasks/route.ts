import { requireOrganizer } from '@/lib/auth/current-user';
import { assertTrustedMutation, HttpError, jsonError, readString } from '@/lib/http';
import {
  assertBodyPresent,
  readImages,
  readOptionalHtml,
  readOptionalText,
  readPlacement,
} from '@/lib/mail-tasks/form';
import { createMailTask } from '@/lib/mail-tasks/manage';
import { NextRequest, NextResponse } from 'next/server';

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
    // Either body field alone is enough: the missing half is derived from the
    // other so the message always carries both MIME alternatives.
    const bodyText = readOptionalText(form.get('bodyText'));
    const bodyHtml = readOptionalHtml(form.get('bodyHtml'));
    assertBodyPresent(bodyText, bodyHtml);

    const result = await createMailTask({
      eventId: readString(form.get('eventId'), 'Event', 80),
      name: readString(form.get('name'), 'Mail task name', 120),
      toEmail,
      subject: readString(form.get('subject'), 'Subject', 180),
      bodyText,
      bodyHtml,
      images: await readImages(form.getAll('images')),
      imagePlacement: readPlacement(form.get('imagePlacement')),
      batchSize,
      origin: process.env.SITE_ORIGIN ?? request.nextUrl.origin,
    }, actor);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
