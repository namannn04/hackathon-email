import { getD1 } from '@/db';
import { auditStatement } from '@/lib/audit';
import { requireOrganizer } from '@/lib/auth/current-user';
import { assertTrustedMutation, HttpError, jsonError, readString } from '@/lib/http';
import { isValidEmail, normalizeEmail } from '@/lib/imports/parser';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const actor = await requireOrganizer();
    const body = (await request.json()) as { email?: unknown; reason?: unknown };
    const email = readString(body.email, 'Email', 254);
    if (!isValidEmail(email)) throw new HttpError(400, 'Enter a valid email address.', 'INVALID_EMAIL');
    const reason = readString(body.reason, 'Reason', 240);
    const normalizedEmail = normalizeEmail(email);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const d1 = getD1();
    const stored = await d1
      .prepare(
        `INSERT INTO suppressions (id, normalized_email, reason, created_by_id, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(normalized_email) DO UPDATE SET reason = excluded.reason, created_by_id = excluded.created_by_id
         RETURNING id, normalized_email AS email, reason, created_at AS createdAt`,
      )
      .bind(id, normalizedEmail, reason, actor.id, now)
      .first<{ id: string; email: string; reason: string; createdAt: string }>();
    if (!stored) throw new HttpError(500, 'Could not save the suppression.', 'SUPPRESSION_SAVE_FAILED');
    await auditStatement({
      actorId: actor.id,
      action: 'RECIPIENT_SUPPRESSED',
      entityType: 'suppression',
      entityId: stored.id,
      metadata: { email: normalizedEmail, reason },
    }).run();
    return NextResponse.json(stored, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const actor = await requireOrganizer();
    const body = (await request.json()) as { id?: unknown };
    const id = readString(body.id, 'Suppression', 80);
    const removed = await getD1()
      .prepare('DELETE FROM suppressions WHERE id = ? RETURNING normalized_email AS email')
      .bind(id)
      .first<{ email: string }>();
    if (!removed) throw new HttpError(404, 'Suppression was not found.', 'SUPPRESSION_NOT_FOUND');
    await auditStatement({
      actorId: actor.id,
      action: 'SUPPRESSION_REMOVED',
      entityType: 'suppression',
      entityId: id,
      metadata: { email: removed.email },
    }).run();
    return NextResponse.json({ removed: true });
  } catch (error) {
    return jsonError(error);
  }
}
