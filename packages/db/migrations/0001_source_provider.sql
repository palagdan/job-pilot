CREATE TYPE "public"."source_provider" AS ENUM('apify', 'mpsv_open_data');--> statement-breakpoint
ALTER TABLE "source" ALTER COLUMN "apify_actor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "source" ADD COLUMN "provider" "source_provider" DEFAULT 'apify' NOT NULL;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_apify_actor_required" CHECK (("source"."provider" = 'apify' and "source"."apify_actor_id" is not null) or ("source"."provider" <> 'apify' and "source"."apify_actor_id" is null));