ALTER TABLE "expenses" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "incomes" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_packages" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;