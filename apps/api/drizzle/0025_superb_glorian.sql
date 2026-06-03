ALTER TABLE "client_accounts" ADD COLUMN "birth_date" text;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "contacts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "bio" text;