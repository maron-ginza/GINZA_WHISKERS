// GINZA WHISKERS / Project 02（2026-09-14、マロン指示）。
//
// `./p2 product-sweets-template-check <dcId>` の実体。**読み取り専用の診断
// コマンド**：
//   ・DiscoveredContent を findByID で読むだけ（ArticleFactsは参照しない
//     ——この新テンプレートはイベント専用スキーマに依存しない設計）。
//   ・checkProductSweetsEligibility（純粋関数）の判定
//     （templateEligible / route / missing / optionalNotStated / captured）を表示する。
//   ・eligible の場合のみ、buildProductSweetsArticle（純粋関数）で
//     生成予定のタイトル候補・本文・ハッシュタグを表示する（プレビューのみ・保存しない）。
//
// **やらないこと**：DB 書き込み（create/update/delete）／記事生成（AI）／
// note 投稿／自動公開／既存のイベント用テンプレート（renderArticleFromTemplate.ts /
// saleTemplate.ts / readyGate.ts / templateCheck.ts）への変更。

import { getPayload } from 'payload'

import config from '../payload.config'
import { checkProductSweetsEligibility } from '../lib/template/productSweetsEligibility'
import { buildProductSweetsArticle } from '../lib/template/productSweetsTemplate'

function parseId(): number {
  const raw = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const n = Number(raw)
  if (!raw || !Number.isInteger(n) || n < 1) {
    console.error('Usage: productSweetsTemplateCheck.ts <DiscoveredContent の数値ID>')
    process.exit(1)
  }
  return n
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

  const ss = dc.sourceSite
  const sourceSiteName =
    ss && typeof ss === 'object' ? ((ss as { name?: string | null }).name ?? null) : ((ss as string | null) ?? null)
  const verifiedAt = (dc.lastCheckedAt as string | null) ?? (dc.detectedAt as string | null) ?? null

  console.log('=== ./p2 product-sweets-template-check（読み取り専用・DB書き込みなし・AI不使用） ===')
  console.log(`DiscoveredContent #${id}`)
  console.log(`  title           : ${dc.title ?? '(なし)'}`)
  console.log(
    `  curationStatus  : ${dc.curationStatus ?? '(なし)'}${
      dc.curationStatus === 'approved' ? '' : "  ← 承認済みではない（Maron Editor's Choice で承認が必要）"
    }`,
  )
  console.log(`  articleUrl      : ${dc.articleUrl ?? '(なし)'}`)
  console.log('────────────────────────────────────────────')

  const eligibility = checkProductSweetsEligibility({
    discoveredContentId: id,
    title: (dc.title as string | null) ?? null,
    sourceName: sourceSiteName,
    sourceUrl: (dc.articleUrl as string | null) ?? null,
    verifiedAt,
    venue: (dc.venue as string | null) ?? null,
    excerpt: (dc.excerpt as string | null) ?? null,
    eventStartAtISO: (dc.eventStartAt as string | null) ?? null,
    eventEndAtISO: (dc.eventEndAt as string | null) ?? null,
    contentType: (dc.contentType as string | null) ?? null,
  })

  console.log(`templateEligible   : ${eligibility.templateEligible}`)
  console.log(`route              : ${eligibility.route}`)
  console.log('────────────────────────────────────────────')

  if (!eligibility.templateEligible) {
    console.log('human_review になる理由（不足項目 missing）:')
    for (const m of eligibility.missing) console.log(`  - ${m}`)
    console.log('取得できた項目（captured）:')
    for (const [k, v] of Object.entries(eligibility.captured)) console.log(`  - ${k} = ${v ?? '(なし)'}`)
    console.log('────────────────────────────────────────────')
    console.log('→ route=human_review。商品・スウィーツ専用テンプレートの対象外。')
    process.exit(0)
  }

  console.log('取得できた項目（captured）:')
  for (const [k, v] of Object.entries(eligibility.captured)) console.log(`  - ${k} = ${v ?? '(なし)'}`)
  if (eligibility.optionalNotStated.length > 0) {
    console.log('任意項目のうち「公式記載なし」で本文へ出るもの（ブロックしない）:')
    for (const o of eligibility.optionalNotStated) console.log(`  - ${o}`)
  }
  console.log('────────────────────────────────────────────')

  const rendered = buildProductSweetsArticle({
    discoveredContentId: id,
    sourceName: sourceSiteName ?? '(出典名なし)',
    sourceUrl: (dc.articleUrl as string | null) ?? '',
    verifiedAt,
    title: (dc.title as string | null) ?? '',
    venue: (dc.venue as string | null) ?? null,
    contentType: (dc.contentType as string | null) ?? null,
    excerpt: (dc.excerpt as string | null) ?? null,
    eventStartAtISO: (dc.eventStartAt as string | null) ?? null,
    eventEndAtISO: (dc.eventEndAt as string | null) ?? null,
  })

  console.log(`route=product_sweets_template。以下は「生成されるであろう」内容（プレビュー・保存しない）。`)
  console.log(`facilityLabel: ${rendered.facilityLabel} / categoryLabel: ${rendered.categoryLabel ?? '(未確定)'}`)
  console.log(`salesPeriodConfirmed: ${rendered.salesPeriodConfirmed} / priceConfirmed: ${rendered.priceConfirmed}`)
  console.log(`文字数: ${rendered.charCount}`)
  console.log('タイトル候補:')
  rendered.titleCandidates.forEach((t, i) => console.log(`  ${i + 1}. ${t}  （${[...t].length}文字）`))
  console.log(`ハッシュタグ（${rendered.hashtags.length}個）: ${rendered.hashtags.join(' ')}`)
  console.log(`sourceProvenance: ${rendered.provenance.length} 件`)
  for (const p of rendered.provenance) console.log(`  - [${p.factType}] ${p.fact}`)
  console.log('──── note 本文（プレビュー） ────')
  console.log(rendered.noteBody)
  console.log('──── ここまで ────')
  console.log('注: このコマンドは記事も note-draft も作成しない。CMS への保存は別コマンド（未実行）。')
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
  process.exit(1)
})
