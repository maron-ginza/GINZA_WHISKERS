// GINZA WHISKERS / Project 02 改善 Stage 4（2026-09-02）。
//
// `./p2 draft-template <dcId> [--all] [--limit=N] [--dry-run] [--yes] [--force] [--regenerate]`
//
//   ・**既定は必ず dry-run**（DB 書き込みなし）。`--yes` を明示したときのみ
//     Article(reviewStatus:'draft') を作成する。`--dry-run` と `--yes` の両方が
//     あれば dry-run が勝つ（安全側）。
//   ・`--regenerate`：既存の機械生成ドラフト（reviewStatus:draft かつ
//     aiGeneratedBy が `template:` で始まる）を **同じ Article に上書き更新**する
//     （新規作成せず重複を作らない。renderer 改善後の作り直し用。human 編集済み・
//     公開済みは対象外＝安全停止）。`--force` は逆に新規で作り直す（重複可）。
//   ・ready かつ必須充足の ArticleFacts を持つ templateEligible:true の
//     DiscoveredContent だけが対象。それ以外は human_review としてスキップ。
//   ・Claude API・他の生成AI は呼ばない（¥0）。note 投稿・自動公開はしない。
//   ・draft-today / draft-interest / night / trial には接続しない。

import { getPayload } from 'payload'

import config from '../payload.config'
import {
  createDraftFromArticleFacts,
  type CreateDraftFromArticleFactsResult,
} from '../lib/template/createDraftFromArticleFacts'

interface Args {
  dcId?: number
  all: boolean
  limit: number
  dryRun: boolean
  force: boolean
  regenerate: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const positional = argv.find((a) => !a.startsWith('--'))
  const limitFlag = argv.find((a) => a.startsWith('--limit='))
  const limit = limitFlag ? Number(limitFlag.split('=')[1]) : 10
  if (!Number.isInteger(limit) || limit < 1) {
    console.error(`--limit は 1 以上の整数で指定してください（受け取った値: "${limitFlag}"）`)
    process.exit(1)
  }
  const all = argv.includes('--all')
  const yes = argv.includes('--yes')
  const dryRunFlag = argv.includes('--dry-run')
  // 既定 dry-run。--yes かつ --dry-run でないときのみ live。
  const dryRun = !yes || dryRunFlag

  let dcId: number | undefined
  if (!all) {
    const n = Number(positional)
    if (!positional || !Number.isInteger(n) || n < 1) {
      console.error('Usage: draftTemplate.ts <DiscoveredContent の数値ID> | --all [--limit=N] [--dry-run] [--yes] [--force] [--regenerate]')
      process.exit(1)
    }
    dcId = n
  }

  return {
    dcId,
    all,
    limit,
    dryRun,
    force: argv.includes('--force'),
    regenerate: argv.includes('--regenerate'),
  }
}

function printOne(r: CreateDraftFromArticleFactsResult): void {
  console.log(`DiscoveredContent #${r.discoveredContentId}`)
  console.log(`  status          : ${r.status}${r.reason ? `（${r.reason}）` : ''}`)
  console.log(`  templateEligible : ${r.templateEligible}`)
  console.log(`  route            : ${r.route}`)
  console.log(`  factsSource      : ${r.factsSource}`)
  console.log(`  dryRun           : ${r.dryRun}`)
  if (r.reason === 'human_review' && r.missing && r.missing.length > 0) {
    console.log('  human_review の理由（missing）:')
    for (const m of r.missing) console.log(`    - ${m}`)
  }
  if (r.reason === 'already_drafted') {
    console.log(`  既存 Article       : #${r.existingArticleId}（--regenerate で同じ Article を上書き更新／--force で新規に作り直し）`)
  }
  if (r.reason === 'existing_not_regenerable' && r.missing) {
    for (const m of r.missing) console.log(`    - ${m}`)
  }
  if (r.plan) {
    console.log('  plan:')
    console.log(`    title           : ${r.plan.title}`)
    console.log(`    slug            : ${r.plan.slug}`)
    console.log(`    pillar          : ${r.plan.pillar}`)
    console.log(`    charCount       : ${r.plan.charCount}`)
    console.log(`    reviewStatus    : ${r.plan.reviewStatus}`)
    console.log(`    aiGeneratedBy   : ${r.plan.aiGeneratedBy}`)
    console.log(`    editorialProvenance : ${r.plan.editorialProvenanceCount} 件`)
    console.log(`    relatedArticles : ${r.plan.relatedArticleCount} 件`)
  }
  if (r.status === 'created') {
    console.log(`  作成した Article  : #${r.articleId}（reviewStatus:draft・承認待ち一覧へ）`)
  }
  if (r.status === 'updated') {
    console.log(`  更新した Article  : #${r.articleId}（既存 draft を上書き・reviewStatus:draft のまま・新規作成なし）`)
  }
  if (r.status === 'would_create' && r.existingArticleId) {
    console.log(`  （--yes で既存 Article #${r.existingArticleId} を上書き更新します）`)
  }
}

async function main(): Promise<void> {
  const args = parseArgs()
  const payload = await getPayload({ config })

  console.log('=== ./p2 draft-template（テンプレート経路 → Article(reviewStatus:draft)） ===')
  console.log(
    args.dryRun
      ? '（dry-run：DB 書き込みなし。--yes を付けると作成します）'
      : '（LIVE：--yes 検出。templateEligible:true の対象を Article(draft) として作成します）',
  )
  console.log('AI 呼び出しなし・note 投稿なし・自動公開なし')
  console.log('────────────────────────────────────────────')

  const results: CreateDraftFromArticleFactsResult[] = []

  if (args.all) {
    const readyFacts = await payload.find({
      collection: 'article-facts',
      where: { enrichmentStatus: { equals: 'ready' } },
      limit: args.limit,
      depth: 0,
      overrideAccess: true,
    })
    const dcIds: number[] = []
    for (const f of readyFacts.docs) {
      const ref = (f as { discoveredContent?: number | { id?: number } }).discoveredContent
      const id = typeof ref === 'object' && ref !== null ? ref.id : ref
      if (typeof id === 'number') dcIds.push(id)
    }
    console.log(`--all: enrichmentStatus=ready の ArticleFacts ${readyFacts.docs.length} 件 → DC ${dcIds.length} 件を評価`)
    for (const id of dcIds) {
      const r = await createDraftFromArticleFacts(payload, id, {
        dryRun: args.dryRun,
        force: args.force,
        regenerate: args.regenerate,
      })
      results.push(r)
      printOne(r)
      console.log('  ----')
    }
  } else {
    const r = await createDraftFromArticleFacts(payload, args.dcId as number, {
      dryRun: args.dryRun,
      force: args.force,
      regenerate: args.regenerate,
    })
    results.push(r)
    printOne(r)
  }

  const created = results.filter((r) => r.status === 'created').length
  const updated = results.filter((r) => r.status === 'updated').length
  const would = results.filter((r) => r.status === 'would_create').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  console.log('────────────────────────────────────────────')
  console.log(
    `集計: created=${created} / updated=${updated} / would_create=${would} / skipped=${skipped}（dryRun=${args.dryRun}）`,
  )
  console.log(
    JSON.stringify({
      mode: args.dryRun ? 'dry-run' : 'live',
      created,
      updated,
      wouldCreate: would,
      skipped,
      results,
    }),
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
  process.exit(1)
})
