import { requireAppUser } from '@/lib/auth/current-user';
import { getOverview } from '@/lib/campaigns/overview';
import { jsonError } from '@/lib/http';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAppUser();
    const campaignId = request.nextUrl.searchParams.get('campaignId');
    return NextResponse.json(await getOverview(user, campaignId));
  } catch (error) {
    return jsonError(error);
  }
}
