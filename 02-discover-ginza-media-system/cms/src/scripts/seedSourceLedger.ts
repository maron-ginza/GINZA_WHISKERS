import { getPayload } from 'payload'

import { SOURCE_LEDGER_SEED_DATA } from '../lib/sourceLedger/seedData'
import config from '../payload.config'

// SOURCE LEDGER v1（2026-08-15）の初期データをDB（source-ledgerコレクション）へ投入する。
// `sourceId`をキーに冪等——既存レコードはスキップし上書きしない（管理画面で手動調整した
// enabled/notes等の運用状態を、seedの再実行で壊さないため）。
//
// 実行例（DB起動中に）:
//   cd cms && node --env-file=.env --import=tsx/esm src/scripts/seedSourceLedger.ts
//
// Docker/Postgresが起動していない環境ではこのスクリプトは実行できない。DBに依存しない
// 確認は `sourceLedgerStatus.ts`（seedData.tsを直接読む）を使うこと。

async function main() {
  const payload = await getPayload({ config })

  let created = 0
  let skipped = 0

  for (const entry of SOURCE_LEDGER_SEED_DATA) {
    const existing = await payload.find({
      collection: 'source-ledger',
      where: { sourceId: { equals: entry.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    if (existing.totalDocs > 0) {
      skipped += 1
      continue
    }

    await payload.create({
      collection: 'source-ledger',
      overrideAccess: true,
      data: {
        sourceId: entry.id,
        name: entry.name,
        url: entry.url ?? '',
        category: entry.category,
        tier: entry.tier,
        language: entry.language,
        sourceType: entry.sourceType,
        reliability: entry.reliability,
        crawlFrequency: entry.crawlFrequency,
        enabled: entry.enabled,
        notes: entry.notes,
      },
    })
    created += 1
  }

  console.log(JSON.stringify({ created, skipped, total: SOURCE_LEDGER_SEED_DATA.length }))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
