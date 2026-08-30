import type { User } from '@/generated/prisma/client';
import { getPrisma } from '@/lib/db/prisma';
import { usesMockTransport } from '@/lib/gmail/transport';

export async function getOverview(user: User, requestedEventId?: string | null, requestedMailTaskId?: string | null) {
  const prisma = getPrisma();
  const eventRows = await prisma.event.findMany({
    where: {
      status: { in: ['ACTIVE', 'PAUSED', 'COMPLETED'] },
      ...(user.role === 'ORGANIZER' ? {} : { members: { some: { userId: user.id } } }),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { recipients: true, members: true } },
      mailTasks: {
        where: { status: { not: 'ARCHIVED' } },
        orderBy: { createdAt: 'desc' },
        include: { batches: { orderBy: { number: 'asc' }, select: { id: true, number: true, recipientCount: true, sentCount: true, failedCount: true, status: true } } },
      },
    },
  });
  const events = eventRows.map((event) => ({
    id: event.id,
    name: event.name,
    status: event.status,
    recipientCount: event._count.recipients,
    memberCount: event._count.members,
    mailTasks: event.mailTasks.map((task) => ({
      id: task.id,
      eventId: event.id,
      name: task.name,
      toEmail: task.toEmail,
      subject: task.subject,
      batchSize: task.batchSize,
      status: task.status,
      totalBatches: task.batches.length,
      sentBatches: task.batches.filter((batch) => batch.status === 'SENT').length,
      totalRecipients: task.batches.reduce((sum, batch) => sum + batch.recipientCount, 0),
      sentRecipients: task.batches.reduce((sum, batch) => sum + batch.sentCount, 0),
      batches: task.batches,
      createdAt: task.createdAt.toISOString(),
    })),
    createdAt: event.createdAt.toISOString(),
  }));
  const event = events.find((item) => item.id === requestedEventId) ?? events[0] ?? null;
  const mailTask = event?.mailTasks.find((item) => item.id === requestedMailTaskId) ?? event?.mailTasks.find((item) => item.status === 'ACTIVE') ?? event?.mailTasks[0] ?? null;

  const [gmailAccounts, sentHistory, activities, suppressions, invites] = await Promise.all([
    prisma.gmailAccount.findMany({ where: { userId: user.id, revokedAt: null }, orderBy: { createdAt: 'asc' } }),
    prisma.batch.findMany({
      where: { sentById: user.id, status: 'SENT' },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { mailTask: { include: { event: { select: { id: true, name: true } } } }, gmailAccount: { select: { email: true } } },
    }),
    user.role === 'ORGANIZER' && event
      ? prisma.activityEvent.findMany({
          where: { eventId: event.id },
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: { actor: { select: { email: true, name: true } }, mailTask: { select: { id: true, name: true } }, batch: { select: { number: true } } },
        })
      : Promise.resolve([]),
    user.role === 'ORGANIZER' ? prisma.suppression.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }) : Promise.resolve([]),
    user.role === 'ORGANIZER'
      ? prisma.eventInvite.findMany({ where: { revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, take: 100, include: { event: { select: { name: true } } } })
      : Promise.resolve([]),
  ]);

  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    events,
    event,
    mailTask,
    availableBatches: mailTask?.batches.filter((batch) => batch.status === 'AVAILABLE' || batch.status === 'FAILED') ?? [],
    gmailAccounts: gmailAccounts.map((account) => ({ id: account.id, email: account.email, displayName: account.displayName, tokenExpiresAt: account.tokenExpiresAt.toISOString() })),
    sentHistory: sentHistory.map((batch) => ({
      id: batch.id,
      number: batch.number,
      recipientCount: batch.recipientCount,
      sentCount: batch.sentCount,
      eventId: batch.mailTask.event.id,
      eventName: batch.mailTask.event.name,
      mailTaskId: batch.mailTask.id,
      mailTaskName: batch.mailTask.name,
      gmailEmail: batch.gmailAccount?.email ?? null,
      sentAt: batch.updatedAt.toISOString(),
    })),
    activities: activities.map((activity) => ({
      id: activity.id,
      action: activity.action,
      status: activity.status,
      emailCount: activity.emailCount,
      detail: activity.detail,
      actorEmail: activity.actor?.email ?? null,
      actorName: activity.actor?.name ?? null,
      mailTaskId: activity.mailTask?.id ?? null,
      mailTaskName: activity.mailTask?.name ?? null,
      batchNumber: activity.batch?.number ?? null,
      createdAt: activity.createdAt.toISOString(),
    })),
    suppressions: suppressions.map((item) => ({ id: item.id, email: item.normalizedEmail, reason: item.reason, createdAt: item.createdAt.toISOString() })),
    invites: invites.map((invite) => ({ id: invite.id, eventId: invite.eventId, eventName: invite.event.name, expiresAt: invite.expiresAt.toISOString(), createdAt: invite.createdAt.toISOString() })),
    gmailConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI && process.env.TOKEN_ENCRYPTION_KEY),
    mockTransport: usesMockTransport(),
  };
}
