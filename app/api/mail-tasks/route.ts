import { requireOrganizer } from '@/lib/auth/current-user';
import { assertTrustedMutation, HttpError, jsonError, readString } from '@/lib/http';
import { createMailTask } from '@/lib/mail-tasks/manage';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const actor = await requireOrganizer();
    const body = (await request.json()) as Record<string, unknown>;
    const toEmail = readString(body.toEmail, 'To email', 320).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      throw new HttpError(400, 'Enter a valid To email address.', 'INVALID_TO_EMAIL');
    }
    const batchSize = Number(body.batchSize ?? 300);
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 499) {
      throw new HttpError(400, 'Set size must be between 1 and 499 because the fixed To address also counts toward Gmail’s 500-recipient message limit.', 'INVALID_BATCH_SIZE');
    }
    const result = await createMailTask({
      eventId: readString(body.eventId, 'Event', 80),
      name: readString(body.name, 'Mail task name', 120),
      toEmail,
      subject: readString(body.subject, 'Subject', 180),
      bodyText: readString(body.bodyText, 'Email content', 50_000),
      batchSize,
    }, actor);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
