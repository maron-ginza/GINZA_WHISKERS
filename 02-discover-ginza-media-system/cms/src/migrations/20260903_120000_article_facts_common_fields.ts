import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// GINZA WHISKERS / Project 02（2026-09-03、共通 Article Facts / 記事種別非依存化。RUNBOOKS 付録 G.25）
//
// `article-facts` コレクションに、記事種別に依存しない共通フィールドを3つ追加する：
//   ・primary_category  … 編集カテゴリー（VISUAL_ASSET_LIBRARY §3.3 の18種）。アイコン選択・集計用。
//   ・template_type     … 記事テンプレート種別（exhibition / application / workshop / sale /
//                          recurring_event / generic / unknown）。必須項目・本文構造の切替用。
//   ・price_text        … 価格の表示文字列（sale / generic 用。paid 列とは別）。
//
// 【安全設計】
//   ・**加算のみ**。既存の列・行・データは削除も上書きもしない。
//   ・すべて NULL 許容（template_type だけ既定値 'unknown'）。既存 ID=3（DC #310・ready）は
//     新列が NULL / 'unknown' になるだけで、enrichment_status も他の値も一切変わらない。
//   ・`IF NOT EXISTS` / `DO` ガードで冪等（ローカル dev DB が dev-push 済みでも安全に再実行可）。
//   ・`article_facts` テーブル本体はこのリポジトリのどの migration にも含まれない（Stage 1 で
//     dev-push により作成された）。本 migration はその差分（3列）だけを扱う。
//
// down は追加した3列と2つの enum 型を落とすだけ（行は削除しない）。

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."af_primary_category" AS ENUM(
        'FOOD','CAFE','SHOPPING','ARCHITECTURE','ART','EVENT','NIGHT','MUSIC','BEAUTY',
        'HOTEL','WELLNESS','EXPERIENCE','GIFT','WORKSHOP','PHOTO','FAMILY','NIGHT_VIEW','RAINY_DAY'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."af_template_type" AS ENUM(
        'exhibition','application','workshop','sale','recurring_event','generic','unknown'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    ALTER TABLE "article_facts" ADD COLUMN IF NOT EXISTS "primary_category" "public"."af_primary_category";
    ALTER TABLE "article_facts" ADD COLUMN IF NOT EXISTS "template_type" "public"."af_template_type" DEFAULT 'unknown';
    ALTER TABLE "article_facts" ADD COLUMN IF NOT EXISTS "price_text" varchar;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "article_facts" DROP COLUMN IF EXISTS "price_text";
    ALTER TABLE "article_facts" DROP COLUMN IF EXISTS "template_type";
    ALTER TABLE "article_facts" DROP COLUMN IF EXISTS "primary_category";
    DROP TYPE IF EXISTS "public"."af_template_type";
    DROP TYPE IF EXISTS "public"."af_primary_category";
  `)
}
