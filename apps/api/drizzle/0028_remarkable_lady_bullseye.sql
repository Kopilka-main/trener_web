ALTER TABLE "files" ALTER COLUMN "trainer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "avatar_file_id" text;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_account_id_client_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_avatar_file_id_files_id_fk" FOREIGN KEY ("avatar_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;