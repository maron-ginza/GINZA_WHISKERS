import { getPayload } from 'payload'

import config from '../payload.config'
import { dryRunSocialQueue } from '../lib/social/dryRun'
import { generateSocialQueue } from '../lib/social/generateQueue'

// `./p2 social` から `node --env-file=.env --import=tsx/esm` 経由で呼び出す
// 1コマンド状態確認スクリプト（editorialStatus.tsと同じ方式）。
// 1) published/approved記事から配信候補を生成（冪等、既存候補は再作成しない）
// 2) pending/ready項目のDry Run（実配信は一切行わない）
// 3) status別集計・人間の確認待ち(ready)一覧・失敗(failed)一覧を出力
// 書き込みはpending候補の新規作成とlastDryRunAtの記録のみ。実配信・承認操作は行わない。

const STATUS_ORDER = ['pending', 'ready', 'sent', 'failed'] as const

async function main() {
  const payload = await getPayload({ config })

  const generated = await generateSocialQueue(payload)
  const dryRun = await dryRunSocialQueue(payload)

  const { docs, totalDocs } = await payload.find({
    collection: 'social-posts',
    limit: 1000,
    depth: 1,
    overrideAccess: true,
  })

  const byStatus = new Map<string, number>()
  for (const doc of docs) {
    byStatus.set(doc.status, (byStatus.get(doc.status) ?? 0) + 1)
  }

  const articleTitle = (doc: (typeof docs)[number]): string => {
    const article = doc.article as unknown
    if (typeof article === 'object' && article !== null && 'title' in article) {
      return String((article as { title?: unknown }).title ?? '')
    }
    return String(article)
  }

  const readyItems = docs
    .filter((d) => d.status === 'ready')
    .map((d) => ({ id: d.id, channel: d.channel, articleTitle: articleTitle(d) }))

  const failedItems = docs
    .filter((d) => d.status === 'failed')
    .map((d) => ({
      id: d.id,
      channel: d.channel,
      articleTitle: articleTitle(d),
      failureReason: d.failureReason ?? '',
    }))

  const warningItems = dryRun.items
    .filter((i) => i.warnings.length > 0)
    .map((i) => ({ id: i.id, channel: i.channel, articleTitle: i.articleTitle, warnings: i.warnings }))

  const result = {
    generated: { scannedArticles: generated.scannedArticles, createdCount: generated.createdCount },
    dryRun: { previewedCount: dryRun.previewedCount, warningCount: warningItems.length },
    total: totalDocs,
    byStatus: Object.fromEntries(STATUS_ORDER.map((k) => [k, byStatus.get(k) ?? 0])),
    readyItems,
    failedItems,
    warningItems,
  }

  console.log(JSON.stringify(result))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
