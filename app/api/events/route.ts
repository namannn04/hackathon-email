import { requireOrganizer } from '@/lib/auth/current-user';
import { createEventWithRecipients, deleteEvent } from '@/lib/events/manage';
import { assertTrustedMutation, HttpError, jsonError, readString } from '@/lib/http';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const actor = await requireOrganizer();
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new HttpError(400, 'Choose a CSV or XLSX file.', 'FILE_REQUIRED');
    const result = await createEventWithRecipients({
      name: readString(form.get('name'), 'Event name', 120),
      file,
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
    const body = (await request.json()) as { eventId?: unknown };
    const result = await deleteEvent(readString(body.eventId, 'Event', 80), actor);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
