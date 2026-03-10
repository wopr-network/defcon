CREATE TABLE "integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"provider" text NOT NULL,
	"credentials" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flow_definitions" ADD COLUMN "issue_tracker_integration_id" text;--> statement-breakpoint
ALTER TABLE "flow_definitions" ADD COLUMN "vcs_integration_id" text;--> statement-breakpoint
ALTER TABLE "gate_definitions" ADD COLUMN "primitive_op" text;--> statement-breakpoint
ALTER TABLE "gate_definitions" ADD COLUMN "primitive_params" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_integration_tenant_name" ON "integrations" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "idx_integrations_tenant" ON "integrations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_integrations_tenant_category" ON "integrations" USING btree ("tenant_id","category");--> statement-breakpoint
ALTER TABLE "flow_definitions" ADD CONSTRAINT "flow_definitions_issue_tracker_integration_id_integrations_id_fk" FOREIGN KEY ("issue_tracker_integration_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_definitions" ADD CONSTRAINT "flow_definitions_vcs_integration_id_integrations_id_fk" FOREIGN KEY ("vcs_integration_id") REFERENCES "public"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_flow_definitions_issue_tracker" ON "flow_definitions" USING btree ("issue_tracker_integration_id");--> statement-breakpoint
CREATE INDEX "idx_flow_definitions_vcs" ON "flow_definitions" USING btree ("vcs_integration_id");