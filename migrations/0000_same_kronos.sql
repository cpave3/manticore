CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`api_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_api_key_unique` ON `clients` (`api_key`);--> statement-breakpoint
CREATE TABLE `log_records` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`client_name` text NOT NULL,
	`model_id` text NOT NULL,
	`upstream_id` text,
	`upstream_name` text,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`total_tokens` integer,
	`latency_ms` integer NOT NULL,
	`time_to_first_token_ms` integer,
	`finish_reason` text,
	`status` text NOT NULL,
	`status_code` integer,
	`error_message` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `log_records_client_id_idx` ON `log_records` (`client_id`);--> statement-breakpoint
CREATE INDEX `log_records_upstream_id_idx` ON `log_records` (`upstream_id`);--> statement-breakpoint
CREATE INDEX `log_records_created_at_idx` ON `log_records` (`created_at`);--> statement-breakpoint
CREATE TABLE `upstreams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key` text,
	`headers` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upstreams_name_unique` ON `upstreams` (`name`);