ALTER TABLE "messages" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "messages" SET "pinned" = true WHERE "id" IN (SELECT "pinned_message_id" FROM "conversations" WHERE "pinned_message_id" IS NOT NULL);