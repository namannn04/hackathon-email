import { requireAppUser } from '@/lib/auth/current-user';
import { jsonError, readString } from '@/lib/http';
import { getBatchPreviewDocument } from '@/lib/sending/send-batch';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Serves the set's HTML part as a document so the sending desk can render it in
 * a sandboxed iframe. The response is framed by this app only, never scripted,
 * and never cached because a mail task's body can change between reads.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAppUser();
    const batchId = readString(request.nextUrl.searchParams.get('batchId'), 'Set', 80);
    const document = await getBatchPreviewDocument(batchId, user);
    return new NextResponse(document, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:; frame-ancestors 'self'",
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
