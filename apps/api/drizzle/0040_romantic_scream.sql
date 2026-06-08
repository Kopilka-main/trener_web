ALTER TABLE "payment_packages" ADD COLUMN "kind" text DEFAULT 'package' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_packages" ADD COLUMN "paid_at" text;--> statement-breakpoint
ALTER TABLE "payment_packages" ADD COLUMN "ends_at" text;