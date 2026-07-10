ALTER TABLE "support_messages" ADD COLUMN "attachment_file_id" text;--> statement-breakpoint
ALTER TABLE "support_messages" ADD COLUMN "attachment_kind" text;--> statement-breakpoint
ALTER TABLE "support_messages" ADD COLUMN "attachment_name" text;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_attachment_file_id_files_id_fk" FOREIGN KEY ("attachment_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;