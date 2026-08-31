import { requireAppUser } from '@/lib/auth/current-user';
import { createGoogleAuthorizationUrl } from '@/lib/gmail/oauth';
import { getPrisma } from '@/lib/db/prisma';
import { jsonError } from '@/lib/http';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAppUser();
    const returnTo = request.nextUrl.searchParams.get('returnTo');
    const accountId = request.nextUrl.searchParams.get('accountId');
    const account = accountId
      ? await getPrisma().gmailAccount.findFirst({ where: { id: accountId, userId: user.id }, select: { email: true } })
      : null;
    return NextResponse.redirect(await createGoogleAuthorizationUrl(user, returnTo, account?.email));
  } catch (error) {
    return jsonError(error);
  }
}
