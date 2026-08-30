import { requireOrganizer } from '@/lib/auth/current-user';
import { assertTrustedMutation, jsonError, readString } from '@/lib/http';
import { createEventInvite, revokeEventInvite } from '@/lib/invites/access';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const actor = await requireOrganizer();
    const body = (await request.json()) as { eventId?: unknown };
    const origin = process.env.SITE_ORIGIN ?? request.nextUrl.origin;
    const invite = await createEventInvite(readString(body.eventId, 'Event', 80), actor, origin);
    return NextResponse.json(invite, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const actor = await requireOrganizer();
    const body = (await request.json()) as { inviteId?: unknown };
    const invite = await revokeEventInvite(readString(body.inviteId, 'Invitation', 80), actor);
    return NextResponse.json({ revoked: true, eventId: invite.eventId });
  } catch (error) {
    return jsonError(error);
  }
}
