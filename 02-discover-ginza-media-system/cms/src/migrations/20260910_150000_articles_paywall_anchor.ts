import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// GINZA WHISKERS / Project 02（2026-09-10、100円 note 公開トライアルの恒久反映 項目3）
//
// `articles`（＋ drafts/versions の `_articles_v`）に次を追加する：
//   ・paywall_anchor_heading … note の有料エリア開始位置の「直前に置く見出し」テキスト。
//     本文には「ここから有料エリア」等の仮表示を入れず、この値を転記パッケージで明示する。
//
// 【安全設計】
//   ・**加算のみ**。既存の列・行・データは削除も上書きもしない。
//   ・NULL 許容。既存 Article は全て NULL のまま挙動不変（paid_100 でのみ意味を持つ）。
//   ・`ADD COLUMN IF NOT EXISTS` で冪等（dev-push 済みローカル DB でも安全に再実行可）。

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "articles"
      ADD COLUMN IF NOT EXISTS "paywall_anchor_heading" varchar;

    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_articles_v') THEN
        ALTER TABLE "_articles_v"
          ADD COLUMN IF NOT EXISTS "version_paywall_anchor_heading" varchar;
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "articles" DROP COLUMN IF EXISTS "paywall_anchor_heading";
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_articles_v') THEN
        ALTER TABLE "_articles_v" DROP COLUMN IF EXISTS "version_paywall_anchor_heading";
      END IF;
    END $$;
  `)
}
