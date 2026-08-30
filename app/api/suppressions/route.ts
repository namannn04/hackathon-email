import { writeAudit } from '@/lib/audit';
import { requireOrganizer } from '@/lib/auth/current-user';
import { getPrisma } from '@/lib/db/prisma';
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
    const stored = await getPrisma().suppression.upsert({
      where: { normalizedEmail },
      create: { normalizedEmail, reason, createdById: actor.id },
      update: { reason, createdById: actor.id },
    });
    await writeAudit({
      actorId: actor.id,
      action: 'RECIPIENT_SUPPRESSED',
      entityType: 'suppression',
      entityId: stored.id,
      metadata: { email: normalizedEmail, reason },
    });
    return NextResponse.json({ id: stored.id, email: stored.normalizedEmail, reason: stored.reason, createdAt: stored.createdAt.toISOString() }, { status: 201 });
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
    const removed = await getPrisma().suppression.findUnique({ where: { id } });
    if (!removed) throw new HttpError(404, 'Suppression was not found.', 'SUPPRESSION_NOT_FOUND');
    await getPrisma().suppression.delete({ where: { id } });
    await writeAudit({
      actorId: actor.id,
      action: 'SUPPRESSION_REMOVED',
      entityType: 'suppression',
      entityId: id,
      metadata: { email: removed.normalizedEmail },
    });
    return NextResponse.json({ removed: true });
  } catch (error) {
    return jsonError(error);
  }
}
