CREATE TABLE "device_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"client_account_id" text,
	"trainer_id" text,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_tokens_token_unique" UNIQUE("token"),
	CONSTRAINT "device_tokens_owner_chk" CHECK (("device_tokens"."client_account_id" IS NOT NULL) <> ("device_tokens"."trainer_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_device_tokens_account" ON "device_tokens" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "idx_device_tokens_trainer" ON "device_tokens" USING btree ("trainer_id");