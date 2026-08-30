import { requireAppUser } from '@/lib/auth/current-user';
import { createGoogleAuthorizationUrl } from '@/lib/gmail/oauth';
import { jsonError } from '@/lib/http';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAppUser();
    const returnTo = request.nextUrl.searchParams.get('returnTo');
    return NextResponse.redirect(await createGoogleAuthorizationUrl(user, returnTo));
  } catch (error) {
    return jsonError(error);
  }
}
