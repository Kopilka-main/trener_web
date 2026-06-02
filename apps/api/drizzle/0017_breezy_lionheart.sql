ALTER TABLE "clients" ADD COLUMN "contacts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;