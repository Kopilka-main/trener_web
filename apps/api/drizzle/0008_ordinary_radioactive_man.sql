CREATE TABLE "payment_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"trainer_id" text NOT NULL,
	"client_id" text NOT NULL,
	"lessons_paid" integer NOT NULL,
	"price_per_lesson" double precision NOT NULL,
	"total_paid" double precision NOT NULL,
	"workout_type" text,
	"starts_at" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_packages_status_chk" CHECK ("payment_packages"."status" IN ('active', 'closed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "payment_packages" ADD CONSTRAINT "payment_packages_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_packages" ADD CONSTRAINT "payment_packages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_payment_packages_trainer_client" ON "payment_packages" USING btree ("trainer_id","client_id");