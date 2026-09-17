// GINZA WHISKERS / Project 02（2026-09-18、マロン指示：V1 Stage 5 → 既存Chrome拡張
// 転記経路への最小限の自動ブリッジ）。
//
//   ./p2 morning-bridge-articles <date> [--yes] [--dry-run]
//
//   ・既定は dry-run（DB 書き込みなし。作成予定を表示するだけ）。
//     `--yes` を明示したときのみ Articles(reviewStatus:'draft') を作成する。
//     `--dry-run` と `--yes` の両方があれば dry-run が勝つ（安全側、
//     draftProductSweetsTemplate.ts と同じ設計）。
//   ・対象は `.devlogs/morning/<date>/note-drafts.json` の drafts のみ
//     （Stage 5 が既に決定的生成済み。ここでは1件も新しい文章を作らない）。
//   ・二重生成防止：同じ DiscoveredContent から既にこのブリッジ経由で作られた
//     Article があれば再作成しない（bridgeNoteDraftsToArticles.ts 側で判定）。
//   ・作成する Article は必ず reviewStatus:'draft'。承認（approved への昇格）は
//     このスクリプトでは行わない——マロンが CMS 管理画面で承認した時点で、
//     既存の note-transfer サーバー（./p2 note-transfer serve）が /pending へ
//     含めるようになる（既存の人間承認ゲートは一切変更しない）。
//   ・Claude API・他の生成AI・note への公開は一切行わない。

import { getPayload } from 'payload'

import config from '../payload.config'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bridgeNoteDraftsToArticles } from '../lib/morning/bridgeNoteDraftsToArticles'
import type { PreparedNoteDraft } from '../lib/morning/noteDraftFromSelection'

interface NoteDraftsBundle {
  date: string
  generatedAt: string
  method: string
  selectionRecordSelectedAt: string
  drafts: PreparedNoteDraft[]
}

function parseArgs(): { date: string; dryRun: boolean } {
  const argv = process.argv.slice(2)
  const date = argv.find((a) => !a.startsWith('--'))
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('Usage: morningBridgeArticles.ts <YYYY-MM-DD> [--yes] [--dry-run]')
    process.exit(1)
  }
  const yes = argv.includes('--yes')
  const dryRunFlag = argv.includes('--dry-run')
  // 既定 dry-run。--yes かつ --dry-run でないときのみ live。
  const dryRun = !yes || dryRunFlag
  return { date: date!, dryRun }
}

async function main(): Promise<void> {
  const args = parseArgs()

  const bundlePath = resolve(process.cwd(), '..', '.devlogs', 'morning', args.date, 'note-drafts.json')
  if (!existsSync(bundlePath)) {
    console.error(
      `エラー: Stage 5 のnote原稿が見つかりません: ${bundlePath}\n` +
        `先に ./p2 morning-draft-selected ${args.date} を実行してください。`,
    )
    process.exit(1)
  }

  let bundle: NoteDraftsBundle
  try {
    bundle = JSON.parse(readFileSync(bundlePath, 'utf8')) as NoteDraftsBundle
  } catch (err) {
    console.error(`エラー: note-drafts.json の読み取りに失敗しました: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
    return
  }
  if (!Array.isArray(bundle.drafts) || bundle.drafts.length === 0) {
    console.error('エラー: note-drafts.json に drafts がありません。')
    process.exit(1)
  }
  const missingBlocks = bundle.drafts.filter((d) => !Array.isArray(d.blocks) || d.blocks.length === 0)
  if (missingBlocks.length > 0) {
    console.error(
      `エラー: note-drafts.json に blocks を含まない draft があります（${missingBlocks
        .map((d) => `DC#${d.discoveredContentId}`)
        .join(', ')}）。\n` +
        `./p2 morning-draft-selected ${args.date} --force で再生成してください（blocks フィールド追加後の再生成が必要）。`,
    )
    process.exit(1)
  }

  console.log('=== ./p2 morning-bridge-articles（note-drafts.json → Articles → 既存Chrome拡張の転記キュー） ===')
  console.log(
    args.dryRun
      ? '（dry-run：DB 書き込みなし。--yes を付けると作成します）'
      : '（LIVE：--yes 検出。note-drafts.json の drafts から Article(reviewStatus:draft) を作成します）',
  )
  console.log(`対象日: ${args.date}　対象件数: ${bundle.drafts.length}`)
  console.log('AI 呼び出しなし・note 公開なし・reviewStatus は draft のまま（承認はマロンがCMS管理画面で行う）')
  console.log('────────────────────────────────────────────')

  const payload = await getPayload({ config })
  const results = await bridgeNoteDraftsToArticles(payload, args.date, bundle.drafts, { dryRun: args.dryRun })

  for (const r of results) {
    console.log(`DiscoveredContent #${r.discoveredContentId}（${r.category ?? '?'}）`)
    console.log(`  status : ${r.status}${r.reason ? `（${r.reason}）` : ''}`)
    if (r.status === 'already_drafted') console.log(`  既存 Article #${r.articleId}（重複作成せず終了。idempotent）`)
    if (r.status === 'would_create') {
      console.log(`  title  : ${r.title}`)
      console.log(`  slug   : ${r.slug}`)
      console.log(`  pillar : ${r.pillar}`)
    }
    if (r.status === 'created') {
      console.log(`  作成した Article #${r.articleId}（reviewStatus:draft）`)
      console.log(`  title  : ${r.title}`)
      console.log(`  slug   : ${r.slug}`)
      console.log(`  pillar : ${r.pillar}`)
    }
    if (r.package) {
      console.log(
        `  queue  : ${r.package.status}${r.package.dir ? `（${r.package.dir}）` : ''}` +
          (r.package.blockers.length ? `  BLOCKER:${r.package.blockers.map((b) => b.code).join(',')}` : '') +
          (r.package.warnings.length ? `  WARN:${r.package.warnings.map((w) => w.code).join(',')}` : ''),
      )
    }
  }
  console.log('================================================')

  console.log(JSON.stringify({ date: args.date, dryRun: args.dryRun, results }))
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
  process.exit(1)
})
