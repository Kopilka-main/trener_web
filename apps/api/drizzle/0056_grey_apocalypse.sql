CREATE TABLE "analytics_screen_events" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"session_id" text NOT NULL,
	"screen" text NOT NULL,
	"duration_sec" integer NOT NULL,
	"entered_at" timestamp with time zone NOT NULL,
	"app_version" text,
	"platform" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_screen_events_subject_type_chk" CHECK ("analytics_screen_events"."subject_type" IN ('trainer', 'client'))
);
--> statement-breakpoint
CREATE INDEX "idx_analytics_screen_events_subject_session" ON "analytics_screen_events" USING btree ("subject_type","subject_id","session_id");--> statement-breakpoint
CREATE INDEX "idx_analytics_screen_events_subject_entered" ON "analytics_screen_events" USING btree ("subject_id","entered_at");