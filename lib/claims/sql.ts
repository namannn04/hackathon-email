export function buildAtomicClaimSql(batchCount: number): string {
  if (!Number.isInteger(batchCount) || batchCount < 1 || batchCount > 3) {
    throw new Error('Atomic claims require between 1 and 3 batches.');
  }
  const placeholders = Array.from({ length: batchCount }, () => '?').join(',');
  return `UPDATE batches
     SET status = 'CLAIMED', claimed_by_id = ?, claimed_at = ?, updated_at = ?
     WHERE campaign_id = ?
       AND id IN (${placeholders})
       AND status = 'AVAILABLE'
       AND EXISTS (
         SELECT 1 FROM campaigns
         WHERE campaigns.id = batches.campaign_id AND campaigns.status = 'ACTIVE'
       )
       AND (
         ? = 'ORGANIZER'
         OR EXISTS (
           SELECT 1 FROM campaign_members
           WHERE campaign_members.campaign_id = batches.campaign_id
             AND campaign_members.user_id = ?
         )
       )
       AND (
         SELECT COUNT(*) FROM batches AS selected
         WHERE selected.campaign_id = ?
           AND selected.id IN (${placeholders})
           AND selected.status = 'AVAILABLE'
       ) = ?
       AND (
         SELECT COUNT(*) FROM batches AS active
         WHERE active.claimed_by_id = ?
           AND active.status IN ('CLAIMED', 'SENDING', 'FAILED')
       ) + ? <= 3
     RETURNING id, campaign_id AS campaignId, number, recipient_count AS recipientCount,
               sent_count AS sentCount, failed_count AS failedCount, status,
               claimed_by_id AS claimedById, claimed_at AS claimedAt,
               gmail_account_id AS gmailAccountId, created_at AS createdAt, updated_at AS updatedAt`;
}
