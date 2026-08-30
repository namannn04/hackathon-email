import { getD1 } from '@/db';
import type { User } from '@/db/schema';
import { auditStatement } from '@/lib/audit';
import { findMessageByRfc822Id, GmailApiError, sendRawGmailMessage } from '@/lib/gmail/client';
import { HttpError } from '@/lib/http';
import { usesMockTransport } from '@/lib/gmail/transport';
import { buildGmailMime } from './mime';

type SendContext = {
  batchId: string;
  campaignId: string;
  batchNumber: number;
  batchStatus: string;
  recipientCount: number;
  gmailAccountId: string | null;
  senderEmail: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string;
};

type SendLease = {
  id: string;
  status: string;
  attemptCount: number;
  deterministicMessageId: string;
  providerMessageId: string | null;
};

export async function sendBatch(batchId: string, user: User) {
  const d1 = getD1();
  const context = await d1
    .prepare(
      `SELECT batches.id AS batchId, batches.campaign_id AS campaignId,
              batches.number AS batchNumber, batches.status AS batchStatus,
              batches.recipient_count AS recipientCount,
              batches.gmail_account_id AS gmailAccountId,
              gmail_accounts.email AS senderEmail,
              campaigns.subject, campaigns.body_text AS bodyText, campaigns.body_html AS bodyHtml
       FROM batches
       JOIN campaigns ON campaigns.id = batches.campaign_id
       LEFT JOIN gmail_accounts ON gmail_accounts.id = batches.gmail_account_id
         AND gmail_accounts.user_id = batches.claimed_by_id
         AND gmail_accounts.revoked_at IS NULL
       WHERE batches.id = ? AND batches.claimed_by_id = ?`,
    )
    .bind(batchId, user.id)
    .first<SendContext>();
  if (!context) throw new HttpError(404, 'That claimed batch was not found.', 'BATCH_NOT_FOUND');
  if (context.batchStatus === 'SENT') {
    return { batchId, status: 'SENT', alreadySent: true };
  }
  if (!['CLAIMED', 'FAILED', 'SENDING'].includes(context.batchStatus)) {
    throw new HttpError(409, 'This batch is not ready to send.', 'BATCH_NOT_SENDABLE');
  }
  if (!context.gmailAccountId || !context.senderEmail) {
    throw new HttpError(409, 'Assign one of your Gmail accounts before sending.', 'GMAIL_ACCOUNT_REQUIRED');
  }

  const sendId = crypto.randomUUID();
  const idempotencyKey = `batch:${batchId}:v1`;
  const messageId = `<relay.${batchId}@relay.internal>`;
  const now = new Date();
  await d1
    .prepare(
      `INSERT INTO sends
       (id, batch_id, idempotency_key, deterministic_message_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'QUEUED', ?, ?)
       ON CONFLICT(batch_id) DO NOTHING`,
    )
    .bind(sendId, batchId, idempotencyKey, messageId, now.toISOString(), now.toISOString())
    .run();

  const leaseOwner = crypto.randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + 2 * 60_000).toISOString();
  const lease = await d1
    .prepare(
      `UPDATE sends
       SET status = 'DISPATCHING', lease_owner = ?, lease_expires_at = ?,
           attempt_count = attempt_count + 1, updated_at = ?
       WHERE batch_id = ?
         AND (
           status = 'QUEUED'
           OR (status = 'RETRYABLE_FAILED' AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
           OR status = 'PERMANENT_FAILED'
           OR (status = 'DISPATCHING' AND lease_expires_at < ?)
         )
       RETURNING id, status, attempt_count AS attemptCount,
                 deterministic_message_id AS deterministicMessageId,
                 provider_message_id AS providerMessageId`,
    )
    .bind(leaseOwner, leaseExpiresAt, now.toISOString(), batchId, now.toISOString(), now.toISOString())
    .first<SendLease>();

  if (!lease) {
    const existing = await d1
      .prepare('SELECT status, provider_message_id AS providerMessageId FROM sends WHERE batch_id = ?')
      .bind(batchId)
      .first<{ status: string; providerMessageId: string | null }>();
    if (existing?.status === 'SENT') {
      return { batchId, status: 'SENT', providerMessageId: existing.providerMessageId, alreadySent: true };
    }
    throw new HttpError(409, 'This batch is already being sent or is waiting before a retry.', 'SEND_IN_PROGRESS');
  }

  await d1
    .prepare(`UPDATE batches SET status = 'SENDING', updated_at = ? WHERE id = ? AND claimed_by_id = ?`)
    .bind(now.toISOString(), batchId, user.id)
    .run();

  try {
    const recipients = await loadSendableRecipients(batchId);
    if (recipients.length === 0) {
      throw new HttpError(409, 'This batch has no sendable recipients.', 'NO_SENDABLE_RECIPIENTS');
    }
    if (recipients.length > 500) {
      throw new HttpError(409, 'Gmail messages cannot exceed 500 recipients.', 'GMAIL_RECIPIENT_LIMIT');
    }

    let providerMessageId: string | null = null;
    if (lease.attemptCount > 1 && !usesMockTransport()) {
      const existingMessage = await findMessageByRfc822Id({
        accountId: context.gmailAccountId,
        userId: user.id,
        messageId: lease.deterministicMessageId,
      });
      providerMessageId = existingMessage?.id ?? null;
    }

    if (!providerMessageId) {
      if (usesMockTransport()) {
        providerMessageId = `mock-${lease.id}`;
      } else {
        const raw = buildGmailMime({
          sender: context.senderEmail,
          recipients,
          subject: context.subject,
          bodyText: context.bodyText,
          bodyHtml: context.bodyHtml,
          messageId: lease.deterministicMessageId,
          batchId,
        });
        const sent = await sendRawGmailMessage({
          accountId: context.gmailAccountId,
          userId: user.id,
          raw,
        });
        providerMessageId = sent.id;
      }
    }

    await finalizeSent({
      batchId,
      sendId: lease.id,
      leaseOwner,
      providerMessageId,
      recipientCount: recipients.length,
      userId: user.id,
    });
    return { batchId, status: 'SENT', providerMessageId, sentCount: recipients.length };
  } catch (error) {
    await markSendFailed({ batchId, sendId: lease.id, leaseOwner, attemptCount: lease.attemptCount, error });
    throw error;
  }
}

