CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_audit_entity_time` ON `audit_events` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`number` integer NOT NULL,
	`recipient_count` integer DEFAULT 0 NOT NULL,
	`sent_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'AVAILABLE' NOT NULL,
	`claimed_by_id` text,
	`claimed_at` text,
	`gmail_account_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`claimed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`gmail_account_id`) REFERENCES `gmail_accounts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_batches_recipient_count" CHECK("batches"."recipient_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_batches_campaign_number` ON `batches` (`campaign_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_batches_active_gmail_account` ON `batches` (`gmail_account_id`) WHERE "batches"."gmail_account_id" IS NOT NULL AND "batches"."status" IN ('CLAIMED', 'SENDING', 'FAILED');--> statement-breakpoint
CREATE INDEX `idx_batches_campaign_status` ON `batches` (`campaign_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_batches_claimer_status` ON `batches` (`claimed_by_id`,`status`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`subject` text NOT NULL,
	`body_html` text NOT NULL,
	`body_text` text NOT NULL,
	`batch_size` integer DEFAULT 300 NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`created_by_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_campaigns_batch_size" CHECK("campaigns"."batch_size" BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE INDEX `idx_campaigns_status` ON `campaigns` (`status`);--> statement-breakpoint
CREATE INDEX `idx_campaigns_created_by` ON `campaigns` (`created_by_id`);--> statement-breakpoint
CREATE TABLE `gmail_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`google_subject` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`access_token_ciphertext` text NOT NULL,
	`refresh_token_ciphertext` text,
	`token_expires_at` text NOT NULL,
	`scopes` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_gmail_accounts_user_subject` ON `gmail_accounts` (`user_id`,`google_subject`);--> statement-breakpoint
CREATE INDEX `idx_gmail_accounts_user_active` ON `gmail_accounts` (`user_id`,`revoked_at`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_verifier` text NOT NULL,
	`return_to` text DEFAULT '/my-batches' NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_states_expiry` ON `oauth_states` (`expires_at`);--> statement-breakpoint
CREATE TABLE `recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`batch_id` text,
	`email` text NOT NULL,
	`normalized_email` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`sent_at` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_recipients_campaign_email` ON `recipients` (`campaign_id`,`normalized_email`);--> statement-breakpoint
CREATE INDEX `idx_recipients_campaign_status` ON `recipients` (`campaign_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_recipients_batch_status` ON `recipients` (`batch_id`,`status`);--> statement-breakpoint
CREATE TABLE `sends` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`deterministic_message_id` text NOT NULL,
	`status` text DEFAULT 'QUEUED' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`lease_owner` text,
	`lease_expires_at` text,
	`provider_message_id` text,
	`last_error_code` text,
	`last_error_message` text,
	`next_attempt_at` text,
	`sent_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sends_batch` ON `sends` (`batch_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sends_idempotency` ON `sends` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sends_message_id` ON `sends` (`deterministic_message_id`);--> statement-breakpoint
CREATE INDEX `idx_sends_retry_queue` ON `sends` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `suppressions` (
	`id` text PRIMARY KEY NOT NULL,
	`normalized_email` text NOT NULL,
	`reason` text NOT NULL,
	`created_by_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_suppressions_email` ON `suppressions` (`normalized_email`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`role` text DEFAULT 'VOLUNTEER' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_users_external_id` ON `users` (`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_users_email` ON `users` (`email`);
--> statement-breakpoint
PRAGMA optimize;
