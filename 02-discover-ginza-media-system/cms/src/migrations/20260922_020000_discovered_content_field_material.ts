import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// GINZA WHISKERS / Project 02（2026-09-22、マロン現地収集資料〈紙資料・写真・
// チラシ等、Web URLを持たない情報源〉を正式な情報源として継続利用できるようにする）
//
// `discovered_content` に次を追加する：
//   ・collection_method（enum 'web_crawl'|'field_material'、既定 'web_crawl'）
//     … 既存のWeb巡回由来レコードは全て 'web_crawl' のまま（挙動不変）。
//   ・source_document_id / source_page / content_fingerprint / source_material_name /
//     source_material_hash / source_material_location / collected_by
//     … collectionMethod='field_material' の場合にのみ必須（アプリ側
//       beforeValidate フック、cms/src/lib/crawler/fieldMaterialProvenance.ts
//       で検証。DBレベルでは全て NULL 許容カラムとして追加する）。
//   ・article_url の NOT NULL 制約を撤去（field_material はWebページを
//     持たないため）。既存の web_crawl 行は全て article_url が入っているため
//     この変更による既存データへの影響はない。
//   ・(source_site_id, content_fingerprint) のユニーク制約を追加
//     （既存の (source_site_id, article_url) ユニーク制約と並存。Postgresは
//     UNIQUE制約上NULLを distinct として扱うため、article_url=null の行同士・
//     content_fingerprint=null の行同士はどちらの制約とも衝突しない）。
//
// 【安全設計】
//   ・**加算のみ**。既存の列・行・データは削除も上書きもしない
//     （article_urlのNOT NULL撤去のみ制約の"緩和"だが、値そのものは変更しない）。
//   ・新規列は全てNULL許容・デフォルト値ありのため、既存行は影響を受けない
//     （collection_methodのみ既定'web_crawl'が入る＝実質的に既存挙動そのまま）。
//   ・`IF NOT EXISTS` / `DO` ガードで冪等（dev-push 済みのローカル DB でも
//     安全に再実行可能）。
//
// down は追加した列・型・制約を落とすだけ（行は削除しない）。

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."dc_collection_method" AS ENUM('web_crawl','field_material');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    ALTER TABLE "discovered_content"
      ADD COLUMN IF NOT EXISTS "collection_method" "public"."dc_collection_method" DEFAULT 'web_crawl',
      ADD COLUMN IF NOT EXISTS "source_document_id" varchar,
      ADD COLUMN IF NOT EXISTS "source_page" varchar,
      ADD COLUMN IF NOT EXISTS "content_fingerprint" varchar,
      ADD COLUMN IF NOT EXISTS "source_material_name" varchar,
      ADD COLUMN IF NOT EXISTS "source_material_hash" varchar,
      ADD COLUMN IF NOT EXISTS "source_material_location" varchar,
      ADD COLUMN IF NOT EXISTS "collected_by" varchar;

    ALTER TABLE "discovered_content" ALTER COLUMN "article_url" DROP NOT NULL;

    CREATE INDEX IF NOT EXISTS "discovered_content_source_document_id_idx"
      ON "discovered_content" USING btree ("source_document_id");
    CREATE INDEX IF NOT EXISTS "discovered_content_content_fingerprint_idx"
      ON "discovered_content" USING btree ("content_fingerprint");

    DO $$ BEGIN
      ALTER TABLE "discovered_content"
        ADD CONSTRAINT "sourceSite_contentFingerprint_idx" UNIQUE ("source_site_id", "content_fingerprint");
    EXCEPTION WHEN duplicate_table THEN NULL; END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "discovered_content" DROP CONSTRAINT IF EXISTS "sourceSite_contentFingerprint_idx";
    DROP INDEX IF EXISTS "discovered_content_content_fingerprint_idx";
    DROP INDEX IF EXISTS "discovered_content_source_document_id_idx";
    ALTER TABLE "discovered_content"
      DROP COLUMN IF EXISTS "collected_by",
      DROP COLUMN IF EXISTS "source_material_location",
      DROP COLUMN IF EXISTS "source_material_hash",
      DROP COLUMN IF EXISTS "source_material_name",
      DROP COLUMN IF EXISTS "content_fingerprint",
      DROP COLUMN IF EXISTS "source_page",
      DROP COLUMN IF EXISTS "source_document_id",
      DROP COLUMN IF EXISTS "collection_method";
    DROP TYPE IF EXISTS "public"."dc_collection_method";
    -- article_url の NOT NULL 復元は down では行わない
    -- （field_material行が存在する状態でdownすると復元自体が失敗するため。
    --   本当に戻す場合は field_material 行を先に削除してから手動で
    --   ALTER TABLE discovered_content ALTER COLUMN article_url SET NOT NULL; を実行する）。
  `)
}
