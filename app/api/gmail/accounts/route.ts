import { writeAudit } from '@/lib/audit';
import { requireAppUser } from '@/lib/auth/current-user';
import { decryptSecret } from '@/lib/crypto/secrets';
import { getPrisma } from '@/lib/db/prisma';
import { usesMockTransport } from '@/lib/gmail/transport';
import { assertTrustedMutation, HttpError, jsonError, readString } from '@/lib/http';
import { GMAIL_SEND_SCOPE } from '@/lib/gmail/scopes';
import { NextResponse } from 'next/server';

const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

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
        scopes: `openid email profile ${GMAIL_SEND_SCOPE}`,
      },
    });
    await writeAudit({ actorId: user.id, action: 'MOCK_GMAIL_ACCOUNT_CONNECTED', entityType: 'gmail_account', entityId: account.id, metadata: { email } });
    return NextResponse.json({ id: account.id, email }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertTrustedMutation(request);
    const user = await requireAppUser();
    const body = (await request.json()) as { id?: unknown };
    const id = readString(body.id, 'Gmail account', 80);
    const prisma = getPrisma();
    const account = await prisma.gmailAccount.findFirst({ where: { id, userId: user.id, revokedAt: null } });
    if (!account) throw new HttpError(404, 'That Gmail account is not connected to your account.', 'GMAIL_ACCOUNT_NOT_FOUND');

    // Tell Google to drop the grant first. A failure here must not leave the
    // account connected inside Relay, so the local revocation still happens.
    if (account.refreshTokenCiphertext) {
      try {
        await fetch(GOOGLE_REVOKE_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: await decryptSecret(account.refreshTokenCiphertext) }),
        });
      } catch (revokeError) {
        console.error('Google token revocation failed', revokeError);
      }
    }

    await prisma.gmailAccount.update({
      where: { id: account.id },
      data: { revokedAt: new Date(), refreshTokenCiphertext: null },
    });
    await writeAudit({
      actorId: user.id,
      action: 'GMAIL_ACCOUNT_DISCONNECTED',
      entityType: 'gmail_account',
      entityId: account.id,
      metadata: { email: account.email },
    });
    return NextResponse.json({ disconnected: true, email: account.email });
  } catch (error) {
    return jsonError(error);
  }
}
