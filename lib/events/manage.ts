import type { User } from '@/generated/prisma/client';
import { writeAudit } from '@/lib/audit';
import { getPrisma } from '@/lib/db/prisma';
import { HttpError } from '@/lib/http';
import { parseRecipientFile } from '@/lib/imports/parser';

export async function createEventWithRecipients(input: { name: string; file: File }, actor: User) {
  const parsed = await parseRecipientFile(input.file).catch((error: unknown) => {
    throw new HttpError(
      400,
      error instanceof Error ? error.message : 'Could not read the recipient file.',
      'INVALID_RECIPIENT_FILE',
    );
  });
  if (!parsed.recipients.length) {
    throw new HttpError(400, 'No valid email addresses were found.', 'NO_VALID_RECIPIENTS');
  }
  if (parsed.recipients.length > 100_000) {
    throw new HttpError(400, 'An event can contain at most 100,000 recipients.', 'IMPORT_TOO_LARGE');
  }

  const prisma = getPrisma();
  const event = await prisma.event.create({
    data: {
      name: input.name,
      createdById: actor.id,
      members: { create: { userId: actor.id, role: 'ORGANIZER' } },
    },
  });
  try {
    for (let start = 0; start < parsed.recipients.length; start += 1000) {
      await prisma.eventRecipient.createMany({
        data: parsed.recipients.slice(start, start + 1000).map((recipient) => ({
          eventId: event.id,
          email: recipient.email,
          normalizedEmail: recipient.normalizedEmail,
        })),
      });
    }
    await Promise.all([
      prisma.activityEvent.create({
        data: {
          eventId: event.id,
          actorId: actor.id,
          action: 'EVENT_CREATED',
          status: 'SUCCESS',
          emailCount: parsed.recipients.length,
          detail: `${parsed.recipients.length} recipients imported`,
        },
      }),
      writeAudit({
        actorId: actor.id,
        action: 'EVENT_CREATED',
        entityType: 'event',
        entityId: event.id,
        metadata: {
          sourceFile: input.file.name,
          accepted: parsed.recipients.length,
          invalid: parsed.invalidCount,
          duplicates: parsed.duplicateCount,
        },
      }),
    ]);
  } catch (error) {
    await prisma.event.delete({ where: { id: event.id } }).catch(() => undefined);
    throw error;
  }

  return {
    eventId: event.id,
    accepted: parsed.recipients.length,
    invalid: parsed.invalidCount,
    duplicates: parsed.duplicateCount,
  };
}

export async function deleteEvent(eventId: string, actor: User) {
  const prisma = getPrisma();
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      _count: { select: { recipients: true, members: true, mailTasks: true } },
    },
  });
  if (!event) throw new HttpError(404, 'Event not found.', 'EVENT_NOT_FOUND');

  const sendingBatches = await prisma.batch.count({
    where: { mailTask: { eventId }, status: 'SENDING' },
  });
  if (sendingBatches > 0) {
    throw new HttpError(409, 'Wait for active sends to finish before deleting this event.', 'EVENT_SEND_ACTIVE');
  }

  await prisma.$transaction([
    prisma.auditEvent.create({
      data: {
        actorId: actor.id,
        action: 'EVENT_DELETED',
        entityType: 'event',
        entityId: event.id,
        metadataJson: {
          eventName: event.name,
          recipients: event._count.recipients,
          members: event._count.members,
          mailTasks: event._count.mailTasks,
        },
      },
    }),
    prisma.event.delete({ where: { id: event.id } }),
  ]);

  return { eventId: event.id, eventName: event.name };
}
