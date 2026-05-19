CREATE TABLE `model_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`abstract_name` text NOT NULL,
	`upstream_name` text NOT NULL,
	`model_path` text NOT NULL,
	`priority` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `model_mappings_abstract_name_idx` ON `model_mappings` (`abstract_name`);