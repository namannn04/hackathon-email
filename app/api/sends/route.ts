import { requireAppUser } from '@/lib/auth/current-user';
import { assertTrustedMutation, jsonError, readString } from '@/lib/http';
import { sendBatch } from '@/lib/sending/send-batch';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const user = await requireAppUser();
    const body = (await request.json()) as { batchId?: unknown; gmailAccountId?: unknown };
    return NextResponse.json(await sendBatch(
      readString(body.batchId, 'Set', 80),
      readString(body.gmailAccountId, 'Gmail account', 80),
      user,
      process.env.SITE_ORIGIN ?? request.nextUrl.origin,
    ));
  } catch (error) {
    return jsonError(error);
  }
}
