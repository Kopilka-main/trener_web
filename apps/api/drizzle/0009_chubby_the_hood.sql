CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"trainer_id" text NOT NULL,
	"category" text NOT NULL,
	"amount" double precision NOT NULL,
	"date" text NOT NULL,
	"gym_id" text,
	"client_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gyms" (
	"id" text PRIMARY KEY NOT NULL,
	"trainer_id" text NOT NULL,
	"name" text NOT NULL,
	"monthly_rent" double precision,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incomes" (
	"id" text PRIMARY KEY NOT NULL,
	"trainer_id" text NOT NULL,
	"category" text NOT NULL,
	"amount" double precision NOT NULL,
	"date" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_expenses_trainer_date" ON "expenses" USING btree ("trainer_id","date");--> statement-breakpoint
CREATE INDEX "idx_incomes_trainer_date" ON "incomes" USING btree ("trainer_id","date");