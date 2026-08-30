import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    externalId: text('external_id').notNull(),
    email: text('email').notNull(),
    name: text('name'),
    role: text('role', { enum: ['ORGANIZER', 'VOLUNTEER'] })
      .notNull()
      .default('VOLUNTEER'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_users_external_id').on(table.externalId),
    uniqueIndex('uq_users_email').on(table.email),
  ],
);

export const campaigns = sqliteTable(
  'campaigns',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    subject: text('subject').notNull(),
    bodyHtml: text('body_html').notNull(),
    bodyText: text('body_text').notNull(),
    batchSize: integer('batch_size').notNull().default(300),
    status: text('status', {
      enum: ['DRAFT', 'READY', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'],
    })
      .notNull()
      .default('DRAFT'),
    createdById: text('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_campaigns_status').on(table.status),
    index('idx_campaigns_created_by').on(table.createdById),
    check('ck_campaigns_batch_size', sql`${table.batchSize} BETWEEN 1 AND 500`),
  ],
);

export const campaignMembers = sqliteTable(
  'campaign_members',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['ORGANIZER', 'VOLUNTEER'] })
      .notNull()
      .default('VOLUNTEER'),
    joinedAt: text('joined_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_campaign_members_campaign_user').on(table.campaignId, table.userId),
    index('idx_campaign_members_user_campaign').on(table.userId, table.campaignId),
  ],
);

export const campaignInvites = sqliteTable(
  'campaign_invites',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdById: text('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_campaign_invites_token_hash').on(table.tokenHash),
    index('idx_campaign_invites_campaign_active').on(
      table.campaignId,
      table.revokedAt,
      table.expiresAt,
    ),
  ],
);

export const gmailAccounts = sqliteTable(
  'gmail_accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    googleSubject: text('google_subject').notNull(),
    email: text('email').notNull(),
    displayName: text('display_name'),
    accessTokenCiphertext: text('access_token_ciphertext').notNull(),
    refreshTokenCiphertext: text('refresh_token_ciphertext'),
    tokenExpiresAt: text('token_expires_at').notNull(),
    scopes: text('scopes').notNull(),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_gmail_accounts_user_subject').on(table.userId, table.googleSubject),
    index('idx_gmail_accounts_user_active').on(table.userId, table.revokedAt),
  ],
);

export const batches = sqliteTable(
  'batches',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    recipientCount: integer('recipient_count').notNull().default(0),
    sentCount: integer('sent_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    status: text('status', {
      enum: ['AVAILABLE', 'CLAIMED', 'SENDING', 'SENT', 'FAILED'],
    })
      .notNull()
      .default('AVAILABLE'),
    claimedById: text('claimed_by_id').references(() => users.id, { onDelete: 'set null' }),
    claimedAt: text('claimed_at'),
    gmailAccountId: text('gmail_account_id').references(() => gmailAccounts.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_batches_campaign_number').on(table.campaignId, table.number),
    uniqueIndex('uq_batches_active_gmail_account')
      .on(table.gmailAccountId)
      .where(sql`${table.gmailAccountId} IS NOT NULL AND ${table.status} IN ('CLAIMED', 'SENDING', 'FAILED')`),
    index('idx_batches_campaign_status').on(table.campaignId, table.status),
    index('idx_batches_claimer_status').on(table.claimedById, table.status),
    check('ck_batches_recipient_count', sql`${table.recipientCount} >= 0`),
  ],
);

export const recipients = sqliteTable(
  'recipients',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    batchId: text('batch_id').references(() => batches.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    normalizedEmail: text('normalized_email').notNull(),
    status: text('status', {
      enum: ['PENDING', 'RESERVED', 'SENT', 'FAILED', 'SUPPRESSED'],
    })
      .notNull()
      .default('PENDING'),
    sentAt: text('sent_at'),
    lastError: text('last_error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_recipients_campaign_email').on(table.campaignId, table.normalizedEmail),
    index('idx_recipients_campaign_status').on(table.campaignId, table.status),
    index('idx_recipients_batch_status').on(table.batchId, table.status),
  ],
);

export const sends = sqliteTable(
  'sends',
  {
    id: text('id').primaryKey(),
    batchId: text('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull(),
    deterministicMessageId: text('deterministic_message_id').notNull(),
    status: text('status', {
      enum: [
        'QUEUED',
        'DISPATCHING',
        'SENT',
        'RETRYABLE_FAILED',
        'PERMANENT_FAILED',
        'CANCELLED',
      ],
    })
      .notNull()
      .default('QUEUED'),
    attemptCount: integer('attempt_count').notNull().default(0),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: text('lease_expires_at'),
    providerMessageId: text('provider_message_id'),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    nextAttemptAt: text('next_attempt_at'),
    sentAt: text('sent_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_sends_batch').on(table.batchId),
    uniqueIndex('uq_sends_idempotency').on(table.idempotencyKey),
    uniqueIndex('uq_sends_message_id').on(table.deterministicMessageId),
    index('idx_sends_retry_queue').on(table.status, table.nextAttemptAt),
  ],
);

export const suppressions = sqliteTable(
  'suppressions',
  {
    id: text('id').primaryKey(),
    normalizedEmail: text('normalized_email').notNull(),
    reason: text('reason').notNull(),
    createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('uq_suppressions_email').on(table.normalizedEmail)],
);

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    metadataJson: text('metadata_json').notNull().default('{}'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_audit_entity_time').on(table.entityType, table.entityId, table.createdAt)],
);

export const oauthStates = sqliteTable(
  'oauth_states',
  {
    state: text('state').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeVerifier: text('code_verifier').notNull(),
    returnTo: text('return_to').notNull().default('/my-batches'),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_oauth_states_expiry').on(table.expiresAt)],
);

export type User = typeof users.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type Recipient = typeof recipients.$inferSelect;
export type GmailAccount = typeof gmailAccounts.$inferSelect;
export type Send = typeof sends.$inferSelect;
