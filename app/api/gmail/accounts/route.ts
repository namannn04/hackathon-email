import { writeAudit } from '@/lib/audit';
import { requireAppUser } from '@/lib/auth/current-user';
import { getPrisma } from '@/lib/db/prisma';
import { usesMockTransport } from '@/lib/gmail/transport';
import { assertTrustedMutation, HttpError, jsonError } from '@/lib/http';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    assertTrustedMutation(request);
    const user = await requireAppUser();
    if (!usesMockTransport()) {
      throw new HttpError(404, 'Mock Gmail accounts are disabled.', 'NOT_FOUND');
    }
    const email = `volunteer${Math.floor(Math.random() * 900 + 100)}@relay.test`;
    const account = await getPrisma().gmailAccount.create({
      data: {
        userId: user.id,
        googleSubject: `mock-${crypto.randomUUID()}`,
        email,
        displayName: 'Demo Gmail',
        accessTokenCiphertext: 'mock',
        tokenExpiresAt: new Date(Date.now() + 86_400_000),
        scopes: 'gmail.send gmail.readonly',
      },
    });
    await writeAudit({ actorId: user.id, action: 'MOCK_GMAIL_ACCOUNT_CONNECTED', entityType: 'gmail_account', entityId: account.id, metadata: { email } });
    return NextResponse.json({ id: account.id, email }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
