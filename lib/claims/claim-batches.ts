import { getD1 } from '@/db';
import type { Batch, User } from '@/db/schema';
import { auditStatement } from '@/lib/audit';
import { HttpError } from '@/lib/http';
import { buildAtomicClaimSql } from './sql';

export async function claimBatches(campaignId: string, requestedIds: string[], user: User) {
  const batchIds = [...new Set(requestedIds)];
  if (batchIds.length === 0 || batchIds.length > 3) {
    throw new HttpError(400, 'Select between 1 and 3 batches.', 'INVALID_BATCH_SELECTION');
  }

  const d1 = getD1();
  const now = new Date().toISOString();
  const statement = d1.prepare(buildAtomicClaimSql(batchIds.length));

  const result = await statement
    .bind(
      user.id,
      now,
      now,
      campaignId,
      ...batchIds,
      user.role,
      user.id,
      campaignId,
      ...batchIds,
      batchIds.length,
      user.id,
      batchIds.length,
    )
    .all<Batch>();

  if (result.results.length !== batchIds.length) {
    throw new HttpError(
      409,
      'Those batches could not all be claimed. Refresh and choose available batches again.',
      'BATCH_CLAIM_CONFLICT',
    );
  }

  const recipientPlaceholders = batchIds.map(() => '?').join(',');
  await d1.batch([
    d1
      .prepare(
        `UPDATE recipients SET status = 'RESERVED', updated_at = ?
         WHERE batch_id IN (${recipientPlaceholders}) AND status = 'PENDING'`,
      )
      .bind(now, ...batchIds),
    auditStatement({
      actorId: user.id,
      action: 'BATCHES_CLAIMED',
      entityType: 'campaign',
      entityId: campaignId,
      metadata: { batchIds },
    }),
  ]);

  return result.results.sort((a, b) => a.number - b.number);
}

export async function assignGmailAccount(batchId: string, gmailAccountId: string, user: User) {
  const d1 = getD1();
  const now = new Date().toISOString();

  try {
    const batch = await d1
      .prepare(
        `UPDATE batches
         SET gmail_account_id = ?, updated_at = ?
         WHERE id = ?
           AND claimed_by_id = ?
           AND status IN ('CLAIMED', 'FAILED')
           AND EXISTS (
             SELECT 1 FROM gmail_accounts
             WHERE gmail_accounts.id = ?
               AND gmail_accounts.user_id = ?
               AND gmail_accounts.revoked_at IS NULL
           )
         RETURNING id, campaign_id AS campaignId, number, recipient_count AS recipientCount,
                   sent_count AS sentCount, failed_count AS failedCount, status,
                   claimed_by_id AS claimedById, claimed_at AS claimedAt,
                   gmail_account_id AS gmailAccountId, created_at AS createdAt, updated_at AS updatedAt`,
      )
      .bind(gmailAccountId, now, batchId, user.id, gmailAccountId, user.id)
      .first<Batch>();

    if (!batch) {
      throw new HttpError(
        404,
        'That batch or Gmail account is not available to you.',
        'ASSIGNMENT_NOT_ALLOWED',
      );
    }
    await auditStatement({
      actorId: user.id,
      action: 'GMAIL_ACCOUNT_ASSIGNED',
      entityType: 'batch',
      entityId: batchId,
      metadata: { gmailAccountId },
    }).run();
    return batch;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      throw new HttpError(
        409,
        'That Gmail account is already assigned to another active batch.',
        'GMAIL_ACCOUNT_IN_USE',
      );
    }
    throw error;
  }
}
