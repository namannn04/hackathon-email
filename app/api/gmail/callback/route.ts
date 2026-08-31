import { requireAppUser } from '@/lib/auth/current-user';
import { completeGoogleAuthorization, getGoogleAuthorizationReturnPath } from '@/lib/gmail/oauth';
import { HttpError } from '@/lib/http';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  let fallback = new URL('/my-batches', request.url);
  try {
    const user = await requireAppUser();
    const state = request.nextUrl.searchParams.get('state');
    fallback = new URL(await getGoogleAuthorizationReturnPath(state, user.id), request.url);
    const providerError = request.nextUrl.searchParams.get('error');
    if (providerError) throw new HttpError(400, 'Google connection was cancelled.', providerError);
    const code = request.nextUrl.searchParams.get('code');
    if (!code || !state) throw new HttpError(400, 'Google did not return the required values.', 'OAUTH_CALLBACK_INVALID');
    const result = await completeGoogleAuthorization({ code, state, authenticatedUserId: user.id });
    const target = new URL(result.returnTo, request.url);
    target.searchParams.set('gmail', 'connected');
    return NextResponse.redirect(target);
  } catch (error) {
    fallback.searchParams.set('gmail', 'error');
    fallback.searchParams.set('message', error instanceof Error ? error.message.slice(0, 160) : 'Connection failed');
    return NextResponse.redirect(fallback);
  }
}
