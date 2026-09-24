import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// GINZA WHISKERS / Project 02（2026-09-24、主カテゴリー8分類のArticles連携）
//
// `articles` コレクション（＋ drafts/versions の `_articles_v`）に次を追加する：
//   ・primary_category8 … 主カテゴリー8分類（スイーツ／グルメ／ショッピング／
//     アート・文化／音楽・舞台／ビューティー・ウェルネス／学び・体験／季節の催し。
//     primaryCategory8.ts が正本）。NULL 許容＝未分類（推測で埋めない）。
//
// 【安全設計】
//   ・**加算のみ**。既存の列・行・データは削除も上書きもしない。
//   ・NOT NULL 制約なし・DEFAULT なし。既存 Article は全て NULL（未分類）のまま
//     挙動不変——このカラムを参照しない既存コードパスに一切影響しない。
//   ・既存の18カテゴリー（ArticleFacts.primaryCategory・SOURCE_LEDGER.
//     article18Categories・deriveProvisionalCategory）は本 migration の対象外・無変更。
//   ・`IF NOT EXISTS` / `DO` ガードで冪等（dev-push 済みのローカル DB でも安全に再実行可）。
//   ・`articles` / `_articles_v` テーブル本体はどの committed migration にも含まれない
//     （Stage 1 の dev-push で作成済み）。本 migration はその差分（各1列＋1 enum）だけを扱う。
//
// down は追加した列と enum 型を落とすだけ（行は削除しない）。

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_articles_primary_category8" AS ENUM(
        'SWEETS','GOURMET','SHOPPING','ART_CULTURE','MUSIC_STAGE',
        'BEAUTY_WELLNESS','LEARNING_EXPERIENCE','SEASONAL'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum__articles_v_version_primary_category8" AS ENUM(
        'SWEETS','GOURMET','SHOPPING','ART_CULTURE','MUSIC_STAGE',
        'BEAUTY_WELLNESS','LEARNING_EXPERIENCE','SEASONAL'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    ALTER TABLE "articles"
      ADD COLUMN IF NOT EXISTS "primary_category8" "public"."enum_articles_primary_category8";

    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_articles_v') THEN
        ALTER TABLE "_articles_v"
          ADD COLUMN IF NOT EXISTS "version_primary_category8" "public"."enum__articles_v_version_primary_category8";
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "articles" DROP COLUMN IF EXISTS "primary_category8";
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_articles_v') THEN
        ALTER TABLE "_articles_v" DROP COLUMN IF EXISTS "version_primary_category8";
      END IF;
    END $$;
    DROP TYPE IF EXISTS "public"."enum__articles_v_version_primary_category8";
    DROP TYPE IF EXISTS "public"."enum_articles_primary_category8";
  `)
}
