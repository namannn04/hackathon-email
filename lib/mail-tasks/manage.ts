import type { User } from '@/generated/prisma/client';
import { writeAudit } from '@/lib/audit';
import { planBatchSizes } from '@/lib/batching/plan';
import { getPrisma } from '@/lib/db/prisma';
import { HttpError } from '@/lib/http';

export async function createMailTask(input: {
  eventId: string;
  name: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  batchSize: number;
}, actor: User) {
  const prisma = getPrisma();
  const event = await prisma.event.findFirst({
    where: { id: input.eventId, status: 'ACTIVE' },
    select: { id: true, recipients: { orderBy: { createdAt: 'asc' }, select: { id: true, normalizedEmail: true } } },
  });
  if (!event) throw new HttpError(404, 'Event was not found.', 'EVENT_NOT_FOUND');
  const suppressions = new Set<string>();
  for (let cursor = 0; cursor < event.recipients.length; cursor += 5_000) {
    const emails = event.recipients.slice(cursor, cursor + 5_000).map((recipient) => recipient.normalizedEmail);
    const rows = await prisma.suppression.findMany({
      where: { normalizedEmail: { in: emails } },
      select: { normalizedEmail: true },
    });
    for (const row of rows) suppressions.add(row.normalizedEmail);
  }
  const recipients = event.recipients.filter((recipient) => !suppressions.has(recipient.normalizedEmail));
  if (!recipients.length) {
    throw new HttpError(400, 'This event has no sendable recipients.', 'NO_SENDABLE_RECIPIENTS');
  }

  const sizes = planBatchSizes(recipients.length, input.batchSize);
  const task = await prisma.mailTask.create({
    data: {
      eventId: event.id,
      name: input.name,
      toEmail: input.toEmail.toLowerCase(),
      subject: input.subject,
      bodyText: input.bodyText,
      bodyHtml: plainTextToHtml(input.bodyText),
      batchSize: input.batchSize,
    },
  });
  try {
    let cursor = 0;
    for (const [index, size] of sizes.entries()) {
      const batch = await prisma.batch.create({
        data: { mailTaskId: task.id, number: index + 1, recipientCount: size },
      });
      const rows = recipients.slice(cursor, cursor + size);
      cursor += size;
      await prisma.mailTaskRecipient.createMany({
        data: rows.map((recipient) => ({
          mailTaskId: task.id,
          batchId: batch.id,
          recipientId: recipient.id,
        })),
      });
    }
    await Promise.all([
      prisma.activityEvent.create({
        data: {
          eventId: event.id,
          mailTaskId: task.id,
          actorId: actor.id,
          action: 'MAIL_TASK_CREATED',
          status: 'SUCCESS',
          emailCount: recipients.length,
          detail: `${sizes.length} sets created: ${sizes.join(', ')}`,
        },
      }),
      writeAudit({
        actorId: actor.id,
        action: 'MAIL_TASK_CREATED',
        entityType: 'mail_task',
        entityId: task.id,
        metadata: { eventId: event.id, batchSizes: sizes, suppressed: suppressions.size },
      }),
    ]);
  } catch (error) {
    await prisma.mailTask.delete({ where: { id: task.id } }).catch(() => undefined);
    throw error;
  }

  return { mailTaskId: task.id, eventId: event.id, batches: sizes.length, batchSizes: sizes };
}

function plainTextToHtml(value: string) {
  return `<div style="font-family:Arial,sans-serif;line-height:1.6;white-space:pre-wrap">${value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')}</div>`;
}
