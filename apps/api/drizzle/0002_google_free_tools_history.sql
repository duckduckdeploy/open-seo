CREATE TABLE "free_tool_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"tool" text NOT NULL,
	"payload" jsonb NOT NULL,
	"failed" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "free_tool_counters" (
	"bucket" text PRIMARY KEY NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"usd" double precision DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ga4_connections" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"google_account_id" uuid NOT NULL,
	"property_id" text NOT NULL,
	"display_name" text NOT NULL,
	"time_zone" text,
	"currency_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"google_sub" text NOT NULL,
	"email" text,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gsc_connections" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"google_account_id" uuid NOT NULL,
	"site_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_answers" ADD COLUMN "branded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_answers" ADD COLUMN "brand_key" text;--> statement-breakpoint
ALTER TABLE "rank_keywords" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ga4_connections" ADD CONSTRAINT "ga4_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga4_connections" ADD CONSTRAINT "ga4_connections_google_account_id_google_accounts_id_fk" FOREIGN KEY ("google_account_id") REFERENCES "public"."google_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_accounts" ADD CONSTRAINT "google_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_connections" ADD CONSTRAINT "gsc_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_connections" ADD CONSTRAINT "gsc_connections_google_account_id_google_accounts_id_fk" FOREIGN KEY ("google_account_id") REFERENCES "public"."google_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "free_tool_cache_expiry_idx" ON "free_tool_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "free_tool_counters_expiry_idx" ON "free_tool_counters" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "google_accounts_unique" ON "google_accounts" USING btree ("user_id","provider","google_sub");