ALTER TABLE "app_settings" ALTER COLUMN "llm_model" SET DEFAULT 'claude-sonnet-4-6';--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "llm_provider" text DEFAULT 'anthropic' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "llm_api_key" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "llm_base_url" text;