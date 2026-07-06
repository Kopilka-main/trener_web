ALTER TABLE "support_messages" ADD COLUMN "direction" text DEFAULT 'in' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_messages" ADD COLUMN "telegram_topic_id" bigint;--> statement-breakpoint
CREATE INDEX "support_messages_topic_idx" ON "support_messages" USING btree ("telegram_topic_id");--> statement-breakpoint
CREATE INDEX "support_messages_trainer_idx" ON "support_messages" USING btree ("trainer_id");--> statement-breakpoint
CREATE INDEX "support_messages_client_idx" ON "support_messages" USING btree ("client_account_id");--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_direction_chk" CHECK ("support_messages"."direction" IN ('in', 'out'));