async function loadSendableRecipients(batchId: string): Promise<string[]> {
  const d1 = getD1();
  await d1
    .prepare(
      `UPDATE recipients
       SET status = 'SUPPRESSED', updated_at = ?
       WHERE batch_id = ?
         AND status IN ('PENDING', 'RESERVED', 'FAILED')
         AND normalized_email IN (SELECT normalized_email FROM suppressions)`,
    )
    .bind(new Date().toISOString(), batchId)
    .run();
  const result = await d1
    .prepare(
      `SELECT recipients.email
       FROM recipients
       LEFT JOIN suppressions ON suppressions.normalized_email = recipients.normalized_email
       WHERE recipients.batch_id = ?
         AND recipients.status IN ('PENDING', 'RESERVED', 'FAILED')
         AND suppressions.id IS NULL
       ORDER BY recipients.created_at, recipients.id`,
    )
    .bind(batchId)
    .all<{ email: string }>();
  return result.results.map((row) => row.email);
}

async function finalizeSent(input: {
  batchId: string;
  sendId: string;
  leaseOwner: string;
  providerMessageId: string;
  recipientCount: number;
  userId: string;
}) {
  const d1 = getD1();
  const now = new Date().toISOString();
  await d1.batch([
    d1
      .prepare(
        `UPDATE sends
         SET status = 'SENT', provider_message_id = ?, sent_at = ?,
             lease_owner = NULL, lease_expires_at = NULL, last_error_code = NULL,
             last_error_message = NULL, next_attempt_at = NULL, updated_at = ?
         WHERE id = ? AND lease_owner = ?`,
      )
      .bind(input.providerMessageId, now, now, input.sendId, input.leaseOwner),
    d1
      .prepare(
        `UPDATE batches
         SET status = 'SENT', recipient_count = ?, sent_count = ?, failed_count = 0, updated_at = ?
         WHERE id = ? AND claimed_by_id = ?`,
      )
      .bind(input.recipientCount, input.recipientCount, now, input.batchId, input.userId),
    d1
      .prepare(
        `UPDATE recipients
         SET status = 'SENT', sent_at = ?, last_error = NULL, updated_at = ?
         WHERE batch_id = ? AND status IN ('PENDING', 'RESERVED', 'FAILED')
           AND normalized_email NOT IN (SELECT normalized_email FROM suppressions)`,
      )
      .bind(now, now, input.batchId),
    d1
      .prepare(
        `UPDATE campaigns
         SET status = 'COMPLETED', updated_at = ?
         WHERE id = (SELECT campaign_id FROM batches WHERE id = ?)
           AND NOT EXISTS (
             SELECT 1 FROM batches AS incomplete
             WHERE incomplete.campaign_id = campaigns.id AND incomplete.status != 'SENT'
           )`,
      )
      .bind(now, input.batchId),
    auditStatement({
      actorId: input.userId,
      action: 'BATCH_SENT',
      entityType: 'batch',
      entityId: input.batchId,
      metadata: { providerMessageId: input.providerMessageId, recipients: input.recipientCount },
    }),
  ]);
}

async function markSendFailed(input: {
  batchId: string;
  sendId: string;
  leaseOwner: string;
  attemptCount: number;
  error: unknown;
}) {
  const d1 = getD1();
  const retryable =
    input.error instanceof GmailApiError
      ? input.error.retryable
      : input.error instanceof HttpError && input.error.code === 'GMAIL_RECONNECT_REQUIRED';
  const code =
    input.error instanceof GmailApiError || input.error instanceof HttpError
      ? input.error.code
      : 'UNEXPECTED_SEND_ERROR';
  const message = input.error instanceof Error ? input.error.message.slice(0, 500) : 'Unexpected send error';
  const now = new Date();
  const retryDelay = Math.min(15 * 60_000, 15_000 * 2 ** Math.min(input.attemptCount - 1, 6));
  const nextAttemptAt = retryable
    ? new Date(now.getTime() + retryDelay + Math.floor(Math.random() * 5_000)).toISOString()
    : null;
  await d1.batch([
    d1
      .prepare(
        `UPDATE sends
         SET status = ?, last_error_code = ?, last_error_message = ?, next_attempt_at = ?,
             lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
         WHERE id = ? AND lease_owner = ?`,
      )
      .bind(
        retryable ? 'RETRYABLE_FAILED' : 'PERMANENT_FAILED',
        code,
        message,
        nextAttemptAt,
        now.toISOString(),
        input.sendId,
        input.leaseOwner,
      ),
    d1
      .prepare(`UPDATE batches SET status = 'FAILED', updated_at = ? WHERE id = ?`)
      .bind(now.toISOString(), input.batchId),
  ]);
}
