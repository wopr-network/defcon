CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`flow_id` text NOT NULL,
	`state` text NOT NULL,
	`refs` text,
	`artifacts` text,
	`claimed_by` text,
	`claimed_at` integer,
	`flow_version` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`flow_id`) REFERENCES `flow_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `entities_flow_state_idx` ON `entities` (`flow_id`,`state`);--> statement-breakpoint
CREATE INDEX `entities_claim_idx` ON `entities` (`flow_id`,`state`,`claimed_by`);--> statement-breakpoint
CREATE TABLE `entity_history` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`from_state` text,
	`to_state` text NOT NULL,
	`trigger` text,
	`invocation_id` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `entity_history_entity_ts_idx` ON `entity_history` (`entity_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`entity_id` text,
	`flow_id` text,
	`payload` text,
	`emitted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_type_emitted_idx` ON `events` (`type`,`emitted_at`);--> statement-breakpoint
CREATE TABLE `flow_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`entity_schema` text,
	`initial_state` text NOT NULL,
	`max_concurrent` integer DEFAULT 0,
	`max_concurrent_per_repo` integer DEFAULT 0,
	`version` integer DEFAULT 1,
	`created_by` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `flow_definitions_name_unique` ON `flow_definitions` (`name`);--> statement-breakpoint
CREATE TABLE `flow_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`flow_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot` text,
	`changed_by` text,
	`change_reason` text,
	`created_at` integer,
	FOREIGN KEY (`flow_id`) REFERENCES `flow_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `flow_versions_flow_version_unique` ON `flow_versions` (`flow_id`,`version`);--> statement-breakpoint
CREATE TABLE `gate_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`command` text,
	`function_ref` text,
	`api_config` text,
	`timeout_ms` integer DEFAULT 30000
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gate_definitions_name_unique` ON `gate_definitions` (`name`);--> statement-breakpoint
CREATE TABLE `gate_results` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`gate_id` text NOT NULL,
	`passed` integer NOT NULL,
	`output` text,
	`evaluated_at` integer,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`gate_id`) REFERENCES `gate_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `integration_config` (
	`id` text PRIMARY KEY NOT NULL,
	`capability` text NOT NULL,
	`adapter` text NOT NULL,
	`config` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_config_capability_unique` ON `integration_config` (`capability`);--> statement-breakpoint
CREATE TABLE `invocations` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`stage` text NOT NULL,
	`agent_role` text,
	`mode` text NOT NULL,
	`prompt` text NOT NULL,
	`context` text,
	`claimed_by` text,
	`claimed_at` integer,
	`started_at` integer,
	`completed_at` integer,
	`failed_at` integer,
	`signal` text,
	`artifacts` text,
	`error` text,
	`ttl_ms` integer DEFAULT 1800000,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invocations_entity_idx` ON `invocations` (`entity_id`);--> statement-breakpoint
CREATE TABLE `state_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`flow_id` text NOT NULL,
	`name` text NOT NULL,
	`agent_role` text,
	`model_tier` text,
	`mode` text DEFAULT 'passive',
	`prompt_template` text,
	`constraints` text,
	FOREIGN KEY (`flow_id`) REFERENCES `flow_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `state_definitions_flow_name_unique` ON `state_definitions` (`flow_id`,`name`);--> statement-breakpoint
CREATE TABLE `transition_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`flow_id` text NOT NULL,
	`from_state` text NOT NULL,
	`to_state` text NOT NULL,
	`trigger` text NOT NULL,
	`gate_id` text,
	`condition` text,
	`priority` integer DEFAULT 0,
	`spawn_flow` text,
	`spawn_template` text,
	`created_at` integer,
	FOREIGN KEY (`flow_id`) REFERENCES `flow_definitions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`gate_id`) REFERENCES `gate_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
