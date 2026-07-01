CREATE TABLE "payment_installments" (
	"id" text PRIMARY KEY NOT NULL,
	"trainer_id" text NOT NULL,
	"client_id" text NOT NULL,
	"package_id" text NOT NULL,
	"due_date" text NOT NULL,
	"amount" double precision NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_installments_status_chk" CHECK ("payment_installments"."status" IN ('pending', 'paid'))
);
--> statement-breakpoint
ALTER TABLE "payment_packages" ADD COLUMN "is_installment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_installments" ADD CONSTRAINT "payment_installments_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_installments" ADD CONSTRAINT "payment_installments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_installments" ADD CONSTRAINT "payment_installments_package_id_payment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."payment_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_payment_installments_package" ON "payment_installments" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "idx_payment_installments_due_date" ON "payment_installments" USING btree ("due_date");