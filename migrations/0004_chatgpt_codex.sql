ALTER TABLE `upstreams` ADD COLUMN `type` text NOT NULL DEFAULT 'openai-compatible';
--> statement-breakpoint
CREATE TABLE `provider_credentials` (
	`provider_id` text PRIMARY KEY NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`account_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
