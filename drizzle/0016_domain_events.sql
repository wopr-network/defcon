CREATE TABLE `domain_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`entity_id` text NOT NULL,
	`payload` text NOT NULL,
	`sequence` integer NOT NULL,
	`emitted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `domain_events_entity_seq_idx` ON `domain_events` (`entity_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `domain_events_type_idx` ON `domain_events` (`type`,`emitted_at`);