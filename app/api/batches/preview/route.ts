import { requireAppUser } from '@/lib/auth/current-user';
import { jsonError, readString } from '@/lib/http';
import { getBatchPreview } from '@/lib/sending/send-batch';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAppUser();
    const batchId = readString(request.nextUrl.searchParams.get('batchId'), 'Set', 80);
    return NextResponse.json(await getBatchPreview(batchId, user));
  } catch (error) {
    return jsonError(error);
  }
}
