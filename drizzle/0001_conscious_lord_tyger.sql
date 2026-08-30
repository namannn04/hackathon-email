CREATE TABLE `campaign_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_by_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_campaign_invites_token_hash` ON `campaign_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_campaign_invites_campaign_active` ON `campaign_invites` (`campaign_id`,`revoked_at`,`expires_at`);--> statement-breakpoint
CREATE TABLE `campaign_members` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'VOLUNTEER' NOT NULL,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_campaign_members_campaign_user` ON `campaign_members` (`campaign_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_members_user_campaign` ON `campaign_members` (`user_id`,`campaign_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `campaign_members` (`id`, `campaign_id`, `user_id`, `role`, `joined_at`)
SELECT 'owner-' || `id`, `id`, `created_by_id`, 'ORGANIZER', `created_at`
FROM `campaigns`;--> statement-breakpoint
PRAGMA optimize;
