ALTER TABLE "projects" ADD COLUMN "channels" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "channel" text;