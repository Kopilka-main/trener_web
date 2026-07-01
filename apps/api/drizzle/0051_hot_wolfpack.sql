ALTER TABLE "trainers" ADD COLUMN "calendar_token" text;--> statement-breakpoint
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_calendar_token_unique" UNIQUE("calendar_token");