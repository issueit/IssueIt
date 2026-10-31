CREATE TABLE "device_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_code" text NOT NULL,
	"name" text NOT NULL,
	"scopes" text[] NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"user_id" text,
	"org_id" text,
	"token_secret" text,
	"approved_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_codes_user_code_unique" UNIQUE("user_code")
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"project_id" text NOT NULL,
	"version" text NOT NULL,
	"dist" text,
	"commit" text,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_maps" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"release_id" text NOT NULL,
	"file" text NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "rules" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "release" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "device_codes" ADD CONSTRAINT "device_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_codes" ADD CONSTRAINT "device_codes_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_maps" ADD CONSTRAINT "source_maps_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_maps" ADD CONSTRAINT "source_maps_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_codes_expiry_idx" ON "device_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "releases_version_idx" ON "releases" USING btree ("project_id","version","dist");--> statement-breakpoint
CREATE INDEX "releases_project_idx" ON "releases" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_maps_file_idx" ON "source_maps" USING btree ("release_id","file");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_idempotency_idx" ON "reports" USING btree ("project_id","idempotency_key");