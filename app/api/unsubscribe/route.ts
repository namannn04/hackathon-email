import { assertTrustedMutation, jsonError, readString } from '@/lib/http';
import { unsubscribeByToken } from '@/lib/unsubscribe/manage';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Public on purpose: a recipient unsubscribing is not a Relay user and has no
 * session. Authority comes from the signed token in the link plus the check
 * that the address really is on that event's list.
 */
export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const body = (await request.json()) as { token?: unknown; email?: unknown };
    const outcome = await unsubscribeByToken(
      typeof body.token === 'string' ? body.token : null,
      readString(body.email, 'Email', 254),
    );
    return NextResponse.json(outcome, { status: outcome.accepted ? 200 : 400 });
  } catch (error) {
    return jsonError(error);
  }
}
