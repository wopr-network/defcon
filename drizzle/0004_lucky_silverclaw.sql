ALTER TABLE `entities` ADD `affinity_worker_id` text;--> statement-breakpoint
ALTER TABLE `entities` ADD `affinity_role` text;--> statement-breakpoint
ALTER TABLE `entities` ADD `affinity_expires_at` integer;--> statement-breakpoint
CREATE INDEX `entities_affinity_idx` ON `entities` (`affinity_worker_id`,`affinity_role`,`affinity_expires_at`);--> statement-breakpoint
ALTER TABLE `flow_definitions` ADD `affinity_window_ms` integer DEFAULT 300000;
