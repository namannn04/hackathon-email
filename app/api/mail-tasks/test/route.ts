import { requireOrganizer } from '@/lib/auth/current-user';
import { assertTrustedMutation, jsonError, readString } from '@/lib/http';
import {
  assertBodyPresent,
  readImages,
  readOptionalHtml,
  readOptionalText,
  readPlacement,
} from '@/lib/mail-tasks/form';
import { sendTestEmail } from '@/lib/mail-tasks/test-send';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Sends the message being composed to the organizer themselves. The recipient
 * is taken from the signed-in account, never from the request, so this route
 * cannot be pointed at anyone else.
 */
export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const actor = await requireOrganizer();
    const form = await request.formData();
    const bodyText = readOptionalText(form.get('bodyText'));
    const bodyHtml = readOptionalHtml(form.get('bodyHtml'));
    assertBodyPresent(bodyText, bodyHtml);

    const result = await sendTestEmail({
      subject: readString(form.get('subject'), 'Subject', 180),
      bodyText,
      bodyHtml,
      images: await readImages(form.getAll('images')),
      imagePlacement: readPlacement(form.get('imagePlacement')),
      gmailAccountId: readString(form.get('gmailAccountId'), 'Gmail account', 80),
      origin: process.env.SITE_ORIGIN ?? request.nextUrl.origin,
    }, actor);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
