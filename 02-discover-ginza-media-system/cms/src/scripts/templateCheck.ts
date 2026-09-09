// GINZA WHISKERS / Project 02 改善 第2段階C Stage 3（2026-09-02）。
//
// `./p2 template-check <dcId>` の実体。**読み取り専用の診断コマンド**：
//   ・DiscoveredContent と（あれば）その ArticleFacts を findByID / find で読むだけ。
//   ・mapDiscoveredContentToEventFields の判定（templateEligible / route /
//     factsSource / captured / missing / ambiguous）を表示する。
//   ・eligible の場合のみ、生成予定のタイトル候補と note 本文を表示する
//     （renderArticleFromTemplate は純粋関数。DB 書き込み・Claude API なし）。
//
// **やらないこと**：DB 書き込み（create/update/delete）／記事生成（AI）／
// note 投稿／draft-today・draft-interest・night・trial への接続／
// NIGHT_RUN_LIVE_ENABLED の参照。

import { getPayload } from 'payload'

import config from '../payload.config'
import {
  buildTemplateArticleInput,
  mapDiscoveredContentToEventFields,
  type ArticleFactsLike,
  type DiscoveredContentLike,
} from '../lib/template/mapDiscoveredContentToEventFields'
import { renderArticleFromTemplate } from '../lib/template/renderArticleFromTemplate'
import { toFactsLike } from '../lib/morning/toFactsLike'

function parseId(): number {
  const raw = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const n = Number(raw)
  if (!raw || !Number.isInteger(n) || n < 1) {
    console.error('Usage: templateCheck.ts <DiscoveredContent の数値ID>')
    process.exit(1)
  }
  return n
}

function toDcLike(dc: Record<string, unknown>): DiscoveredContentLike {
  const ss = dc.sourceSite
  const sourceSiteName =
    ss && typeof ss === 'object' ? ((ss as { name?: string | null }).name ?? null) : (ss as string | null) ?? null
  return {
    id: dc.id as number,
    title: (dc.title as string | null) ?? null,
    excerpt: (dc.excerpt as string | null) ?? null,
    articleUrl: (dc.articleUrl as string | null) ?? null,
    sourceSiteName,
    publishedAt: (dc.publishedAt as string | null) ?? null,
    contentUpdatedAt: (dc.contentUpdatedAt as string | null) ?? null,
    eventStartAt: (dc.eventStartAt as string | null) ?? null,
    eventEndAt: (dc.eventEndAt as string | null) ?? null,
    venue: (dc.venue as string | null) ?? null,
    contentType: (dc.contentType as string | null) ?? null,
    uxType: (dc.uxType as string | null) ?? null,
    lastCheckedAt: (dc.lastCheckedAt as string | null) ?? null,
    detectedAt: (dc.detectedAt as string | null) ?? null,
    dateExtraction: (dc.dateExtraction as DiscoveredContentLike['dateExtraction']) ?? null,
  }
}

async function main(): Promise<void> {
  const id = parseId()
  const payload = await getPayload({ config })

  // --- 読み取りのみ ---
  const dc = (await payload.findByID({
    collection: 'discovered-content',
    id,
    depth: 1,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!dc) {
    console.error(`DiscoveredContent #${id} が見つかりません`)
    process.exit(1)
  }

  const factsRes = await payload.find({
    collection: 'article-facts',
    where: { discoveredContent: { equals: id } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const factsDoc = factsRes.docs[0] as unknown as Record<string, unknown> | undefined

  const dcLike = toDcLike(dc)
  const factsLike = toFactsLike(factsDoc)
  const result = mapDiscoveredContentToEventFields(dcLike, { facts: factsLike, now: new Date() })

  // --- 表示（読み取り専用） ---
  console.log('=== ./p2 template-check（読み取り専用・DB書き込みなし・AI不使用） ===')
  console.log(`DiscoveredContent #${id}`)
  console.log(`  title           : ${dc.title ?? '(なし)'}`)
  console.log(`  curationStatus  : ${dc.curationStatus ?? '(なし)'}${dc.curationStatus === 'approved' ? '' : '  ← 承認済みではない（Maron Editor\'s Choice で承認が必要）'}`)
  console.log(`  articleUrl      : ${dc.articleUrl ?? '(なし)'}`)
  if (factsDoc) {
    console.log(`ArticleFacts       : あり（id=${factsDoc.id} / enrichmentStatus=${factsDoc.enrichmentStatus}）`)
  } else {
    console.log('ArticleFacts       : なし（このコマンドは書き込まない。admin で作成し ready にする）')
  }
  console.log('────────────────────────────────────────────')
  console.log(`templateEligible   : ${result.templateEligible}`)
  console.log(`route              : ${result.route}`)
  console.log(`factsSource        : ${result.factsSource}`)
  console.log('────────────────────────────────────────────')

  if (!result.templateEligible) {
    console.log('human_review になる理由（不足項目 missing）:')
    if (result.missing.length === 0) console.log('  （missing は空だが eligible ではない — 上流ロジックを確認）')
    for (const m of result.missing) console.log(`  - ${m}`)
    if (result.ambiguous.length > 0) {
      console.log('曖昧な項目（ambiguous）:')
      for (const a of result.ambiguous) console.log(`  - ${a}`)
    }
    console.log('取得できた項目（captured）:')
    for (const c of result.captured) console.log(`  - ${c.field} = ${c.value}`)
    console.log('────────────────────────────────────────────')
    console.log('→ route=human_review。テンプレート自動生成の対象外。')
    console.log('  ArticleFacts を作成／補完して enrichmentStatus=ready にすると再判定できる。')
    process.exit(0)
  }

  // eligible: 生成予定のタイトル・本文を表示（純粋関数・DB/AI なし）
  const input = buildTemplateArticleInput(result)
  if (!input) {
    console.log('templateEligible=true だが TemplateArticleInput を組み立てられなかった（fields/sourceMeta 欠落）')
    process.exit(1)
  }
  const rendered = renderArticleFromTemplate(input)
  console.log('取得できた項目（captured）:')
  for (const c of result.captured) console.log(`  - ${c.field} = ${c.value}`)
  if (result.ambiguous.length > 0) {
    console.log('曖昧な項目（ambiguous）:')
    for (const a of result.ambiguous) console.log(`  - ${a}`)
  }
  console.log('────────────────────────────────────────────')
  console.log(`route=template。以下は「生成されるであろう」内容（プレビュー・保存しない）。`)
  console.log(`文字数: ${rendered.charCount}`)
  console.log('タイトル候補:')
  rendered.titleCandidates.forEach((t, i) => console.log(`  ${i + 1}. ${t}  （${[...t].length}文字）`))
  console.log('──── note 本文（プレビュー） ────')
  console.log(rendered.noteBody)
  console.log('──── ここまで ────')
  console.log('注: このコマンドは記事も note-draft も作成しない。実際の生成は別工程（Stage 4・未実装）。')
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err))
  process.exit(1)
})
