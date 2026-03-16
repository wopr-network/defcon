CREATE TABLE "repo_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"repo" text NOT NULL,
	"config" jsonb NOT NULL,
	"claude_md" text,
	"status" text DEFAULT 'complete' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_gaps" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"repo_config_id" text NOT NULL,
	"capability" text NOT NULL,
	"title" text NOT NULL,
	"priority" text NOT NULL,
	"description" text NOT NULL,
	"issue_url" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repo_gaps" ADD CONSTRAINT "repo_gaps_repo_config_id_repo_configs_id_fk" FOREIGN KEY ("repo_config_id") REFERENCES "public"."repo_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_repo_config_tenant_repo" ON "repo_configs" USING btree ("tenant_id","repo");--> statement-breakpoint
CREATE INDEX "idx_repo_configs_tenant" ON "repo_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_repo_gaps_config" ON "repo_gaps" USING btree ("repo_config_id");--> statement-breakpoint
CREATE INDEX "idx_repo_gaps_tenant" ON "repo_gaps" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_repo_gaps_status" ON "repo_gaps" USING btree ("repo_config_id","status");