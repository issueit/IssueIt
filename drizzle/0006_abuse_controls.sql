CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "protection" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "quarantined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "spam_score" integer;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "spam_reasons" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "content_hash" text;--> statement-breakpoint
CREATE INDEX "reports_content_idx" ON "reports" USING btree ("project_id","content_hash","created_at");--> statement-breakpoint
CREATE INDEX "reports_held_idx" ON "reports" USING btree ("org_id","project_id") WHERE "reports"."quarantined_at" is not null;