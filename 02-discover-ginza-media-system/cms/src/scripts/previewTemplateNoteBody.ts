import { getPayload } from 'payload'

import config from '../payload.config'
import {
  buildTemplateArticleInput,
  mapDiscoveredContentToEventFields,
  type ArticleFactsLike,
  type DiscoveredContentLike,
} from '../lib/template/mapDiscoveredContentToEventFields'
import { renderArticleFromTemplate } from '../lib/template/renderArticleFromTemplate'

// 読み取り専用プレビュー（2026-09-03）。
//   node --env-file=.env --import=tsx/esm src/scripts/previewTemplateNoteBody.ts <dcId>
// 承認済み DiscoveredContent + ready な ArticleFacts から、テンプレート経路で
// 生成される note 本文 Markdown（noteBody）とタイトル案を表示するだけ。
// DB 書き込み・記事生成・AI 呼び出しは一切なし。

async function main() {
  const dcId = Number(process.argv[2])
  if (!Number.isInteger(dcId)) {
    console.error('Usage: previewTemplateNoteBody.ts <DiscoveredContent 数値ID>')
    process.exit(1)
  }
  const payload = await getPayload({ config })

  const dcDoc = (await payload.findByID({
    collection: 'discovered-content',
    id: dcId,
    depth: 1,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>

  const af = await payload.find({
    collection: 'article-facts',
    where: { discoveredContent: { equals: dcId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const factsDoc = (af.docs[0] ?? null) as unknown as Record<string, unknown> | null

  const ss = dcDoc.sourceSite as { name?: string | null } | null
  const dcLike: DiscoveredContentLike = {
    id: dcId,
    title: (dcDoc.title as string | null) ?? null,
    excerpt: (dcDoc.excerpt as string | null) ?? null,
    articleUrl: (dcDoc.articleUrl as string | null) ?? null,
    sourceSiteName: ss?.name ?? null,
    publishedAt: (dcDoc.publishedAt as string | null) ?? null,
    eventStartAt: (dcDoc.eventStartAt as string | null) ?? null,
    eventEndAt: (dcDoc.eventEndAt as string | null) ?? null,
    venue: (dcDoc.venue as string | null) ?? null,
    contentType: (dcDoc.contentType as string | null) ?? null,
    uxType: (dcDoc.uxType as string | null) ?? null,
    lastCheckedAt: (dcDoc.lastCheckedAt as string | null) ?? null,
    detectedAt: (dcDoc.detectedAt as string | null) ?? null,
    dateExtraction: (dcDoc.dateExtraction as DiscoveredContentLike['dateExtraction']) ?? null,
  }

  const factsLike: ArticleFactsLike | undefined = factsDoc
    ? (factsDoc as unknown as ArticleFactsLike)
    : undefined

  const mapped = mapDiscoveredContentToEventFields(dcLike, { facts: factsLike })
  console.log('=== mapDiscoveredContentToEventFields ===')
  console.log(
    JSON.stringify(
      {
        templateEligible: mapped.templateEligible,
        route: mapped.route,
        factsSource: mapped.factsSource,
        variant: mapped.variant,
        missing: mapped.missing,
        ambiguous: mapped.ambiguous,
      },
      null,
      2,
    ),
  )

  const input = buildTemplateArticleInput(mapped)
  if (!input) {
    console.log('\n(templateEligible=false のため noteBody は生成できません)')
    process.exit(0)
  }
  const rendered = renderArticleFromTemplate(input)
  console.log('\n=== タイトル案（決定的・3案） ===')
  rendered.titleCandidates.forEach((t, i) => console.log(`  ${i + 1}. ${t}  （${[...t].length}文字）`))
  console.log(`\n=== noteBody（${rendered.charCount} 文字） ===\n`)
  console.log(rendered.noteBody)
  console.log('\n=== ここまで ===')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
