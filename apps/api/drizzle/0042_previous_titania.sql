ALTER TABLE "messages" ADD COLUMN "kind" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "task_done" boolean;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "task_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_kind_chk" CHECK ("messages"."kind" IN ('text', 'task', 'system'));