ALTER TABLE `log_records` ADD COLUMN `session_id` text;
--> statement-breakpoint
CREATE INDEX `log_records_session_id_idx` ON `log_records` (`session_id`);
