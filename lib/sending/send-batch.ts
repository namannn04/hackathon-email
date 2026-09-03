import type { User } from '@/generated/prisma/client';
import { writeAudit } from '@/lib/audit';
import { getPrisma } from '@/lib/db/prisma';
import { renderPreviewDocument } from '@/lib/email-html/document';
import { GmailApiError, sendRawGmailMessage } from '@/lib/gmail/client';
import { usesMockTransport } from '@/lib/gmail/transport';
import { gmailAccountHealth } from '@/lib/gmail/scopes';
import { HttpError } from '@/lib/http';
import { buildUnsubscribeUrl, createUnsubscribeToken } from '@/lib/unsubscribe/token';
import { maxBccForToCount, readToAddresses } from './addresses';
import { buildGmailMime } from './mime';

export async function getBatchPreview(batchId: string, user: User) {
  const batch = await getAccessibleBatch(batchId, user);
  const recipients = await loadSendableRecipients(batchId, false);
  return {
    batchId: batch.id,
    batchNumber: batch.number,
    status: batch.status,
    eventId: batch.mailTask.event.id,
    eventName: batch.mailTask.event.name,
    mailTaskId: batch.mailTask.id,
    mailTaskName: batch.mailTask.name,
    to: batch.mailTask.toEmail,
    bcc: recipients,
    subject: batch.mailTask.subject,
    bodyText: batch.mailTask.bodyText,
    bodyHtml: batch.mailTask.bodyHtml,
    recipientCount: recipients.length,
  };
}

/**
 * The rendered HTML part, byte-for-byte what the MIME text/html section will
 * carry, with each cid: reference resolved from the stored inline image so a
 * browser shows what a mail client shows. Served as its own document so the
 * image bytes never bloat the preview JSON.
 */
export async function getBatchPreviewDocument(batchId: string, user: User) {
  const batch = await getAccessibleBatch(batchId, user);
  const images = await getPrisma().mailTaskImage.findMany({
    where: { mailTaskId: batch.mailTask.id },
    orderBy: { position: 'asc' },
    select: { contentId: true, mimeType: true, dataBase64: true },
  });
  return renderPreviewDocument({
    bodyHtml: batch.mailTask.bodyHtml,
    subject: batch.mailTask.subject,
    images,
  });
}

