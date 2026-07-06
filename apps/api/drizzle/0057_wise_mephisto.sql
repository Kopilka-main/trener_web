CREATE TABLE "support_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"trainer_id" text,
	"client_account_id" text,
	"email" text,
	"name" text,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_messages_source_chk" CHECK ("support_messages"."source" IN ('trainer', 'client'))
);
