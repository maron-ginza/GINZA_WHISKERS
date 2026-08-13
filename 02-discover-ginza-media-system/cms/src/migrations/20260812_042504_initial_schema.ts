import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('ja', 'en');
  CREATE TYPE "public"."enum_users_role" AS ENUM('editor_in_chief', 'editor');
  CREATE TYPE "public"."enum_articles_images_role" AS ENUM('hero', 'inline', 'gallery');
  CREATE TYPE "public"."enum_articles_images_variant" AS ENUM('gallery', 'instagram_square', 'instagram_portrait', 'x_landscape', 'note_header');
  CREATE TYPE "public"."enum_articles_publish_history_channel" AS ENUM('site', 'note', 'x', 'instagram', 'newsletter');
  CREATE TYPE "public"."enum_articles_review_status" AS ENUM('draft', 'review', 'approved', 'published');
  CREATE TYPE "public"."enum_articles_historical_period" AS ENUM('meiji_taisho', 'showa_prewar', 'showa_postwar_30s', 'showa_40_50s', 'heisei_onwards');
  CREATE TYPE "public"."enum_articles_translation_status_ja" AS ENUM('not_started', 'in_progress', 'complete');
  CREATE TYPE "public"."enum_articles_translation_status_en" AS ENUM('not_started', 'in_progress', 'complete');
  CREATE TYPE "public"."enum_articles_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__articles_v_version_images_role" AS ENUM('hero', 'inline', 'gallery');
  CREATE TYPE "public"."enum__articles_v_version_images_variant" AS ENUM('gallery', 'instagram_square', 'instagram_portrait', 'x_landscape', 'note_header');
  CREATE TYPE "public"."enum__articles_v_version_publish_history_channel" AS ENUM('site', 'note', 'x', 'instagram', 'newsletter');
  CREATE TYPE "public"."enum__articles_v_version_review_status" AS ENUM('draft', 'review', 'approved', 'published');
  CREATE TYPE "public"."enum__articles_v_version_historical_period" AS ENUM('meiji_taisho', 'showa_prewar', 'showa_postwar_30s', 'showa_40_50s', 'heisei_onwards');
  CREATE TYPE "public"."enum__articles_v_version_translation_status_ja" AS ENUM('not_started', 'in_progress', 'complete');
  CREATE TYPE "public"."enum__articles_v_version_translation_status_en" AS ENUM('not_started', 'in_progress', 'complete');
  CREATE TYPE "public"."enum__articles_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__articles_v_published_locale" AS ENUM('ja', 'en');
  CREATE TYPE "public"."enum_sources_type" AS ENUM('url', 'text_note', 'image', 'pdf');
  CREATE TYPE "public"."enum_sources_status" AS ENUM('untouched', 'in_progress', 'used');
  CREATE TYPE "public"."enum_sources_editorial_editorial_status" AS ENUM('inbox', 'review', 'editors-choice', 'approved', 'published', 'rejected');
  CREATE TYPE "public"."enum_tags_type" AS ENUM('pillar', 'free');
  CREATE TYPE "public"."enum_social_posts_channel" AS ENUM('note', 'x', 'instagram');
  CREATE TYPE "public"."enum_social_posts_status" AS ENUM('pending', 'ready', 'sent', 'failed');
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"role" "enum_users_role" DEFAULT 'editor' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "articles_images" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"asset_id" integer,
  	"role" "enum_articles_images_role",
  	"variant" "enum_articles_images_variant"
  );
  
  CREATE TABLE "articles_images_locales" (
  	"caption" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "articles_publish_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"channel" "enum_articles_publish_history_channel",
  	"published_at" timestamp(3) with time zone,
  	"published_by_id" integer,
  	"reference" varchar
  );
  
  CREATE TABLE "articles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"review_status" "enum_articles_review_status" DEFAULT 'draft',
  	"accession_number" varchar,
  	"represented_year" numeric,
  	"historical_period" "enum_articles_historical_period",
  	"seo_og_image_id" integer,
  	"translation_status_ja" "enum_articles_translation_status_ja" DEFAULT 'not_started',
  	"translation_status_en" "enum_articles_translation_status_en" DEFAULT 'not_started',
  	"ai_generated_by" varchar,
  	"reviewed_by_id" integer,
  	"approved_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_articles_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "articles_locales" (
  	"title" varchar,
  	"slug" varchar,
  	"body" jsonb,
  	"seo_meta_title" varchar,
  	"seo_meta_description" varchar,
  	"social_copy_note" varchar,
  	"social_copy_x" varchar,
  	"social_copy_instagram" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "articles_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" integer,
  	"sources_id" integer
  );
  
  CREATE TABLE "_articles_v_version_images" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"asset_id" integer,
  	"role" "enum__articles_v_version_images_role",
  	"variant" "enum__articles_v_version_images_variant",
  	"_uuid" varchar
  );
  
  CREATE TABLE "_articles_v_version_images_locales" (
  	"caption" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_articles_v_version_publish_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"channel" "enum__articles_v_version_publish_history_channel",
  	"published_at" timestamp(3) with time zone,
  	"published_by_id" integer,
  	"reference" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_articles_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_review_status" "enum__articles_v_version_review_status" DEFAULT 'draft',
  	"version_accession_number" varchar,
  	"version_represented_year" numeric,
  	"version_historical_period" "enum__articles_v_version_historical_period",
  	"version_seo_og_image_id" integer,
  	"version_translation_status_ja" "enum__articles_v_version_translation_status_ja" DEFAULT 'not_started',
  	"version_translation_status_en" "enum__articles_v_version_translation_status_en" DEFAULT 'not_started',
  	"version_ai_generated_by" varchar,
  	"version_reviewed_by_id" integer,
  	"version_approved_by_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__articles_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__articles_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_articles_v_locales" (
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_body" jsonb,
  	"version_seo_meta_title" varchar,
  	"version_seo_meta_description" varchar,
  	"version_social_copy_note" varchar,
  	"version_social_copy_x" varchar,
  	"version_social_copy_instagram" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_articles_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" integer,
  	"sources_id" integer
  );
  
  CREATE TABLE "sources" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"type" "enum_sources_type" NOT NULL,
  	"content_ref" varchar NOT NULL,
  	"status" "enum_sources_status" DEFAULT 'untouched' NOT NULL,
  	"editorial_editorial_status" "enum_sources_editorial_editorial_status" DEFAULT 'inbox' NOT NULL,
  	"editorial_retrieved_at" timestamp(3) with time zone,
  	"editorial_ai_summary" varchar,
  	"editorial_ai_evaluation_reason" varchar,
  	"editorial_editors_choice_reason" varchar,
  	"editorial_rejection_reason" varchar,
  	"editorial_decision_by_id" integer,
  	"editorial_decision_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "sources_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" integer
  );
  
  CREATE TABLE "image_assets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"rights_owner" varchar NOT NULL,
  	"rights_license_type" varchar NOT NULL,
  	"rights_usage_notes" varchar,
  	"rights_requires_attribution" boolean DEFAULT false,
  	"alt_text_ja" varchar,
  	"alt_text_en" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_gallery_url" varchar,
  	"sizes_gallery_width" numeric,
  	"sizes_gallery_height" numeric,
  	"sizes_gallery_mime_type" varchar,
  	"sizes_gallery_filesize" numeric,
  	"sizes_gallery_filename" varchar,
  	"sizes_instagram_square_url" varchar,
  	"sizes_instagram_square_width" numeric,
  	"sizes_instagram_square_height" numeric,
  	"sizes_instagram_square_mime_type" varchar,
  	"sizes_instagram_square_filesize" numeric,
  	"sizes_instagram_square_filename" varchar,
  	"sizes_instagram_portrait_url" varchar,
  	"sizes_instagram_portrait_width" numeric,
  	"sizes_instagram_portrait_height" numeric,
  	"sizes_instagram_portrait_mime_type" varchar,
  	"sizes_instagram_portrait_filesize" numeric,
  	"sizes_instagram_portrait_filename" varchar,
  	"sizes_x_landscape_url" varchar,
  	"sizes_x_landscape_width" numeric,
  	"sizes_x_landscape_height" numeric,
  	"sizes_x_landscape_mime_type" varchar,
  	"sizes_x_landscape_filesize" numeric,
  	"sizes_x_landscape_filename" varchar,
  	"sizes_note_header_url" varchar,
  	"sizes_note_header_width" numeric,
  	"sizes_note_header_height" numeric,
  	"sizes_note_header_mime_type" varchar,
  	"sizes_note_header_filesize" numeric,
  	"sizes_note_header_filename" varchar
  );
  
  CREATE TABLE "image_assets_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" integer
  );
  
  CREATE TABLE "tags" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"type" "enum_tags_type" NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tags_locales" (
  	"name" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "social_posts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"article_id" integer NOT NULL,
  	"channel" "enum_social_posts_channel" NOT NULL,
  	"dedupe_key" varchar,
  	"copy_ja" varchar,
  	"copy_en" varchar,
  	"status" "enum_social_posts_status" DEFAULT 'pending' NOT NULL,
  	"ready_by_id" integer,
  	"ready_at" timestamp(3) with time zone,
  	"sent_by_id" integer,
  	"sent_at" timestamp(3) with time zone,
  	"reference" varchar,
  	"failure_reason" varchar,
  	"generated_at" timestamp(3) with time zone,
  	"last_dry_run_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"articles_id" integer,
  	"sources_id" integer,
  	"image_assets_id" integer,
  	"tags_id" integer,
  	"social_posts_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_images" ADD CONSTRAINT "articles_images_asset_id_image_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."image_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles_images" ADD CONSTRAINT "articles_images_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_images_locales" ADD CONSTRAINT "articles_images_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles_images"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_publish_history" ADD CONSTRAINT "articles_publish_history_published_by_id_users_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles_publish_history" ADD CONSTRAINT "articles_publish_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_seo_og_image_id_image_assets_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "public"."image_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles_locales" ADD CONSTRAINT "articles_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_sources_fk" FOREIGN KEY ("sources_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_images" ADD CONSTRAINT "_articles_v_version_images_asset_id_image_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."image_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v_version_images" ADD CONSTRAINT "_articles_v_version_images_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_images_locales" ADD CONSTRAINT "_articles_v_version_images_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v_version_images"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_publish_history" ADD CONSTRAINT "_articles_v_version_publish_history_published_by_id_users_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v_version_publish_history" ADD CONSTRAINT "_articles_v_version_publish_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_parent_id_articles_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_seo_og_image_id_image_assets_id_fk" FOREIGN KEY ("version_seo_og_image_id") REFERENCES "public"."image_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_reviewed_by_id_users_id_fk" FOREIGN KEY ("version_reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_approved_by_id_users_id_fk" FOREIGN KEY ("version_approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v_locales" ADD CONSTRAINT "_articles_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_sources_fk" FOREIGN KEY ("sources_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sources" ADD CONSTRAINT "sources_editorial_decision_by_id_users_id_fk" FOREIGN KEY ("editorial_decision_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sources_rels" ADD CONSTRAINT "sources_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sources_rels" ADD CONSTRAINT "sources_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "image_assets_rels" ADD CONSTRAINT "image_assets_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."image_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "image_assets_rels" ADD CONSTRAINT "image_assets_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tags_locales" ADD CONSTRAINT "tags_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_ready_by_id_users_id_fk" FOREIGN KEY ("ready_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_sent_by_id_users_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sources_fk" FOREIGN KEY ("sources_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_image_assets_fk" FOREIGN KEY ("image_assets_id") REFERENCES "public"."image_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_posts_fk" FOREIGN KEY ("social_posts_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "articles_images_order_idx" ON "articles_images" USING btree ("_order");
  CREATE INDEX "articles_images_parent_id_idx" ON "articles_images" USING btree ("_parent_id");
  CREATE INDEX "articles_images_asset_idx" ON "articles_images" USING btree ("asset_id");
  CREATE UNIQUE INDEX "articles_images_locales_locale_parent_id_unique" ON "articles_images_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "articles_publish_history_order_idx" ON "articles_publish_history" USING btree ("_order");
  CREATE INDEX "articles_publish_history_parent_id_idx" ON "articles_publish_history" USING btree ("_parent_id");
  CREATE INDEX "articles_publish_history_published_by_idx" ON "articles_publish_history" USING btree ("published_by_id");
  CREATE UNIQUE INDEX "articles_accession_number_idx" ON "articles" USING btree ("accession_number");
  CREATE INDEX "articles_seo_seo_og_image_idx" ON "articles" USING btree ("seo_og_image_id");
  CREATE INDEX "articles_reviewed_by_idx" ON "articles" USING btree ("reviewed_by_id");
  CREATE INDEX "articles_approved_by_idx" ON "articles" USING btree ("approved_by_id");
  CREATE INDEX "articles_updated_at_idx" ON "articles" USING btree ("updated_at");
  CREATE INDEX "articles_created_at_idx" ON "articles" USING btree ("created_at");
  CREATE INDEX "articles__status_idx" ON "articles" USING btree ("_status");
  CREATE UNIQUE INDEX "articles_slug_idx" ON "articles_locales" USING btree ("slug","_locale");
  CREATE UNIQUE INDEX "articles_locales_locale_parent_id_unique" ON "articles_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "articles_rels_order_idx" ON "articles_rels" USING btree ("order");
  CREATE INDEX "articles_rels_parent_idx" ON "articles_rels" USING btree ("parent_id");
  CREATE INDEX "articles_rels_path_idx" ON "articles_rels" USING btree ("path");
  CREATE INDEX "articles_rels_tags_id_idx" ON "articles_rels" USING btree ("tags_id");
  CREATE INDEX "articles_rels_sources_id_idx" ON "articles_rels" USING btree ("sources_id");
  CREATE INDEX "_articles_v_version_images_order_idx" ON "_articles_v_version_images" USING btree ("_order");
  CREATE INDEX "_articles_v_version_images_parent_id_idx" ON "_articles_v_version_images" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_version_images_asset_idx" ON "_articles_v_version_images" USING btree ("asset_id");
  CREATE UNIQUE INDEX "_articles_v_version_images_locales_locale_parent_id_unique" ON "_articles_v_version_images_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_articles_v_version_publish_history_order_idx" ON "_articles_v_version_publish_history" USING btree ("_order");
  CREATE INDEX "_articles_v_version_publish_history_parent_id_idx" ON "_articles_v_version_publish_history" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_version_publish_history_published_by_idx" ON "_articles_v_version_publish_history" USING btree ("published_by_id");
  CREATE INDEX "_articles_v_parent_idx" ON "_articles_v" USING btree ("parent_id");
  CREATE INDEX "_articles_v_version_version_accession_number_idx" ON "_articles_v" USING btree ("version_accession_number");
  CREATE INDEX "_articles_v_version_seo_version_seo_og_image_idx" ON "_articles_v" USING btree ("version_seo_og_image_id");
  CREATE INDEX "_articles_v_version_version_reviewed_by_idx" ON "_articles_v" USING btree ("version_reviewed_by_id");
  CREATE INDEX "_articles_v_version_version_approved_by_idx" ON "_articles_v" USING btree ("version_approved_by_id");
  CREATE INDEX "_articles_v_version_version_updated_at_idx" ON "_articles_v" USING btree ("version_updated_at");
  CREATE INDEX "_articles_v_version_version_created_at_idx" ON "_articles_v" USING btree ("version_created_at");
  CREATE INDEX "_articles_v_version_version__status_idx" ON "_articles_v" USING btree ("version__status");
  CREATE INDEX "_articles_v_created_at_idx" ON "_articles_v" USING btree ("created_at");
  CREATE INDEX "_articles_v_updated_at_idx" ON "_articles_v" USING btree ("updated_at");
  CREATE INDEX "_articles_v_snapshot_idx" ON "_articles_v" USING btree ("snapshot");
  CREATE INDEX "_articles_v_published_locale_idx" ON "_articles_v" USING btree ("published_locale");
  CREATE INDEX "_articles_v_latest_idx" ON "_articles_v" USING btree ("latest");
  CREATE INDEX "_articles_v_version_version_slug_idx" ON "_articles_v_locales" USING btree ("version_slug","_locale");
  CREATE UNIQUE INDEX "_articles_v_locales_locale_parent_id_unique" ON "_articles_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_articles_v_rels_order_idx" ON "_articles_v_rels" USING btree ("order");
  CREATE INDEX "_articles_v_rels_parent_idx" ON "_articles_v_rels" USING btree ("parent_id");
  CREATE INDEX "_articles_v_rels_path_idx" ON "_articles_v_rels" USING btree ("path");
  CREATE INDEX "_articles_v_rels_tags_id_idx" ON "_articles_v_rels" USING btree ("tags_id");
  CREATE INDEX "_articles_v_rels_sources_id_idx" ON "_articles_v_rels" USING btree ("sources_id");
  CREATE INDEX "sources_editorial_editorial_decision_by_idx" ON "sources" USING btree ("editorial_decision_by_id");
  CREATE INDEX "sources_updated_at_idx" ON "sources" USING btree ("updated_at");
  CREATE INDEX "sources_created_at_idx" ON "sources" USING btree ("created_at");
  CREATE INDEX "sources_rels_order_idx" ON "sources_rels" USING btree ("order");
  CREATE INDEX "sources_rels_parent_idx" ON "sources_rels" USING btree ("parent_id");
  CREATE INDEX "sources_rels_path_idx" ON "sources_rels" USING btree ("path");
  CREATE INDEX "sources_rels_tags_id_idx" ON "sources_rels" USING btree ("tags_id");
  CREATE INDEX "image_assets_updated_at_idx" ON "image_assets" USING btree ("updated_at");
  CREATE INDEX "image_assets_created_at_idx" ON "image_assets" USING btree ("created_at");
  CREATE UNIQUE INDEX "image_assets_filename_idx" ON "image_assets" USING btree ("filename");
  CREATE INDEX "image_assets_sizes_gallery_sizes_gallery_filename_idx" ON "image_assets" USING btree ("sizes_gallery_filename");
  CREATE INDEX "image_assets_sizes_instagram_square_sizes_instagram_squa_idx" ON "image_assets" USING btree ("sizes_instagram_square_filename");
  CREATE INDEX "image_assets_sizes_instagram_portrait_sizes_instagram_po_idx" ON "image_assets" USING btree ("sizes_instagram_portrait_filename");
  CREATE INDEX "image_assets_sizes_x_landscape_sizes_x_landscape_filenam_idx" ON "image_assets" USING btree ("sizes_x_landscape_filename");
  CREATE INDEX "image_assets_sizes_note_header_sizes_note_header_filenam_idx" ON "image_assets" USING btree ("sizes_note_header_filename");
  CREATE INDEX "image_assets_rels_order_idx" ON "image_assets_rels" USING btree ("order");
  CREATE INDEX "image_assets_rels_parent_idx" ON "image_assets_rels" USING btree ("parent_id");
  CREATE INDEX "image_assets_rels_path_idx" ON "image_assets_rels" USING btree ("path");
  CREATE INDEX "image_assets_rels_tags_id_idx" ON "image_assets_rels" USING btree ("tags_id");
  CREATE INDEX "tags_updated_at_idx" ON "tags" USING btree ("updated_at");
  CREATE INDEX "tags_created_at_idx" ON "tags" USING btree ("created_at");
  CREATE UNIQUE INDEX "tags_name_idx" ON "tags_locales" USING btree ("name","_locale");
  CREATE UNIQUE INDEX "tags_locales_locale_parent_id_unique" ON "tags_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "social_posts_article_idx" ON "social_posts" USING btree ("article_id");
  CREATE UNIQUE INDEX "social_posts_dedupe_key_idx" ON "social_posts" USING btree ("dedupe_key");
  CREATE INDEX "social_posts_ready_by_idx" ON "social_posts" USING btree ("ready_by_id");
  CREATE INDEX "social_posts_sent_by_idx" ON "social_posts" USING btree ("sent_by_id");
  CREATE INDEX "social_posts_updated_at_idx" ON "social_posts" USING btree ("updated_at");
  CREATE INDEX "social_posts_created_at_idx" ON "social_posts" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_articles_id_idx" ON "payload_locked_documents_rels" USING btree ("articles_id");
  CREATE INDEX "payload_locked_documents_rels_sources_id_idx" ON "payload_locked_documents_rels" USING btree ("sources_id");
  CREATE INDEX "payload_locked_documents_rels_image_assets_id_idx" ON "payload_locked_documents_rels" USING btree ("image_assets_id");
  CREATE INDEX "payload_locked_documents_rels_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("tags_id");
  CREATE INDEX "payload_locked_documents_rels_social_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("social_posts_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "articles_images" CASCADE;
  DROP TABLE "articles_images_locales" CASCADE;
  DROP TABLE "articles_publish_history" CASCADE;
  DROP TABLE "articles" CASCADE;
  DROP TABLE "articles_locales" CASCADE;
  DROP TABLE "articles_rels" CASCADE;
  DROP TABLE "_articles_v_version_images" CASCADE;
  DROP TABLE "_articles_v_version_images_locales" CASCADE;
  DROP TABLE "_articles_v_version_publish_history" CASCADE;
  DROP TABLE "_articles_v" CASCADE;
  DROP TABLE "_articles_v_locales" CASCADE;
  DROP TABLE "_articles_v_rels" CASCADE;
  DROP TABLE "sources" CASCADE;
  DROP TABLE "sources_rels" CASCADE;
  DROP TABLE "image_assets" CASCADE;
  DROP TABLE "image_assets_rels" CASCADE;
  DROP TABLE "tags" CASCADE;
  DROP TABLE "tags_locales" CASCADE;
  DROP TABLE "social_posts" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."_locales";
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_articles_images_role";
  DROP TYPE "public"."enum_articles_images_variant";
  DROP TYPE "public"."enum_articles_publish_history_channel";
  DROP TYPE "public"."enum_articles_review_status";
  DROP TYPE "public"."enum_articles_historical_period";
  DROP TYPE "public"."enum_articles_translation_status_ja";
  DROP TYPE "public"."enum_articles_translation_status_en";
  DROP TYPE "public"."enum_articles_status";
  DROP TYPE "public"."enum__articles_v_version_images_role";
  DROP TYPE "public"."enum__articles_v_version_images_variant";
  DROP TYPE "public"."enum__articles_v_version_publish_history_channel";
  DROP TYPE "public"."enum__articles_v_version_review_status";
  DROP TYPE "public"."enum__articles_v_version_historical_period";
  DROP TYPE "public"."enum__articles_v_version_translation_status_ja";
  DROP TYPE "public"."enum__articles_v_version_translation_status_en";
  DROP TYPE "public"."enum__articles_v_version_status";
  DROP TYPE "public"."enum__articles_v_published_locale";
  DROP TYPE "public"."enum_sources_type";
  DROP TYPE "public"."enum_sources_status";
  DROP TYPE "public"."enum_sources_editorial_editorial_status";
  DROP TYPE "public"."enum_tags_type";
  DROP TYPE "public"."enum_social_posts_channel";
  DROP TYPE "public"."enum_social_posts_status";`)
}
