ALTER TABLE "incomes" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "payment_packages" ADD COLUMN "lessons_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;