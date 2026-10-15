CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"model" text NOT NULL,
	"web_search" boolean NOT NULL,
	"answer" text,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mentioned" boolean DEFAULT false NOT NULL,
	"cited" boolean DEFAULT false NOT NULL,
	"position" integer,
	"brands" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"topic" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"trigger" text NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"done" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"brand" text DEFAULT '' NOT NULL,
	"brand_aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"domain" text,
	"competitors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"models" text[] DEFAULT '{}'::text[] NOT NULL,
	"web_search" boolean DEFAULT true NOT NULL,
	"schedule" text DEFAULT 'weekly' NOT NULL,
	"next_run_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_cache" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "api_cache_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "audit_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"url" text NOT NULL,
	"detail" text,
	"related_urls" jsonb
);
--> statement-breakpoint
CREATE TABLE "audit_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"url" text NOT NULL,
	"status" integer,
	"title" text,
	"word_count" integer,
	"depth" integer,
	"response_ms" integer,
	"indexable" boolean,
	"issue_count" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"start_url" text NOT NULL,
	"max_pages" integer NOT NULL,
	"render_js" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"pages_crawled" integer DEFAULT 0 NOT NULL,
	"health_score" integer,
	"summary" jsonb,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "geo_grid_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grid_id" uuid NOT NULL,
	"row" integer NOT NULL,
	"col" integer NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"position" integer,
	"top" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "geo_grids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"place_id" text NOT NULL,
	"place_name" text NOT NULL,
	"center_lat" double precision NOT NULL,
	"center_lng" double precision NOT NULL,
	"size" integer NOT NULL,
	"spacing_m" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"done" integer DEFAULT 0 NOT NULL,
	"average_position" double precision,
	"found_in" integer,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"location_code" integer DEFAULT 2840 NOT NULL,
	"location_name" text DEFAULT 'United States' NOT NULL,
	"country" text DEFAULT 'us' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracker_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"tracker_id" uuid NOT NULL,
	"keyword_id" uuid NOT NULL,
	"device" text NOT NULL,
	"position" integer,
	"url" text,
	"title" text,
	"checked_depth" integer NOT NULL,
	"features" text[] DEFAULT '{}'::text[] NOT NULL,
	"owned_features" text[] DEFAULT '{}'::text[] NOT NULL,
	"in_local_pack" boolean,
	"competitors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"error" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracker_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"trigger" text NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"done" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rank_trackers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"location_code" integer,
	"location_name" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"language" text DEFAULT 'en' NOT NULL,
	"devices" text[] DEFAULT '{desktop}'::text[] NOT NULL,
	"depth" integer DEFAULT 20 NOT NULL,
	"schedule" text DEFAULT 'weekly' NOT NULL,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"location_code" integer NOT NULL,
	"language" text NOT NULL,
	"volume" integer,
	"cpc" double precision,
	"competition" double precision,
	"difficulty" integer,
	"intent" text,
	"trend" jsonb,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"metrics_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"project_id" uuid,
	"endpoint" text NOT NULL,
	"feature" text,
	"ok" boolean NOT NULL,
	"status" integer,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"yepapi_key_enc" text,
	"yepapi_key_hint" text,
	"yepapi_key_checked_at" timestamp with time zone,
	"monthly_budget_usd" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_answers" ADD CONSTRAINT "ai_answers_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_answers" ADD CONSTRAINT "ai_answers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_answers" ADD CONSTRAINT "ai_answers_prompt_id_ai_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."ai_prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_cache" ADD CONSTRAINT "api_cache_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_issues" ADD CONSTRAINT "audit_issues_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD CONSTRAINT "audit_pages_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_grid_points" ADD CONSTRAINT "geo_grid_points_grid_id_geo_grids_id_fk" FOREIGN KEY ("grid_id") REFERENCES "public"."geo_grids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_grids" ADD CONSTRAINT "geo_grids_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_keywords" ADD CONSTRAINT "rank_keywords_tracker_id_rank_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."rank_trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_results" ADD CONSTRAINT "rank_results_run_id_rank_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."rank_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_results" ADD CONSTRAINT "rank_results_tracker_id_rank_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."rank_trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_results" ADD CONSTRAINT "rank_results_keyword_id_rank_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."rank_keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_runs" ADD CONSTRAINT "rank_runs_tracker_id_rank_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."rank_trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_trackers" ADD CONSTRAINT "rank_trackers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_keywords" ADD CONSTRAINT "saved_keywords_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_answers_prompt_idx" ON "ai_answers" USING btree ("prompt_id","model","created_at");--> statement-breakpoint
CREATE INDEX "ai_answers_run_idx" ON "ai_answers" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "ai_prompts_project_idx" ON "ai_prompts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ai_runs_project_idx" ON "ai_runs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_runs_active_unique" ON "ai_runs" USING btree ("project_id") WHERE status in ('queued','running');--> statement-breakpoint
CREATE INDEX "api_cache_expiry_idx" ON "api_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "api_keys_user_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_issues_audit_idx" ON "audit_issues" USING btree ("audit_id","type");--> statement-breakpoint
CREATE INDEX "audit_pages_audit_idx" ON "audit_pages" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "audits_project_idx" ON "audits" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_grid_points_unique" ON "geo_grid_points" USING btree ("grid_id","row","col");--> statement-breakpoint
CREATE INDEX "geo_grids_project_idx" ON "geo_grids" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "projects_user_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_keywords_unique" ON "rank_keywords" USING btree ("tracker_id","keyword");--> statement-breakpoint
CREATE INDEX "rank_results_keyword_idx" ON "rank_results" USING btree ("keyword_id","device","checked_at");--> statement-breakpoint
CREATE INDEX "rank_results_run_idx" ON "rank_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "rank_runs_tracker_idx" ON "rank_runs" USING btree ("tracker_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_runs_active_unique" ON "rank_runs" USING btree ("tracker_id") WHERE status in ('queued','running');--> statement-breakpoint
CREATE INDEX "rank_trackers_project_idx" ON "rank_trackers" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "rank_trackers_due_idx" ON "rank_trackers" USING btree ("next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_keywords_unique" ON "saved_keywords" USING btree ("project_id","keyword","location_code","language");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_user_time_idx" ON "usage_log" USING btree ("user_id","created_at");