import { writeAudit } from '@/lib/audit';
import { getPrisma } from '@/lib/db/prisma';
import { isValidEmail, normalizeEmail } from '@/lib/imports/parser';
import { isTestUnsubscribeId, readUnsubscribeToken } from './token';

export type UnsubscribeOutcome = {
  /** True once the request was well formed, whether or not the address was on a list. */
  accepted: boolean;
  /** Present only when the token itself is unusable. */
  error?: string;
};

/** What a link points at, so the page can speak to the right situation. */
export type UnsubscribeTarget =
  | { kind: 'task'; eventName: string }
  | { kind: 'test' }
  | { kind: 'unknown' };

/**
 * Suppresses an address that asked to stop receiving mail.
 *
 * Two deliberate choices:
 *
 * 1. The address must already be a recipient of the token's event. Otherwise an
 *    unsubscribe link — which every recipient of a set holds — could be used to
 *    block arbitrary strangers from future event mail.
 * 2. The answer never says whether the address was on the list. A page that
 *    reported "not found" would turn this into a membership oracle for anyone
 *    holding a link, so a valid request always reads the same.
 *
 * Suppression is global (`Suppression.normalizedEmail` is unique) and both
 * mail-task creation and every send filter against it. That is what makes this
 * survive a CSV re-import: the spreadsheet is never edited, the address is
 * simply skipped from then on.
 */
export async function unsubscribeByToken(token: string | null, emailValue: string): Promise<UnsubscribeOutcome> {
  const mailTaskId = await readUnsubscribeToken(token);
  if (!mailTaskId) {
    return { accepted: false, error: 'This unsubscribe link is not valid. Reply to the email instead and we will remove you.' };
  }
  if (isTestUnsubscribeId(mailTaskId)) {
    return { accepted: false, error: 'That was a test message, so there is no mailing list behind it.' };
  }
  if (!isValidEmail(emailValue)) {
    return { accepted: false, error: 'Enter a valid email address.' };
  }

  const prisma = getPrisma();
  const normalizedEmail = normalizeEmail(emailValue);
  const task = await prisma.mailTask.findUnique({
    where: { id: mailTaskId },
    select: { id: true, eventId: true, event: { select: { name: true } } },
  });
  if (!task) {
    return { accepted: false, error: 'This unsubscribe link is no longer valid.' };
  }

  const recipient = await prisma.eventRecipient.findFirst({
    where: { eventId: task.eventId, normalizedEmail },
    select: { id: true },
  });
  // Nothing to do, and nothing to reveal.
  if (!recipient) return { accepted: true };

  const suppression = await prisma.suppression.upsert({
    where: { normalizedEmail },
    create: { normalizedEmail, reason: `Unsubscribed from ${task.event.name}` },
    update: {},
  });

  // Anything still queued for this address stops now, rather than at the next
  // send, so an unsubscribe taken mid-campaign is honoured immediately.
  await prisma.mailTaskRecipient.updateMany({
    where: { recipientId: recipient.id, status: { in: ['PENDING', 'RESERVED', 'FAILED'] } },
    data: { status: 'SUPPRESSED' },
  });

  await prisma.activityEvent.create({
    data: {
      eventId: task.eventId,
      mailTaskId: task.id,
      action: 'RECIPIENT_UNSUBSCRIBED',
      status: 'SUCCESS',
      detail: `${normalizedEmail} unsubscribed and will be skipped by future mail tasks`,
    },
  });
  await writeAudit({
    actorId: null,
    action: 'RECIPIENT_UNSUBSCRIBED',
    entityType: 'suppression',
    entityId: suppression.id,
    metadata: { email: normalizedEmail, mailTaskId: task.id, eventId: task.eventId },
  });

  return { accepted: true };
}

/** What the link points at, so the page shows the right screen. */
export async function describeUnsubscribeToken(token: string | null): Promise<UnsubscribeTarget> {
  const mailTaskId = await readUnsubscribeToken(token);
  if (!mailTaskId) return { kind: 'unknown' };
  if (isTestUnsubscribeId(mailTaskId)) return { kind: 'test' };
  const task = await getPrisma().mailTask.findUnique({
    where: { id: mailTaskId },
    select: { event: { select: { name: true } } },
  });
  return task ? { kind: 'task', eventName: task.event.name } : { kind: 'unknown' };
}
