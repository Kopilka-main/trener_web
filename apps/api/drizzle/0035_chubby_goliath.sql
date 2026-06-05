ALTER TABLE "push_subscriptions" ALTER COLUMN "client_account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "trainer_id" text;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_push_subs_trainer" ON "push_subscriptions" USING btree ("trainer_id");--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subs_owner_chk" CHECK (("push_subscriptions"."client_account_id" IS NOT NULL) <> ("push_subscriptions"."trainer_id" IS NOT NULL));