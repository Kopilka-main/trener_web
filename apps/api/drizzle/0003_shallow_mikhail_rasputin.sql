CREATE TABLE "exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"trainer_id" text,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"default_reps" integer,
	"default_weight_kg" double precision,
	"default_time_sec" integer,
	"rest_sec" integer DEFAULT 90 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;