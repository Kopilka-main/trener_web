CREATE TABLE "measurement_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"trainer_id" text NOT NULL,
	"client_id" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "measurements" ADD COLUMN "biceps_cm" double precision;--> statement-breakpoint
ALTER TABLE "measurements" ADD COLUMN "underbust_cm" double precision;--> statement-breakpoint
ALTER TABLE "measurements" ADD COLUMN "belly_cm" double precision;--> statement-breakpoint
ALTER TABLE "measurements" ADD COLUMN "glutes_cm" double precision;--> statement-breakpoint
ALTER TABLE "measurements" ADD COLUMN "thigh_cm" double precision;--> statement-breakpoint
ALTER TABLE "measurements" ADD COLUMN "calf_cm" double precision;--> statement-breakpoint
ALTER TABLE "measurement_tasks" ADD CONSTRAINT "measurement_tasks_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_tasks" ADD CONSTRAINT "measurement_tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_measurement_tasks_trainer_client" ON "measurement_tasks" USING btree ("trainer_id","client_id");