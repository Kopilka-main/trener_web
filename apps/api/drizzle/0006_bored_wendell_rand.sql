CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"trainer_id" text NOT NULL,
	"client_id" text NOT NULL,
	"workout_id" text,
	"date" text NOT NULL,
	"start_time" text NOT NULL,
	"duration_min" integer DEFAULT 60 NOT NULL,
	"location" text,
	"title" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"is_online" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workout_id_client_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."client_workouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sessions_trainer_date" ON "sessions" USING btree ("trainer_id","date");