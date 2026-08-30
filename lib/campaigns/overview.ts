import { getD1 } from '@/db';
import type { User } from '@/db/schema';
import { usesMockTransport } from '@/lib/gmail/transport';

type CampaignSummary = {
  id: string;
  name: string;
  subject: string;
  status: string;
  batchSize: number;
  totalRecipients: number;
  sentRecipients: number;
  availableBatches: number;
  totalBatches: number;
};

export async function getOverview(user: User, requestedCampaignId?: string | null) {
  const d1 = getD1();
  const campaignRows = await d1
    .prepare(
      `WITH recipient_stats AS (
         SELECT campaign_id,
                SUM(CASE WHEN status != 'SUPPRESSED' THEN 1 ELSE 0 END) AS total_recipients,
                SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) AS sent_recipients
         FROM recipients GROUP BY campaign_id
       ),
       batch_stats AS (
         SELECT campaign_id,
                SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) AS available_batches,
                COUNT(*) AS total_batches
         FROM batches GROUP BY campaign_id
       )
       SELECT campaigns.id, campaigns.name, campaigns.subject, campaigns.status,
              campaigns.batch_size AS batchSize,
              COALESCE(recipient_stats.total_recipients, 0) AS totalRecipients,
              COALESCE(recipient_stats.sent_recipients, 0) AS sentRecipients,
              COALESCE(batch_stats.available_batches, 0) AS availableBatches,
              COALESCE(batch_stats.total_batches, 0) AS totalBatches
       FROM campaigns
       LEFT JOIN recipient_stats ON recipient_stats.campaign_id = campaigns.id
       LEFT JOIN batch_stats ON batch_stats.campaign_id = campaigns.id
       WHERE campaigns.status IN ('ACTIVE', 'PAUSED', 'COMPLETED')
       ORDER BY campaigns.created_at DESC`,
    )
    .all<CampaignSummary>();
  const campaigns = campaignRows.results;
  const campaign =
    campaigns.find((item) => item.id === requestedCampaignId) ??
    campaigns.find((item) => item.status === 'ACTIVE') ??
    campaigns[0] ??
    null;

  const available = campaign
    ? await d1
        .prepare(
          `SELECT id, number, recipient_count AS recipientCount, status
           FROM batches
           WHERE campaign_id = ? AND status = 'AVAILABLE'
           ORDER BY number
           LIMIT 150`,
        )
        .bind(campaign.id)
        .all<{ id: string; number: number; recipientCount: number; status: string }>()
    : { results: [] };

  const myBatches = await d1
    .prepare(
      `SELECT batches.id, batches.number, batches.recipient_count AS recipientCount,
              batches.sent_count AS sentCount, batches.failed_count AS failedCount,
              batches.status, batches.gmail_account_id AS gmailAccountId,
              campaigns.id AS campaignId, campaigns.name AS campaignName,
              gmail_accounts.email AS gmailEmail,
              sends.status AS sendStatus, sends.last_error_message AS lastError,
              sends.next_attempt_at AS nextAttemptAt
       FROM batches
       JOIN campaigns ON campaigns.id = batches.campaign_id
       LEFT JOIN gmail_accounts ON gmail_accounts.id = batches.gmail_account_id
       LEFT JOIN sends ON sends.batch_id = batches.id
       WHERE batches.claimed_by_id = ?
         AND batches.status IN ('CLAIMED', 'SENDING', 'FAILED', 'SENT')
       ORDER BY CASE batches.status WHEN 'SENDING' THEN 0 WHEN 'FAILED' THEN 1 WHEN 'CLAIMED' THEN 2 ELSE 3 END,
                batches.updated_at DESC
       LIMIT 50`,
    )
    .bind(user.id)
    .all<{
      id: string;
      number: number;
      recipientCount: number;
      sentCount: number;
      failedCount: number;
      status: string;
      gmailAccountId: string | null;
      campaignId: string;
      campaignName: string;
      gmailEmail: string | null;
      sendStatus: string | null;
      lastError: string | null;
      nextAttemptAt: string | null;
    }>();

  const gmailAccounts = await d1
    .prepare(
      `SELECT id, email, display_name AS displayName, token_expires_at AS tokenExpiresAt
       FROM gmail_accounts
       WHERE user_id = ? AND revoked_at IS NULL
       ORDER BY created_at`,
    )
    .bind(user.id)
    .all<{ id: string; email: string; displayName: string | null; tokenExpiresAt: string }>();

  const audits =
    user.role === 'ORGANIZER'
      ? await d1
          .prepare(
            `SELECT audit_events.id, audit_events.action, audit_events.entity_type AS entityType,
                    audit_events.entity_id AS entityId, audit_events.metadata_json AS metadataJson,
                    audit_events.created_at AS createdAt, users.email AS actorEmail
             FROM audit_events
             LEFT JOIN users ON users.id = audit_events.actor_id
             ORDER BY audit_events.created_at DESC LIMIT 20`,
          )
          .all<{
            id: string;
            action: string;
            entityType: string;
            entityId: string;
            metadataJson: string;
            createdAt: string;
            actorEmail: string | null;
          }>()
      : { results: [] };

  const suppressionRows =
    user.role === 'ORGANIZER'
      ? await d1
          .prepare(
            `SELECT id, normalized_email AS email, reason, created_at AS createdAt
             FROM suppressions ORDER BY created_at DESC LIMIT 100`,
          )
          .all<{ id: string; email: string; reason: string; createdAt: string }>()
      : { results: [] };

  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    campaigns,
    campaign,
    availableBatches: available.results,
    myBatches: myBatches.results,
    gmailAccounts: gmailAccounts.results,
    audits: audits.results,
    suppressions: suppressionRows.results,
    gmailConfigured: Boolean(
      process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.GOOGLE_REDIRECT_URI &&
        process.env.TOKEN_ENCRYPTION_KEY,
    ),
    mockTransport: usesMockTransport(),
  };
}
