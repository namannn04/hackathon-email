import { getD1 } from '@/db';
import type { User } from '@/db/schema';
import { auditStatement } from '@/lib/audit';
import { toBase64Url } from '@/lib/crypto/secrets';
import { HttpError } from '@/lib/http';

const INVITE_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;

export async function createCampaignInvite(campaignId: string, actor: User, origin: string) {
  const d1 = getD1();
  const campaign = await d1
    .prepare(
      `SELECT id, name FROM campaigns
       WHERE id = ? AND status NOT IN ('ARCHIVED')`,
    )
    .bind(campaignId)
    .first<{ id: string; name: string }>();
  if (!campaign) throw new HttpError(404, 'Event was not found.', 'EVENT_NOT_FOUND');

  const id = crypto.randomUUID();
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await hashInviteToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_LIFETIME_MS).toISOString();

  await d1.batch([
    d1
      .prepare(
        `INSERT INTO campaign_invites
         (id, campaign_id, token_hash, created_by_id, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, campaignId, tokenHash, actor.id, expiresAt, now.toISOString()),
    auditStatement({
      actorId: actor.id,
      action: 'EVENT_INVITE_CREATED',
      entityType: 'campaign',
      entityId: campaignId,
      metadata: { inviteId: id, expiresAt },
    }),
  ]);

  const trustedOrigin = new URL(origin).origin;
  return {
    id,
    campaignId,
    campaignName: campaign.name,
    url: new URL(`/join/${token}`, trustedOrigin).toString(),
    expiresAt,
  };
}

export async function acceptCampaignInvite(token: string, user: User) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
    throw new HttpError(404, 'This event invitation is invalid.', 'INVITE_INVALID');
  }
  const d1 = getD1();
  const tokenHash = await hashInviteToken(token);
  const now = new Date().toISOString();
  const membershipId = crypto.randomUUID();
  const membership = await d1
    .prepare(
      `INSERT INTO campaign_members (id, campaign_id, user_id, role, joined_at)
       SELECT ?, campaign_invites.campaign_id, ?, 'VOLUNTEER', ?
       FROM campaign_invites
       JOIN campaigns ON campaigns.id = campaign_invites.campaign_id
       WHERE campaign_invites.token_hash = ?
         AND campaign_invites.revoked_at IS NULL
         AND campaign_invites.expires_at > ?
         AND campaigns.status IN ('ACTIVE', 'PAUSED', 'COMPLETED')
       ON CONFLICT(campaign_id, user_id) DO UPDATE SET joined_at = excluded.joined_at
       RETURNING campaign_id AS campaignId`,
    )
    .bind(membershipId, user.id, now, tokenHash, now)
    .first<{ campaignId: string }>();

  if (!membership) {
    throw new HttpError(
      410,
      'This event invitation has expired, was revoked, or is no longer available.',
      'INVITE_UNAVAILABLE',
    );
  }

  await auditStatement({
    actorId: user.id,
    action: 'EVENT_INVITE_ACCEPTED',
    entityType: 'campaign',
    entityId: membership.campaignId,
    metadata: {},
  }).run();
  return membership;
}

export async function revokeCampaignInvite(inviteId: string, actor: User) {
  const now = new Date().toISOString();
  const invite = await getD1()
    .prepare(
      `UPDATE campaign_invites SET revoked_at = ?
       WHERE id = ? AND revoked_at IS NULL
       RETURNING campaign_id AS campaignId`,
    )
    .bind(now, inviteId)
    .first<{ campaignId: string }>();
  if (!invite) throw new HttpError(404, 'Active invitation was not found.', 'INVITE_NOT_FOUND');
  await auditStatement({
    actorId: actor.id,
    action: 'EVENT_INVITE_REVOKED',
    entityType: 'campaign',
    entityId: invite.campaignId,
    metadata: { inviteId },
  }).run();
  return invite;
}

async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return toBase64Url(new Uint8Array(digest));
}
