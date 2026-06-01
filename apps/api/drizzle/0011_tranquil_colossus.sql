CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"trainer_id" text NOT NULL,
	"client_id" text NOT NULL,
	"last_message_at" timestamp with time zone,
	"trainer_last_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_role" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_sender_role_chk" CHECK ("messages"."sender_role" IN ('trainer', 'client'))
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_trainer_client_uq" ON "conversations" USING btree ("trainer_id","client_id");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_created" ON "messages" USING btree ("conversation_id","created_at");