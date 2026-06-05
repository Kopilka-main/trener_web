CREATE TABLE "analytics_events" (
	"id" text PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"session_id" text NOT NULL,
	"name" text NOT NULL,
	"path" text,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ua" text,
	"app_version" text,
	CONSTRAINT "analytics_events_source_chk" CHECK ("analytics_events"."source" IN ('client', 'trainer')),
	CONSTRAINT "analytics_events_actor_type_chk" CHECK ("analytics_events"."actor_type" IN ('trainer', 'client', 'anon'))
);
--> statement-breakpoint
CREATE TABLE "error_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"level" text NOT NULL,
	"name" text,
	"message" text NOT NULL,
	"stack" text,
	"path" text,
	"method" text,
	"status_code" integer,
	"actor_type" text,
	"actor_id" text,
	"ua" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"app_version" text,
	CONSTRAINT "error_logs_source_chk" CHECK ("error_logs"."source" IN ('api', 'client', 'trainer')),
	CONSTRAINT "error_logs_level_chk" CHECK ("error_logs"."level" IN ('error', 'warn', 'fatal'))
);
--> statement-breakpoint
CREATE INDEX "analytics_events_ts_idx" ON "analytics_events" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "analytics_events_actor_idx" ON "analytics_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "analytics_events_name_idx" ON "analytics_events" USING btree ("name");--> statement-breakpoint
CREATE INDEX "error_logs_ts_idx" ON "error_logs" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "error_logs_level_idx" ON "error_logs" USING btree ("level");--> statement-breakpoint
CREATE INDEX "error_logs_source_idx" ON "error_logs" USING btree ("source");