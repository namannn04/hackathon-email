import { getD1 } from '@/db';
import { auditStatement } from '@/lib/audit';
import { requireAppUser } from '@/lib/auth/current-user';
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
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const email = `volunteer${Math.floor(Math.random() * 900 + 100)}@relay.test`;
    const d1 = getD1();
    await d1.batch([
      d1
        .prepare(
          `INSERT INTO gmail_accounts
           (id, user_id, google_subject, email, display_name, access_token_ciphertext,
            token_expires_at, scopes, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'Demo Gmail', 'mock', ?, 'gmail.send gmail.readonly', ?, ?)`,
        )
        .bind(id, user.id, `mock-${id}`, email, new Date(Date.now() + 86_400_000).toISOString(), now, now),
      auditStatement({
        actorId: user.id,
        action: 'MOCK_GMAIL_ACCOUNT_CONNECTED',
        entityType: 'gmail_account',
        entityId: id,
        metadata: { email },
      }),
    ]);
    return NextResponse.json({ id, email }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
