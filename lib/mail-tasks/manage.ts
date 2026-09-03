import type { User } from '@/generated/prisma/client';
import { writeAudit } from '@/lib/audit';
import { planBatchSizes } from '@/lib/batching/plan';
import { getPrisma } from '@/lib/db/prisma';
import { compileEmailBody, type ImagePlacement } from '@/lib/email-html/document';
import { buildUnsubscribeUrl, createUnsubscribeToken } from '@/lib/unsubscribe/token';
import { HttpError } from '@/lib/http';

export async function createMailTask(input: {
  eventId: string;
  name: string;
  toEmail: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  images?: Array<{ filename: string; mimeType: string; dataBase64: string; byteSize: number }>;
  imagePlacement?: ImagePlacement;
  batchSize: number;
  origin: string;
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
  const images = (input.images ?? []).map((image, index) => ({ ...image, contentId: `image${index + 1}`, position: index }));
  // The unsubscribe link names this task, so its id is chosen before the row is
  // written. That way the stored body is already final: nothing is substituted
  // at send time, and the preview of a stored body stays byte-exact.
  const mailTaskId = createId();
  const body = compileEmailBody({
    bodyHtml: input.bodyHtml,
    bodyText: input.bodyText,
    contentIds: images.map((image) => image.contentId),
    placement: input.imagePlacement,
    unsubscribeUrl: buildUnsubscribeUrl(input.origin, await createUnsubscribeToken(mailTaskId)),
  });
  const task = await prisma.mailTask.create({
    data: {
      id: mailTaskId,
      eventId: event.id,
      name: input.name,
      toEmail: input.toEmail,
      subject: input.subject,
      bodyText: body.text,
      bodyHtml: body.html,
      batchSize: input.batchSize,
      images: images.length
        ? { createMany: { data: images.map(({ contentId, filename, mimeType, dataBase64, byteSize, position }) => ({ contentId, filename, mimeType, dataBase64, byteSize, position })) } }
        : undefined,
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

  return { mailTaskId: task.id, eventId: event.id, batches: sizes.length, batchSizes: sizes, htmlWarnings: body.warnings };
}

/**
 * Removes a mail task and everything that hangs off it: its recipient sets,
 * their delivery rows and send records, its inline images and its activity.
 *
 * A task that has already sent is still removable — the same rule the event
 * delete follows — but an in-flight send is not interrupted, and the audit
 * record keeps what was destroyed, including how many recipients had already
 * received it. Suppressions are untouched: an unsubscribe outlives the task
 * that prompted it.
 */
export async function deleteMailTask(mailTaskId: string, actor: User) {
  const prisma = getPrisma();
  const task = await prisma.mailTask.findUnique({
    where: { id: mailTaskId },
    select: {
      id: true,
      name: true,
      eventId: true,
      event: { select: { name: true } },
      _count: { select: { batches: true, deliveries: true } },
    },
  });
  if (!task) throw new HttpError(404, 'Mail task not found.', 'MAIL_TASK_NOT_FOUND');

  const sending = await prisma.batch.count({ where: { mailTaskId, status: 'SENDING' } });
  if (sending > 0) {
    throw new HttpError(409, 'Wait for the active send to finish before deleting this mail task.', 'MAIL_TASK_SEND_ACTIVE');
  }

  const sentRecipients = await prisma.mailTaskRecipient.count({ where: { mailTaskId, status: 'SENT' } });
  const sentBatches = await prisma.batch.count({ where: { mailTaskId, status: 'SENT' } });

  await prisma.$transaction([
    prisma.auditEvent.create({
      data: {
        actorId: actor.id,
        action: 'MAIL_TASK_DELETED',
        entityType: 'mail_task',
        entityId: task.id,
        metadataJson: {
          mailTaskName: task.name,
          eventId: task.eventId,
          eventName: task.event.name,
          batches: task._count.batches,
          recipients: task._count.deliveries,
          sentBatches,
          sentRecipients,
        },
      },
    }),
    prisma.activityEvent.create({
      data: {
        eventId: task.eventId,
        actorId: actor.id,
        action: 'MAIL_TASK_DELETED',
        status: 'INFO',
        emailCount: sentRecipients,
        detail: `${actor.name ?? actor.email} deleted mail task "${task.name}" (${sentBatches} of ${task._count.batches} sets had been sent)`,
      },
    }),
    prisma.mailTask.delete({ where: { id: task.id } }),
  ]);

  return {
    mailTaskId: task.id,
    mailTaskName: task.name,
    eventId: task.eventId,
    sentBatches,
    sentRecipients,
  };
}

/** A url-safe id in the shape the schema's own default produces. */
function createId(): string {
  return `mt${crypto.randomUUID().replaceAll('-', '')}`;
}
