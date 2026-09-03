import { requireOrganizer } from '@/lib/auth/current-user';
import { assertTrustedMutation, HttpError, jsonError, readString } from '@/lib/http';
import {
  assertBodyPresent,
  readImages,
  readOptionalHtml,
  readOptionalText,
  readPlacement,
} from '@/lib/mail-tasks/form';
import { createMailTask, deleteMailTask } from '@/lib/mail-tasks/manage';
import {
  formatToAddresses,
  MAX_TO_ADDRESSES,
  maxBccForToCount,
  parseToAddresses,
} from '@/lib/sending/addresses';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const actor = await requireOrganizer();
    const form = await request.formData();
    const to = parseToAddresses(readString(form.get('toEmail'), 'To email', 1_000));
    if (to.invalid.length) {
      throw new HttpError(400, `${to.invalid[0]} is not a valid email address. Separate multiple To addresses with commas.`, 'INVALID_TO_EMAIL');
    }
    if (!to.addresses.length) {
      throw new HttpError(400, 'Enter at least one To address.', 'INVALID_TO_EMAIL');
    }
    if (to.addresses.length > MAX_TO_ADDRESSES) {
      throw new HttpError(400, `Use at most ${MAX_TO_ADDRESSES} To addresses.`, 'TOO_MANY_TO_ADDRESSES');
    }

    // Every To address costs a Bcc slot, because Gmail counts them together.
    const maxBatchSize = maxBccForToCount(to.addresses.length);
    const batchSize = Number(form.get('batchSize') ?? 300);
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > maxBatchSize) {
      throw new HttpError(
        400,
        `Set size must be between 1 and ${maxBatchSize}: ${to.addresses.length} To ${to.addresses.length === 1 ? 'address' : 'addresses'} plus ${maxBatchSize} Bcc reaches Gmail’s ${500}-recipient message limit.`,
        'INVALID_BATCH_SIZE',
      );
    }
    // Either body field alone is enough: the missing half is derived from the
    // other so the message always carries both MIME alternatives.
    const bodyText = readOptionalText(form.get('bodyText'));
    const bodyHtml = readOptionalHtml(form.get('bodyHtml'));
    assertBodyPresent(bodyText, bodyHtml);

    const result = await createMailTask({
      eventId: readString(form.get('eventId'), 'Event', 80),
      name: readString(form.get('name'), 'Mail task name', 120),
      toEmail: formatToAddresses(to.addresses),
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

export async function DELETE(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const actor = await requireOrganizer();
    const body = (await request.json()) as { mailTaskId?: unknown };
    return NextResponse.json(await deleteMailTask(readString(body.mailTaskId, 'Mail task', 80), actor));
  } catch (error) {
    return jsonError(error);
  }
}
