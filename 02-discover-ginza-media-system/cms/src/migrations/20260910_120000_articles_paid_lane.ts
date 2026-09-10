import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// GINZA WHISKERS / Project 02（2026-09-10、100円note記事の別レーン。PAID_100_LANE_SPEC.md）
//
// `articles` コレクション（＋ drafts/versions の `_articles_v`）に次を追加する：
//   ・lane       … レーン区分（'free' / 'paid_100'）。既定 'free'。paid_100 は
//                   通常記事の投稿数・カテゴリー配分・会場重複判定に加算しない。
//   ・price_yen  … paid_100 の想定価格（初期 100）。note 上の実価格設定はマロンが手動。
//
// 【安全設計】
//   ・**加算のみ**。既存の列・行・データは削除も上書きもしない。
//   ・lane は既定 'free'。既存 Article（#1〜#58 等）は全て 'free' になるだけで挙動不変。
//   ・`IF NOT EXISTS` / `DO` ガードで冪等（dev-push 済みのローカル DB でも安全に再実行可）。
//   ・`articles` / `_articles_v` テーブル本体はどの committed migration にも含まれない
//     （Stage 1 の dev-push で作成済み）。本 migration はその差分（各2列＋2 enum）だけを扱う。
//
// down は追加した列と enum 型を落とすだけ（行は削除しない）。

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_articles_lane" AS ENUM('free','paid_100');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum__articles_v_version_lane" AS ENUM('free','paid_100');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    ALTER TABLE "articles"
      ADD COLUMN IF NOT EXISTS "lane" "public"."enum_articles_lane" DEFAULT 'free' NOT NULL;
    ALTER TABLE "articles"
      ADD COLUMN IF NOT EXISTS "price_yen" numeric;

    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_articles_v') THEN
        ALTER TABLE "_articles_v"
          ADD COLUMN IF NOT EXISTS "version_lane" "public"."enum__articles_v_version_lane" DEFAULT 'free';
        ALTER TABLE "_articles_v"
          ADD COLUMN IF NOT EXISTS "version_price_yen" numeric;
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "articles" DROP COLUMN IF EXISTS "price_yen";
    ALTER TABLE "articles" DROP COLUMN IF EXISTS "lane";
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_articles_v') THEN
        ALTER TABLE "_articles_v" DROP COLUMN IF EXISTS "version_price_yen";
        ALTER TABLE "_articles_v" DROP COLUMN IF EXISTS "version_lane";
      END IF;
    END $$;
    DROP TYPE IF EXISTS "public"."enum__articles_v_version_lane";
    DROP TYPE IF EXISTS "public"."enum_articles_lane";
  `)
}
