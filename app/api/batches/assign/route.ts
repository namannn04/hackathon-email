import { requireAppUser } from '@/lib/auth/current-user';
import { assignGmailAccount } from '@/lib/claims/claim-batches';
import { assertTrustedMutation, jsonError, readString } from '@/lib/http';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const user = await requireAppUser();
    const body = (await request.json()) as { batchId?: unknown; gmailAccountId?: unknown };
    const batch = await assignGmailAccount(
      readString(body.batchId, 'Batch', 80),
      readString(body.gmailAccountId, 'Gmail account', 80),
      user,
    );
    return NextResponse.json({ batch });
  } catch (error) {
    return jsonError(error);
  }
}
