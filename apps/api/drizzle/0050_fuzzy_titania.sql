ALTER TABLE "client_accounts" ADD COLUMN "pending_deletion_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "pending_deletion_at" timestamp with time zone;