ALTER TABLE "ai_runs" ADD COLUMN "max_cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "geo_grids" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rank_runs" ADD COLUMN "heartbeat_at" timestamp with time zone;