// GINZA WHISKERS / Project 02（2026-09-14、マロン指示）。
//
// `./p2 draft-product-sweets-template <dcId> [--dry-run] [--yes]`
//
//   ・**既定は必ず dry-run**（DB 書き込みなし）。`--yes` を明示したときのみ
//     Article(reviewStatus:'draft') を作成する。`--dry-run` と `--yes` の
//     両方があれば dry-run が勝つ（安全側、draftTemplate.ts と同じ設計）。
//   ・templateEligible（sourceName/sourceUrl/titleが揃っている）かつ
//     curationStatus=approved の DiscoveredContent だけが対象。
//   ・二重生成防止：editorialProvenance逆引きで既に同じDCから生成済みの
//     Articleがあれば作成しない（idempotent）。
//   ・Claude API・他の生成AI は呼ばない（¥0）。note 投稿・自動公開はしない。
//   ・既存のイベント用テンプレート・draft-templateコマンドには一切触れない。

import { getPayload } from 'payload'

import config from '../payload.config'
import { createDraftFromProductSweetsTemplate } from '../lib/template/createDraftFromProductSweetsTemplate'

interface Args {
  dcId: number
  dryRun: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const positional = argv.find((a) => !a.startsWith('--'))
  const n = Number(positional)
  if (!positional || !Number.isInteger(n) || n < 1) {
    console.error('Usage: draftProductSweetsTemplate.ts <DiscoveredContent の数値ID> [--dry-run] [--yes]')
    process.exit(1)
  }
  const yes = argv.includes('--yes')
  const dryRunFlag = argv.includes('--dry-run')
  // 既定 dry-run。--yes かつ --dry-run でないときのみ live。
  const dryRun = !yes || dryRunFlag
  return { dcId: n, dryRun }
}

async function main(): Promise<void> {
  const args = parseArgs()
  const payload = await getPayload({ config })

  console.log('=== ./p2 draft-product-sweets-template（商品・スウィーツ専用テンプレート → Article(reviewStatus:draft)） ===')
  console.log(
    args.dryRun
      ? '（dry-run：DB 書き込みなし。--yes を付けると作成します）'
      : '（LIVE：--yes 検出。templateEligible:true かつ承認済みの対象を Article(draft) として作成します）',
  )
  console.log('AI 呼び出しなし・note 投稿なし・自動公開なし')
  console.log('────────────────────────────────────────────')

  const r = await createDraftFromProductSweetsTemplate(payload, args.dcId, { dryRun: args.dryRun })

  console.log(`DiscoveredContent #${r.discoveredContentId}`)
  console.log(`  status  : ${r.status}${r.reason ? `（${r.reason}）` : ''}`)
  console.log(`  dryRun  : ${r.dryRun}`)
  if (r.missing && r.missing.length > 0) {
    console.log('  不足項目:')
    for (const m of r.missing) console.log(`    - ${m}`)
  }
  if (r.status === 'already_drafted') {
    console.log(`  既存 Article : #${r.existingArticleId}（重複作成せず終了。idempotent）`)
  }
  if (r.plan) {
    console.log('  plan:')
    console.log(`    title           : ${r.plan.title}`)
    console.log(`    slug            : ${r.plan.slug}`)
    console.log(`    pillar          : ${r.plan.pillar}`)
    console.log(`    charCount       : ${r.plan.charCount}`)
    console.log(`    reviewStatus    : ${r.plan.reviewStatus}`)
    console.log(`    aiGeneratedBy   : ${r.plan.aiGeneratedBy}`)
    console.log(`    hashtags        : ${r.plan.hashtags.join(' ')}`)
    console.log(`    editorialProvenance : ${r.plan.editorialProvenanceCount} 件`)
    console.log(`    priceConfirmed      : ${r.plan.priceConfirmed}`)
    console.log(`    salesPeriodConfirmed: ${r.plan.salesPeriodConfirmed}`)
  }
  if (r.preview && r.status === 'would_create') {
    console.log('──── note 本文（プレビュー・保存しない） ────')
    console.log(r.preview.noteBody)
    console.log('──── ここまで ────')
    console.log('sourceProvenance:')
    for (const p of r.preview.provenance) console.log(`  - [${p.factType}] ${p.fact}`)
  }
  if (r.status === 'created') {
    console.log(`  作成した Article  : #${r.articleId}（reviewStatus:draft・承認待ち一覧へ）`)
  }
  console.log('================================================')
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
  process.exit(1)
})
