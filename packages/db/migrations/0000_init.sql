CREATE TYPE "public"."activity_actor" AS ENUM('user', 'agent', 'chat', 'system');--> statement-breakpoint
CREATE TYPE "public"."activity_entity" AS ENUM('profile', 'targets', 'schedule', 'cv', 'opportunity', 'pipeline_item', 'draft', 'follow_up', 'user');--> statement-breakpoint
CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant', 'tool');--> statement-breakpoint
CREATE TYPE "public"."chat_screen" AS ENUM('today', 'review', 'pipeline', 'cvs', 'profile', 'settings');--> statement-breakpoint
CREATE TYPE "public"."cv_kind" AS ENUM('master', 'special');--> statement-breakpoint
CREATE TYPE "public"."cv_origin" AS ENUM('generated', 'original');--> statement-breakpoint
CREATE TYPE "public"."cv_status" AS ENUM('generating', 'needs_review', 'confirmed', 'ready_to_send', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."draft_kind" AS ENUM('cover_text', 'form_answer', 'follow_up', 'event_prep');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."email_template" AS ENUM('welcome', 'finish_setup_reminder', 'agent_live', 'run_digest');--> statement-breakpoint
CREATE TYPE "public"."experience_band" AS ENUM('lt_1', '1_3', '3_5', '5_10', '10_plus');--> statement-breakpoint
CREATE TYPE "public"."feed_status" AS ENUM('new', 'pursued', 'skipped', 'dismissed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."file_format" AS ENUM('pdf', 'docx');--> statement-breakpoint
CREATE TYPE "public"."follow_up_status" AS ENUM('pending', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."llm_task" AS ENUM('parse_cv', 'suggest', 'rank', 'write_cv', 'write_drafts', 'chat');--> statement-breakpoint
CREATE TYPE "public"."notice_period" AS ENUM('immediately', '2_weeks', '1_month', '2_months', '3_months', 'more');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step" AS ENUM('upload', 'confirm_profile', 'set_targets', 'schedule');--> statement-breakpoint
CREATE TYPE "public"."opportunity_type" AS ENUM('job', 'event');--> statement-breakpoint
CREATE TYPE "public"."parse_status" AS ENUM('pending', 'extracting', 'parsing', 'parsed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."pipeline_status" AS ENUM('preparing', 'ready_to_send', 'sent', 'registered', 'replied', 'interview', 'offer', 'no_reply', 'rejected', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."route" AS ENUM('auto', 'direct', 'event');--> statement-breakpoint
CREATE TYPE "public"."run_frequency" AS ENUM('daily', 'every_3_days', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('scheduled', 'manual');--> statement-breakpoint
CREATE TYPE "public"."salary_period" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "public"."skip_reason" AS ENUM('just_skip', 'not_relevant', 'wrong_location', 'wrong_seniority', 'company_excluded', 'already_applied', 'other');--> statement-breakpoint
CREATE TYPE "public"."source_run_status" AS ENUM('running', 'succeeded', 'failed', 'timed_out', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
CREATE TYPE "public"."upload_kind" AS ENUM('cv_original');--> statement-breakpoint
CREATE TYPE "public"."work_format" AS ENUM('remote', 'hybrid', 'onsite');--> statement-breakpoint
CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"actor" "activity_actor" NOT NULL,
	"entity" "activity_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"undoable_until" timestamp with time zone,
	"undone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trigger" "run_trigger" NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"candidates_count" integer DEFAULT 0 NOT NULL,
	"new_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"agent_run_id" uuid,
	"task" "llm_task" NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"succeeded" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"timezone" text DEFAULT 'Europe/Prague' NOT NULL,
	"theme" "theme" DEFAULT 'system' NOT NULL,
	"paused_at" timestamp with time zone,
	"onboarding_step" "onboarding_step" DEFAULT 'upload' NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"email_unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" "chat_role" NOT NULL,
	"content" text NOT NULL,
	"context" jsonb,
	"tool_calls" jsonb,
	"activity_ids" uuid[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_thread" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_thread_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "cv" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "cv_kind" NOT NULL,
	"origin" "cv_origin" DEFAULT 'generated' NOT NULL,
	"version" smallint DEFAULT 1 NOT NULL,
	"status" "cv_status" DEFAULT 'generating' NOT NULL,
	"content" jsonb,
	"changes" text[] DEFAULT '{}' NOT NULL,
	"based_on_cv_id" uuid,
	"upload_id" uuid,
	"pipeline_item_id" uuid,
	"page_count" smallint,
	"error" text,
	"confirmed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cv_kind_link" CHECK (("cv"."kind" = 'master' and "cv"."pipeline_item_id" is null) or ("cv"."kind" = 'special' and "cv"."pipeline_item_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "cv_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cv_id" uuid NOT NULL,
	"format" "file_format" NOT NULL,
	"content_hash" text NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "upload_kind" DEFAULT 'cv_original' NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"page_count" smallint,
	"parse_status" "parse_status" DEFAULT 'pending' NOT NULL,
	"parse_error" text,
	"extracted_text" text,
	"parsed_content" jsonb,
	"replaced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"template" "email_template" NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_log_dedupeKey_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "opportunity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"type" "opportunity_type" NOT NULL,
	"job_posting_id" uuid,
	"event_listing_id" uuid,
	"fit_score" smallint,
	"why" text,
	"gap_note" text,
	"route" "route" DEFAULT 'auto' NOT NULL,
	"route_reason" text,
	"feed_status" "feed_status" DEFAULT 'new' NOT NULL,
	"skip_reason" "skip_reason",
	"skip_note" text,
	"feed_status_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_target" CHECK (("opportunity"."type" = 'job' and "opportunity"."job_posting_id" is not null and "opportunity"."event_listing_id" is null)
       or ("opportunity"."type" = 'event' and "opportunity"."event_listing_id" is not null and "opportunity"."job_posting_id" is null)),
	CONSTRAINT "opportunity_fit_score" CHECK ("opportunity"."fit_score" is null or "opportunity"."fit_score" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "draft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_item_id" uuid NOT NULL,
	"kind" "draft_kind" NOT NULL,
	"label" text,
	"body" text NOT NULL,
	"char_limit" smallint,
	"position" smallint DEFAULT 0 NOT NULL,
	"version" smallint DEFAULT 1 NOT NULL,
	"edited_by_user_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_up" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_item_id" uuid NOT NULL,
	"sequence" smallint NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" "follow_up_status" DEFAULT 'pending' NOT NULL,
	"draft_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_item_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"route" "route" NOT NULL,
	"status" "pipeline_status" DEFAULT 'preparing' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"registered_at" timestamp with time zone,
	"interview_at" timestamp with time zone,
	"next_follow_up_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_item_opportunityId_unique" UNIQUE("opportunity_id")
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"full_name" text,
	"current_title" text,
	"experience" "experience_band",
	"location" text,
	"linkedin_url" text,
	"portfolio_url" text,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"summary" text,
	"salary_min" integer,
	"salary_max" integer,
	"salary_currency" text,
	"salary_period" "salary_period",
	"notice_period" "notice_period",
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_salary_range" CHECK ("profile"."salary_max" is null or "profile"."salary_min" is null or "profile"."salary_max" >= "profile"."salary_min")
);
--> statement-breakpoint
CREATE TABLE "profile_proof" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"frequency" "run_frequency" DEFAULT 'daily' NOT NULL,
	"run_hour" smallint DEFAULT 8 NOT NULL,
	"day_of_week" smallint,
	"notify_email" boolean DEFAULT true NOT NULL,
	"notify_push" boolean DEFAULT false NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_run_hour" CHECK ("schedule"."run_hour" between 0 and 23),
	CONSTRAINT "schedule_day_of_week" CHECK (("schedule"."frequency" = 'weekly') = ("schedule"."day_of_week" is not null) and ("schedule"."day_of_week" is null or "schedule"."day_of_week" between 1 and 7))
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"roles" text[] DEFAULT '{}' NOT NULL,
	"locations" text[] DEFAULT '{}' NOT NULL,
	"work_formats" "work_format"[] DEFAULT '{remote,hybrid}' NOT NULL,
	"exclusions" text[] DEFAULT '{}' NOT NULL,
	"find_jobs" boolean DEFAULT true NOT NULL,
	"find_events" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "targets_find_any" CHECK ("targets"."find_jobs" or "targets"."find_events")
);
--> statement-breakpoint
CREATE TABLE "event_listing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text,
	"url" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"title" text NOT NULL,
	"organizer" text,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"venue" text,
	"city" text,
	"country" text,
	"online" boolean DEFAULT false NOT NULL,
	"language" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_listing_dedupeKey_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "job_posting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text,
	"url" text NOT NULL,
	"canonical_url" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"description" text,
	"location_raw" text,
	"city" text,
	"region" text,
	"country" text,
	"work_formats" "work_format"[] DEFAULT '{}' NOT NULL,
	"language" text,
	"salary_raw" text,
	"posted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expired_at" timestamp with time zone,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_posting_dedupeKey_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" "opportunity_type" NOT NULL,
	"base_url" text NOT NULL,
	"apify_actor_id" text NOT NULL,
	"input_template" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cron" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "source_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"apify_run_id" text NOT NULL,
	"apify_dataset_id" text,
	"status" "source_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"items_count" integer,
	"ingested_count" integer,
	"cost_usd" numeric(10, 4),
	"error" text,
	CONSTRAINT "source_run_apifyRunId_unique" UNIQUE("apify_run_id")
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_agent_run_id_agent_run_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_thread_id_chat_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_thread" ADD CONSTRAINT "chat_thread_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv" ADD CONSTRAINT "cv_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv" ADD CONSTRAINT "cv_based_on_cv_id_cv_id_fk" FOREIGN KEY ("based_on_cv_id") REFERENCES "public"."cv"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv" ADD CONSTRAINT "cv_upload_id_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."upload"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv" ADD CONSTRAINT "cv_pipeline_item_id_pipeline_item_id_fk" FOREIGN KEY ("pipeline_item_id") REFERENCES "public"."pipeline_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_file" ADD CONSTRAINT "cv_file_cv_id_cv_id_fk" FOREIGN KEY ("cv_id") REFERENCES "public"."cv"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload" ADD CONSTRAINT "upload_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_agent_run_id_agent_run_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_job_posting_id_job_posting_id_fk" FOREIGN KEY ("job_posting_id") REFERENCES "public"."job_posting"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_event_listing_id_event_listing_id_fk" FOREIGN KEY ("event_listing_id") REFERENCES "public"."event_listing"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft" ADD CONSTRAINT "draft_pipeline_item_id_pipeline_item_id_fk" FOREIGN KEY ("pipeline_item_id") REFERENCES "public"."pipeline_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up" ADD CONSTRAINT "follow_up_pipeline_item_id_pipeline_item_id_fk" FOREIGN KEY ("pipeline_item_id") REFERENCES "public"."pipeline_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up" ADD CONSTRAINT "follow_up_draft_id_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."draft"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_pipeline_item_id_pipeline_item_id_fk" FOREIGN KEY ("pipeline_item_id") REFERENCES "public"."pipeline_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_item" ADD CONSTRAINT "pipeline_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_item" ADD CONSTRAINT "pipeline_item_opportunity_id_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_proof" ADD CONSTRAINT "profile_proof_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_listing" ADD CONSTRAINT "event_listing_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_posting" ADD CONSTRAINT "job_posting_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_run" ADD CONSTRAINT "source_run_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_user_id_created_at_index" ON "activity" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_entity_entity_id_index" ON "activity" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "agent_run_user_id_created_at_index" ON "agent_run" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_one_active_per_user" ON "agent_run" USING btree ("user_id") WHERE "agent_run"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "llm_usage_user_id_created_at_index" ON "llm_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "llm_usage_agent_run_id_index" ON "llm_usage" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "account_user_id_index" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_index" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_index" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "chat_message_thread_id_created_at_index" ON "chat_message" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cv_master_version" ON "cv" USING btree ("user_id","version") WHERE "cv"."kind" = 'master';--> statement-breakpoint
CREATE UNIQUE INDEX "cv_special_per_item" ON "cv" USING btree ("pipeline_item_id") WHERE "cv"."kind" = 'special';--> statement-breakpoint
CREATE INDEX "cv_user_id_kind_index" ON "cv" USING btree ("user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "cv_file_cv_id_format_content_hash_index" ON "cv_file" USING btree ("cv_id","format","content_hash");--> statement-breakpoint
CREATE INDEX "upload_user_id_created_at_index" ON "upload" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "email_log_user_id_created_at_index" ON "email_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "push_subscription_user_id_index" ON "push_subscription" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_user_id_job_posting_id_index" ON "opportunity" USING btree ("user_id","job_posting_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_user_id_event_listing_id_index" ON "opportunity" USING btree ("user_id","event_listing_id");--> statement-breakpoint
CREATE INDEX "opportunity_user_id_feed_status_created_at_index" ON "opportunity" USING btree ("user_id","feed_status","created_at");--> statement-breakpoint
CREATE INDEX "draft_pipeline_item_id_position_index" ON "draft" USING btree ("pipeline_item_id","position");--> statement-breakpoint
CREATE INDEX "follow_up_status_due_at_index" ON "follow_up" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "follow_up_pipeline_item_id_index" ON "follow_up" USING btree ("pipeline_item_id");--> statement-breakpoint
CREATE INDEX "note_pipeline_item_id_index" ON "note" USING btree ("pipeline_item_id");--> statement-breakpoint
CREATE INDEX "pipeline_item_user_id_status_index" ON "pipeline_item" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "pipeline_item_user_id_next_follow_up_at_index" ON "pipeline_item" USING btree ("user_id","next_follow_up_at");--> statement-breakpoint
CREATE INDEX "profile_proof_user_id_position_index" ON "profile_proof" USING btree ("user_id","position");--> statement-breakpoint
CREATE INDEX "schedule_next_run_at_index" ON "schedule" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "event_listing_starts_at_index" ON "event_listing" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "job_posting_last_seen_at_index" ON "job_posting" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "job_posting_country_city_index" ON "job_posting" USING btree ("country","city");--> statement-breakpoint
CREATE INDEX "source_run_source_id_started_at_index" ON "source_run" USING btree ("source_id","started_at");