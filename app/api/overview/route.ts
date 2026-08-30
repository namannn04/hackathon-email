import { requireAppUser } from '@/lib/auth/current-user';
import { getOverview } from '@/lib/events/overview';
import { jsonError } from '@/lib/http';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAppUser();
    const eventId = request.nextUrl.searchParams.get('eventId');
    const mailTaskId = request.nextUrl.searchParams.get('mailTaskId');
    return NextResponse.json(await getOverview(user, eventId, mailTaskId));
  } catch (error) {
    return jsonError(error);
  }
}
