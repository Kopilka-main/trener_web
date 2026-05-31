CREATE TABLE "client_workout_exercises" (
	"workout_id" text NOT NULL,
	"position" integer NOT NULL,
	"exercise_id" text NOT NULL,
	CONSTRAINT "client_workout_exercises_workout_id_position_pk" PRIMARY KEY("workout_id","position")
);
--> statement-breakpoint
CREATE TABLE "client_workout_sets" (
	"workout_id" text NOT NULL,
	"exercise_position" integer NOT NULL,
	"set_index" integer NOT NULL,
	"planned_reps" integer,
	"planned_weight_kg" double precision,
	"planned_time_sec" integer,
	"planned_rest_sec" integer,
	"actual_reps" integer,
	"actual_weight_kg" double precision,
	"actual_time_sec" integer,
	"done" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "client_workout_sets_workout_id_exercise_position_set_index_pk" PRIMARY KEY("workout_id","exercise_position","set_index")
);
--> statement-breakpoint
CREATE TABLE "client_workouts" (
	"id" text PRIMARY KEY NOT NULL,
	"trainer_id" text NOT NULL,
	"client_id" text NOT NULL,
	"source_template_id" text,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_sec" integer,
	"trainer_note" text,
	"rpe" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_workout_exercises" ADD CONSTRAINT "client_workout_exercises_workout_id_client_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."client_workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_workout_exercises" ADD CONSTRAINT "client_workout_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_workout_sets" ADD CONSTRAINT "client_workout_sets_workout_id_exercise_position_client_workout_exercises_workout_id_position_fk" FOREIGN KEY ("workout_id","exercise_position") REFERENCES "public"."client_workout_exercises"("workout_id","position") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_workouts" ADD CONSTRAINT "client_workouts_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_workouts" ADD CONSTRAINT "client_workouts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_workouts" ADD CONSTRAINT "client_workouts_source_template_id_workout_templates_id_fk" FOREIGN KEY ("source_template_id") REFERENCES "public"."workout_templates"("id") ON DELETE set null ON UPDATE no action;