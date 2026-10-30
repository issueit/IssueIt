CREATE TABLE "emails" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"project_id" text NOT NULL,
	"report_id" text NOT NULL,
	"kind" text NOT NULL,
	"to" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"via" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"message_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "emails_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "widget" SET DEFAULT '{"showButton":true,"buttonLabel":"Report a bug","buttonIcon":"bug","buttonStyle":"pill","buttonSize":"md","position":"bottom-right","offsetX":18,"offsetY":18,"theme":"auto","accent":null,"radius":12,"panelWidth":360,"font":"system","shadow":"soft","backdrop":false,"logo":null,"brandName":"","headerStyle":"plain","poweredBy":true,"title":"Report a bug","intro":"","titleLabel":"What went wrong?","titlePlaceholder":"A short summary","descriptionLabel":"Details","descriptionPlaceholder":"What did you expect, and what happened instead?","submitLabel":"Send report","successTitle":"Report sent","successMessage":"Thanks. The team has it.","footerNote":"Sends this page''s address, browser details and recent errors with your report.","privacyUrl":null,"updatesLabel":"Email me updates about this report","duplicateMessage":"Others have reported this too, so it''s already with the team.","collectEmail":"optional","collectName":"off","descriptionRequired":false,"askPriority":false,"defaultPriority":"medium","categories":[],"categoryLabel":"Type","customFields":[],"allowAttachments":true,"allowScreenshot":true,"maxFiles":5,"shortcut":null,"autoCloseSeconds":0,"hideOnMobile":false,"includePages":[],"excludePages":[],"sendContext":true,"captureConsole":true,"captureNetwork":true,"captureSteps":true,"environment":null}'::jsonb;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "external_state" text;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "state_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "destinations" ADD COLUMN "sync_state" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "emails" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "logo" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "group_duplicates" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "diagnostics" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "notify_reporter" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "fingerprint" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "duplicate_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emails_due_idx" ON "emails" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "emails_report_idx" ON "emails" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "emails_to_idx" ON "emails" USING btree ("org_id","to","created_at");--> statement-breakpoint
CREATE INDEX "emails_project_idx" ON "emails" USING btree ("project_id","created_at");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_group_id_reports_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_fingerprint_idx" ON "reports" USING btree ("project_id","fingerprint");--> statement-breakpoint
CREATE INDEX "reports_group_idx" ON "reports" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "reports_ip_idx" ON "reports" USING btree ("project_id","ip_hash","created_at");