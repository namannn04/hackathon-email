import { requireAppUser } from '@/lib/auth/current-user';
import { claimBatches } from '@/lib/claims/claim-batches';
import { assertTrustedMutation, HttpError, jsonError, readString } from '@/lib/http';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const user = await requireAppUser();
    const body = (await request.json()) as { campaignId?: unknown; batchIds?: unknown };
    const campaignId = readString(body.campaignId, 'Campaign', 80);
    if (!Array.isArray(body.batchIds) || !body.batchIds.every((value) => typeof value === 'string')) {
      throw new HttpError(400, 'Choose valid batches.', 'INVALID_BATCH_SELECTION');
    }
    const batches = await claimBatches(campaignId, body.batchIds, user);
    return NextResponse.json({ batches });
  } catch (error) {
    return jsonError(error);
  }
}
