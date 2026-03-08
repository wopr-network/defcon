ALTER TABLE `flow_definitions` ADD `claim_retry_after_ms` integer;--> statement-breakpoint
ALTER TABLE `state_definitions` ADD `retry_after_ms` integer;