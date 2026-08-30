import type { User } from '@/generated/prisma/client';
import { writeAudit } from '@/lib/audit';
import { toBase64Url } from '@/lib/crypto/secrets';
import { getPrisma } from '@/lib/db/prisma';
import { HttpError } from '@/lib/http';

const INVITE_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;

export async function createEventInvite(eventId: string, actor: User, origin: string) {
  const prisma = getPrisma();
  const event = await prisma.event.findFirst({ where: { id: eventId, status: { not: 'ARCHIVED' } } });
  if (!event) throw new HttpError(404, 'Event was not found.', 'EVENT_NOT_FOUND');

  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + INVITE_LIFETIME_MS);
  const invite = await prisma.eventInvite.create({
    data: {
      eventId,
      tokenHash: await hashInviteToken(token),
      createdById: actor.id,
      expiresAt,
    },
  });
  await writeAudit({
    actorId: actor.id,
    action: 'EVENT_INVITE_CREATED',
    entityType: 'event',
    entityId: eventId,
    metadata: { inviteId: invite.id, expiresAt: expiresAt.toISOString() },
  });
  return {
    id: invite.id,
    eventId,
    eventName: event.name,
    url: new URL(`/join/${token}`, new URL(origin).origin).toString(),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function acceptEventInvite(token: string, user: User) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
    throw new HttpError(404, 'This event invitation is invalid.', 'INVITE_INVALID');
  }
  const prisma = getPrisma();
  const invite = await prisma.eventInvite.findFirst({
    where: {
      tokenHash: await hashInviteToken(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
      event: { status: { in: ['ACTIVE', 'PAUSED', 'COMPLETED'] } },
    },
    select: { eventId: true },
  });
  if (!invite) {
    throw new HttpError(410, 'This event invitation has expired or was revoked.', 'INVITE_UNAVAILABLE');
  }
  await prisma.eventMember.upsert({
    where: { eventId_userId: { eventId: invite.eventId, userId: user.id } },
    create: { eventId: invite.eventId, userId: user.id, role: 'VOLUNTEER' },
    update: { joinedAt: new Date() },
  });
  await writeAudit({
    actorId: user.id,
    action: 'EVENT_INVITE_ACCEPTED',
    entityType: 'event',
    entityId: invite.eventId,
  });
  return invite;
}

export async function revokeEventInvite(inviteId: string, actor: User) {
  const prisma = getPrisma();
  const result = await prisma.eventInvite.updateMany({
    where: { id: inviteId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!result.count) throw new HttpError(404, 'Active invitation was not found.', 'INVITE_NOT_FOUND');
  const invite = await prisma.eventInvite.findUniqueOrThrow({ where: { id: inviteId }, select: { eventId: true } });
  await writeAudit({
    actorId: actor.id,
    action: 'EVENT_INVITE_REVOKED',
    entityType: 'event',
    entityId: invite.eventId,
    metadata: { inviteId },
  });
  return invite;
}

async function hashInviteToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return toBase64Url(new Uint8Array(digest));
}
