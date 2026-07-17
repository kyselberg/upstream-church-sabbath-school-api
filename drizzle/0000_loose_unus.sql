CREATE TYPE "public"."agent_status" AS ENUM('received', 'applied', 'rejected', 'failed', 'undone');--> statement-breakpoint
CREATE TYPE "public"."announcement_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."announcement_type" AS ENUM('weekly_reminder', 'change', 'custom');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('planned', 'confirmed', 'needs_substitute', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."change_source" AS ENUM('web', 'telegram', 'system');--> statement-breakpoint
CREATE TYPE "public"."change_type" AS ENUM('assign', 'reassign', 'swap', 'substitute', 'unassign', 'cancel');--> statement-breakpoint
CREATE TABLE "agent_action_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_user_id" bigint,
	"member_id" uuid,
	"chat_id" bigint,
	"update_id" bigint,
	"message_text" text,
	"tool_name" text,
	"tool_args" jsonb,
	"result" jsonb,
	"status" "agent_status" DEFAULT 'received' NOT NULL,
	"change_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "announcement_type" NOT NULL,
	"target_date" date,
	"chat_id" bigint NOT NULL,
	"message_id" bigint,
	"payload" jsonb,
	"status" "announcement_status" DEFAULT 'pending' NOT NULL,
	"change_id" uuid,
	"swap_group_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"telegram_group_chat_id" bigint,
	"timezone" text DEFAULT 'Europe/Kyiv' NOT NULL,
	"reminder_weekday" integer DEFAULT 3 NOT NULL,
	"reminder_hour" integer DEFAULT 9 NOT NULL,
	"reminder_minute" integer DEFAULT 0 NOT NULL,
	"pin_weekly" boolean DEFAULT true NOT NULL,
	"undo_window_minutes" integer DEFAULT 30 NOT NULL,
	"llm_model" text DEFAULT 'anthropic:claude-sonnet-4-6' NOT NULL,
	"bot_locale" text DEFAULT 'uk' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"date" date NOT NULL,
	"quarter_id" uuid,
	"member_id" uuid,
	"original_member_id" uuid,
	"status" "assignment_status" DEFAULT 'planned' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_class_date_uq" UNIQUE("class_id","date")
);
--> statement-breakpoint
CREATE TABLE "assignment_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"swap_group_id" uuid,
	"type" "change_type" NOT NULL,
	"from_member_id" uuid,
	"to_member_id" uuid,
	"actor_member_id" uuid,
	"source" "change_source" NOT NULL,
	"reason" text,
	"announced" boolean DEFAULT false NOT NULL,
	"undone_at" timestamp with time zone,
	"undone_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_teacher" (
	"class_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_teacher_class_id_member_id_pk" PRIMARY KEY("class_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "class" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"display_name" text,
	"phone" text,
	"telegram_user_id" bigint,
	"telegram_username" text,
	"telegram_linked_at" timestamp with time zone,
	"user_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"scope_class_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"description" text,
	CONSTRAINT "permission_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "quarter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "role_permission" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permission_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "telegram_link_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"member_id" uuid NOT NULL,
	"created_by_member_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_link_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_action_log" ADD CONSTRAINT "agent_action_log_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action_log" ADD CONSTRAINT "agent_action_log_change_id_assignment_change_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."assignment_change"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_change_id_assignment_change_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."assignment_change"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_quarter_id_quarter_id_fk" FOREIGN KEY ("quarter_id") REFERENCES "public"."quarter"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_original_member_id_member_id_fk" FOREIGN KEY ("original_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_change" ADD CONSTRAINT "assignment_change_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_change" ADD CONSTRAINT "assignment_change_from_member_id_member_id_fk" FOREIGN KEY ("from_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_change" ADD CONSTRAINT "assignment_change_to_member_id_member_id_fk" FOREIGN KEY ("to_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_change" ADD CONSTRAINT "assignment_change_actor_member_id_member_id_fk" FOREIGN KEY ("actor_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_change" ADD CONSTRAINT "assignment_change_undone_by_member_id_member_id_fk" FOREIGN KEY ("undone_by_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher" ADD CONSTRAINT "class_teacher_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher" ADD CONSTRAINT "class_teacher_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_role" ADD CONSTRAINT "member_role_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_role" ADD CONSTRAINT "member_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_role" ADD CONSTRAINT "member_role_scope_class_id_class_id_fk" FOREIGN KEY ("scope_class_id") REFERENCES "public"."class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_token" ADD CONSTRAINT "telegram_link_token_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_token" ADD CONSTRAINT "telegram_link_token_created_by_member_id_member_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_action_log_update_uq" ON "agent_action_log" USING btree ("update_id");--> statement-breakpoint
CREATE INDEX "agent_action_log_member_idx" ON "agent_action_log" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_type_date_uq" ON "announcement" USING btree ("type","target_date");--> statement-breakpoint
CREATE INDEX "assignment_date_idx" ON "assignment" USING btree ("date");--> statement-breakpoint
CREATE INDEX "assignment_member_idx" ON "assignment" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "assignment_change_assignment_idx" ON "assignment_change" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "assignment_change_swap_idx" ON "assignment_change" USING btree ("swap_group_id");--> statement-breakpoint
CREATE INDEX "assignment_change_created_idx" ON "assignment_change" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "member_telegram_user_id_uq" ON "member" USING btree ("telegram_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_user_id_uq" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "member_active_idx" ON "member" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "member_role_uq" ON "member_role" USING btree ("member_id","role_id","scope_class_id");--> statement-breakpoint
CREATE INDEX "member_role_member_idx" ON "member_role" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "telegram_link_token_member_idx" ON "telegram_link_token" USING btree ("member_id");