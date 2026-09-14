import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// GINZA WHISKERS / Project 02（2026-09-03、自動制作パイプライン step 2。RUNBOOKS 付録 G.28）
//
// 新規コレクション `official-snapshots`（テーブル `official_snapshots`）を追加する。
// テーマ承認後に取得した公式ページ本文のスナップショットを **追記型** で保存する
// （sourceUrl / sourceName / capturedAt / verifiedAt / contentHash / rawSnapshot /
//  normalizedFacts＋ArticleFacts・DiscoveredContent への関連）。
//
// 【安全設計】
//   ・**加算のみ**。既存の列・行・データは削除も上書きもしない。
//   ・`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` で冪等
//     （ローカル dev DB が dev-push 済みでも安全に再実行可）。
//   ・FK は ON DELETE SET NULL（親を消してもスナップショットは残す＝追記型）。
//   ・down はテーブルを DROP するだけ（他テーブルには触れない）。

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "official_snapshots" (
      "id" serial PRIMARY KEY NOT NULL,
      "source_url" varchar NOT NULL,
      "source_name" varchar NOT NULL,
      "captured_at" timestamp(3) with time zone NOT NULL,
      "verified_at" timestamp(3) with time zone,
      "content_hash" varchar NOT NULL,
      "http_status" numeric,
      "raw_snapshot" varchar,
      "normalized_facts" jsonb,
      "article_facts_id" integer,
      "discovered_content_id" integer,
      "fetch_notes" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    DO $$ BEGIN
      ALTER TABLE "official_snapshots"
        ADD CONSTRAINT "official_snapshots_article_facts_id_article_facts_id_fk"
        FOREIGN KEY ("article_facts_id") REFERENCES "public"."article_facts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TABLE "official_snapshots"
        ADD CONSTRAINT "official_snapshots_discovered_content_id_discovered_content_id_fk"
        FOREIGN KEY ("discovered_content_id") REFERENCES "public"."discovered_content"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE INDEX IF NOT EXISTS "official_snapshots_source_url_idx" ON "official_snapshots" USING btree ("source_url");
    CREATE INDEX IF NOT EXISTS "official_snapshots_captured_at_idx" ON "official_snapshots" USING btree ("captured_at");
    CREATE INDEX IF NOT EXISTS "official_snapshots_content_hash_idx" ON "official_snapshots" USING btree ("content_hash");
    CREATE INDEX IF NOT EXISTS "official_snapshots_article_facts_idx" ON "official_snapshots" USING btree ("article_facts_id");
    CREATE INDEX IF NOT EXISTS "official_snapshots_discovered_content_idx" ON "official_snapshots" USING btree ("discovered_content_id");
    CREATE INDEX IF NOT EXISTS "official_snapshots_updated_at_idx" ON "official_snapshots" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "official_snapshots_created_at_idx" ON "official_snapshots" USING btree ("created_at");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "official_snapshots";`)
}
