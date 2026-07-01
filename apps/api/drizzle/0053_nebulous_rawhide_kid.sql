CREATE TABLE "email_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"code" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_codes_subject_type_chk" CHECK ("email_codes"."subject_type" IN ('trainer', 'client'))
);
--> statement-breakpoint
CREATE INDEX "idx_email_codes_subject" ON "email_codes" USING btree ("subject_type","subject_id");