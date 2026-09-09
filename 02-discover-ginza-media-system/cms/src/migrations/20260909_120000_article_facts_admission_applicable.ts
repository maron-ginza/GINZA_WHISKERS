import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// GINZA WHISKERS / Project 02（2026-09-09、事実確認改善：公式記載なし／取得失敗／該当なしの区別）
//
// `article-facts` コレクションに次を追加する：
//   ・admission_applicable  … 入場料の該当性（'not_stated' / 'no' / 'yes'）。'no' のとき
//                              evaluateReadyGate が event 系の paid 必須を免除する。
//   ・af_sale_availability enum に値 'no_period_stated' を追加（販売期間の公式記載なし・
//                              店頭取扱商品。sale の過去/未来ゲートを免除する）。
//
// 【安全設計】
//   ・**加算のみ**。既存の列・行・データ・enum 値は削除も上書きもしない。
//   ・admission_applicable は既定値 'not_stated'（＝従来どおり paid を必須）。既存の
//     ready 行（DC #310 / #369 / #331）は新列が 'not_stated' になるだけで挙動不変。
//   ・`IF NOT EXISTS` / `DO` ガードで冪等（dev-push 済みのローカル DB でも安全に再実行可）。
//   ・`article_facts` テーブル本体・`af_sale_availability` enum 型はどの committed migration
//     にも含まれない（dev-push で作成済み）。存在しない場合に備え CREATE TYPE も IF ガードする。
//
// down は追加した列と enum 型を落とすだけ（行は削除しない。enum 値の削除は Postgres が
// サポートしないため 'no_period_stated' は残す＝無害）。

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."af_admission_applicable" AS ENUM('not_stated','no','yes');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    ALTER TABLE "article_facts"
      ADD COLUMN IF NOT EXISTS "admission_applicable" "public"."af_admission_applicable" DEFAULT 'not_stated';

    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'af_sale_availability') THEN
        ALTER TYPE "public"."af_sale_availability" ADD VALUE IF NOT EXISTS 'no_period_stated';
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "article_facts" DROP COLUMN IF EXISTS "admission_applicable";
    DROP TYPE IF EXISTS "public"."af_admission_applicable";
  `)
}