export async function sendBatch(batchId: string, gmailAccountId: string, user: User, origin: string) {
  const prisma = getPrisma();
  const batch = await getAccessibleBatch(batchId, user);
  if (batch.status === 'SENT') return { batchId, status: 'SENT', alreadySent: true };
  const gmail = await prisma.gmailAccount.findFirst({
    where: { id: gmailAccountId, userId: user.id, revokedAt: null },
  });
  if (!gmail) throw new HttpError(404, 'Connect and choose one of your Gmail accounts.', 'GMAIL_ACCOUNT_REQUIRED');
  if (!usesMockTransport()) {
    const health = gmailAccountHealth(gmail);
    if (!health.canSend) throw new HttpError(409, health.message, 'GMAIL_RECONNECT_REQUIRED');
  }

  const deterministicMessageId = `<relay.${batchId}@relay.internal>`;
  const send = await prisma.send.upsert({
    where: { batchId },
    create: { batchId, idempotencyKey: `batch:${batchId}:v1`, deterministicMessageId },
    update: {},
  });
  if (send.status === 'SENT') return { batchId, status: 'SENT', providerMessageId: send.providerMessageId, alreadySent: true };

  const now = new Date();
  const leaseOwner = crypto.randomUUID();
  const lease = await prisma.send.updateMany({
    where: {
      id: send.id,
      OR: [
        { status: 'QUEUED' },
        { status: 'RETRYABLE_FAILED', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { status: 'PERMANENT_FAILED' },
        { status: 'DISPATCHING', leaseExpiresAt: { lt: now } },
      ],
    },
    data: {
      status: 'DISPATCHING',
      leaseOwner,
      leaseExpiresAt: new Date(now.getTime() + 2 * 60_000),
      attemptCount: { increment: 1 },
    },
  });
  if (!lease.count) throw new HttpError(409, 'This set is already being sent or is waiting before a retry.', 'SEND_IN_PROGRESS');
  const leasedSend = await prisma.send.findUniqueOrThrow({ where: { id: send.id } });
  try {
    await prisma.batch.update({
      where: { id: batchId },
      data: { status: 'SENDING', sentById: user.id, gmailAccountId },
    });
    const recipients = await loadSendableRecipients(batchId, true);
    if (!recipients.length) throw new HttpError(409, 'This set has no sendable recipients.', 'NO_SENDABLE_RECIPIENTS');
    const toCount = readToAddresses(batch.mailTask.toEmail).length;
    const maxBcc = maxBccForToCount(toCount);
    if (recipients.length > maxBcc) {
      throw new HttpError(409, `A set cannot exceed ${maxBcc} BCC recipients, because this task's ${toCount} To ${toCount === 1 ? 'address counts' : 'addresses count'} toward Gmail's 500-recipient message limit.`, 'GMAIL_RECIPIENT_LIMIT');
    }

    let providerMessageId: string;
    if (usesMockTransport()) providerMessageId = `mock-${send.id}`;
    else {
      // Loaded only on the real send path; the preview never needs the bytes.
      const images = await prisma.mailTaskImage.findMany({
        where: { mailTaskId: batch.mailTask.id },
        orderBy: { position: 'asc' },
        select: { contentId: true, filename: true, mimeType: true, dataBase64: true },
      });
      const raw = buildGmailMime({
        sender: gmail.email,
        to: batch.mailTask.toEmail,
        recipients,
        subject: batch.mailTask.subject,
        bodyText: batch.mailTask.bodyText,
        bodyHtml: batch.mailTask.bodyHtml,
        messageId: deterministicMessageId,
        batchId,
        images,
        unsubscribeUrl: buildUnsubscribeUrl(origin, await createUnsubscribeToken(batch.mailTask.id)),
      });
      providerMessageId = (await sendRawGmailMessage({ accountId: gmail.id, userId: user.id, raw })).id;
    }

    await finalizeSent({
      batchId,
      sendId: send.id,
      leaseOwner,
      providerMessageId,
      user,
      eventId: batch.mailTask.event.id,
      mailTaskId: batch.mailTask.id,
      batchNumber: batch.number,
      recipientCount: recipients.length,
      senderEmail: gmail.email,
    });
    return { batchId, status: 'SENT', providerMessageId, sentCount: recipients.length };
  } catch (error) {
    await markSendFailed({
      batchId,
      sendId: send.id,
      leaseOwner,
      attemptCount: leasedSend.attemptCount,
      eventId: batch.mailTask.event.id,
      mailTaskId: batch.mailTask.id,
      batchNumber: batch.number,
      actorId: user.id,
      error,
    });
    throw error;
  }
}

async function getAccessibleBatch(batchId: string, user: User) {
  const batch = await getPrisma().batch.findFirst({
    where: {
      id: batchId,
      mailTask: {
        status: 'ACTIVE',
        event: {
          status: 'ACTIVE',
          ...(user.role === 'ORGANIZER' ? {} : { members: { some: { userId: user.id } } }),
        },
      },
    },
    include: { mailTask: { include: { event: true } } },
  });
  if (!batch) throw new HttpError(404, 'That set is not available to you.', 'BATCH_NOT_FOUND');
  return batch;
}

async function loadSendableRecipients(batchId: string, applySuppressions: boolean) {
  const prisma = getPrisma();
  const rows = await prisma.mailTaskRecipient.findMany({
    where: { batchId, status: { in: ['PENDING', 'RESERVED', 'FAILED'] } },
    include: { recipient: { select: { email: true, normalizedEmail: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const suppressions = new Set((await prisma.suppression.findMany({
    where: { normalizedEmail: { in: rows.map((row) => row.recipient.normalizedEmail) } },
    select: { normalizedEmail: true },
  })).map((item) => item.normalizedEmail));
  if (applySuppressions && suppressions.size) {
    await prisma.mailTaskRecipient.updateMany({
      where: { id: { in: rows.filter((row) => suppressions.has(row.recipient.normalizedEmail)).map((row) => row.id) } },
      data: { status: 'SUPPRESSED' },
    });
  }
  return rows.filter((row) => !suppressions.has(row.recipient.normalizedEmail)).map((row) => row.recipient.email);
}

async function finalizeSent(input: {
  batchId: string; sendId: string; leaseOwner: string; providerMessageId: string; user: User;
  eventId: string; mailTaskId: string; batchNumber: number; recipientCount: number; senderEmail: string;
}) {
  const prisma = getPrisma();
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const lease = await tx.send.updateMany({
      where: { id: input.sendId, leaseOwner: input.leaseOwner, status: 'DISPATCHING' },
      data: { status: 'SENT', providerMessageId: input.providerMessageId, sentAt: now, leaseOwner: null, leaseExpiresAt: null, lastErrorCode: null, lastErrorMessage: null, nextAttemptAt: null },
    });
    if (!lease.count) {
      throw new HttpError(409, 'The send lease expired before completion. Retry safely to reconcile the Gmail message.', 'SEND_LEASE_LOST');
    }
    await tx.batch.update({
      where: { id: input.batchId },
      data: { status: 'SENT', recipientCount: input.recipientCount, sentCount: input.recipientCount, failedCount: 0, sentById: input.user.id },
    });
    await tx.mailTaskRecipient.updateMany({
      where: { batchId: input.batchId, status: { in: ['PENDING', 'RESERVED', 'FAILED'] } },
      data: { status: 'SENT', sentAt: now, lastError: null },
    });
    await tx.activityEvent.create({
      data: {
        eventId: input.eventId,
        mailTaskId: input.mailTaskId,
        batchId: input.batchId,
        actorId: input.user.id,
        action: 'SET_SENT',
        status: 'SUCCESS',
        emailCount: input.recipientCount,
        detail: `${input.user.name ?? input.user.email} sent set #${input.batchNumber} (${input.recipientCount} BCC) from ${input.senderEmail}`,
      },
    });
  });
  const incomplete = await prisma.batch.count({ where: { mailTaskId: input.mailTaskId, status: { not: 'SENT' } } });
  if (!incomplete) await prisma.mailTask.update({ where: { id: input.mailTaskId }, data: { status: 'COMPLETED' } });
  await writeAudit({ actorId: input.user.id, action: 'SET_SENT', entityType: 'batch', entityId: input.batchId, metadata: { providerMessageId: input.providerMessageId, recipients: input.recipientCount } });
}

async function markSendFailed(input: {
  batchId: string; sendId: string; leaseOwner: string; attemptCount: number; eventId: string;
  mailTaskId: string; batchNumber: number; actorId: string; error: unknown;
}) {
  const prisma = getPrisma();
  const retryable = input.error instanceof GmailApiError ? input.error.retryable : false;
  const code = input.error instanceof GmailApiError || input.error instanceof HttpError ? input.error.code : 'UNEXPECTED_SEND_ERROR';
  const message = input.error instanceof Error ? input.error.message.slice(0, 500) : 'Unexpected send error';
  const retryDelay = Math.min(15 * 60_000, 15_000 * 2 ** Math.min(input.attemptCount - 1, 6));
  await prisma.$transaction(async (tx) => {
    const lease = await tx.send.updateMany({
      where: { id: input.sendId, leaseOwner: input.leaseOwner, status: 'DISPATCHING' },
      data: {
        status: retryable ? 'RETRYABLE_FAILED' : 'PERMANENT_FAILED',
        lastErrorCode: code,
        lastErrorMessage: message,
        nextAttemptAt: retryable ? new Date(Date.now() + retryDelay + Math.floor(Math.random() * 5_000)) : null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (!lease.count) return;
    await tx.batch.update({ where: { id: input.batchId }, data: { status: 'FAILED', gmailAccountId: null } });
    await tx.activityEvent.create({
      data: { eventId: input.eventId, mailTaskId: input.mailTaskId, batchId: input.batchId, actorId: input.actorId, action: 'SET_SEND_FAILED', status: 'FAILURE', detail: `Set #${input.batchNumber}: ${message}` },
    });
  });
}
