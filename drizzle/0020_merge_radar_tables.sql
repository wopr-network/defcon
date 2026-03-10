-- Merge worker-pool tables from radar-db into unified schema
-- Uses IF NOT EXISTS for safe re-runs on DBs that already have these tables

CREATE TABLE IF NOT EXISTS `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`config` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `sources_name_unique` ON `sources` (`name`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `watches` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL REFERENCES `sources`(`id`) ON DELETE CASCADE,
	`name` text NOT NULL,
	`filter` text NOT NULL,
	`action` text NOT NULL,
	`action_config` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `event_log` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL REFERENCES `sources`(`id`) ON DELETE CASCADE,
	`watch_id` text REFERENCES `watches`(`id`) ON DELETE CASCADE,
	`raw_event` text NOT NULL,
	`action_taken` text,
	`defcon_response` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `workers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`discipline` text NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`config` text,
	`last_heartbeat` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `entity_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `entity_activity_entity_id_idx` ON `entity_activity` (`entity_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `entity_activity_entity_seq_uniq` ON `entity_activity` (`entity_id`, `seq`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `throughput_events` (
	`id` text PRIMARY KEY NOT NULL,
	`outcome` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `throughput_events_created_at_idx` ON `throughput_events` (`created_at`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `entity_map` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `entity_map_source_external_uniq` ON `entity_map` (`source_id`, `external_id`);
