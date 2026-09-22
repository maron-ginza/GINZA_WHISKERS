// GINZA WHISKERS / Project 02（2026-09-23）— field_material（現地収集資料）の
// 誤ったStage 0自動ready化を是正する一回限りスクリプト。
//
// 【背景】2026-09-22にautoArticleFacts.tsへ「collectionMethod='field_material'
// はarticleUrl不要でStage 0自動ready化してよい」という緩和を加えたが、
// AUTUMN GINZA 2026冊子の実運用検証で「冊子記載の個別日程が発行組織自身の
// 公式サイトでまだ確認できない（準備中／404）」ケースが判明し、この緩和は
// 2026-09-23にコード上でrevertした（autoArticleFacts.ts）。しかし
// コードのrevertだけでは、既に緩和ロジックによって'ready'化済みの85件の
// ArticleFactsは'draft'に戻らない——本スクリプトはそのデータ側の是正を行う。
//
// 【安全条件】以下を全て満たすレコードのみを対象にする（推測で他のready
// レコードには触れない）：
//   ・discoveredContent.collectionMethod = 'field_material'
//   ・enrichmentStatus = 'ready'
//   ・human_reviewed_by_id・human_reviewed_at ともに未設定（人間が実際に
//     レビューして ready にしたものではなく、Stage 0の自動処理由来と判別できる）
//
// enrichmentStatusを'draft'へ戻すのみ。他のフィールド（eventName/whatHappens等、
// 冊子から判読した正しい内容）は一切変更しない——再度、人間が個別の公式情報と
// 突き合わせて確認できた時点でreadyへ戻せるよう、入力済みのデータ自体は保持する。
//
// 実行例:
//   cd cms && node --env-file=.env --import=tsx/esm src/scripts/revertFieldMaterialAutoReady.ts --dry-run
//   cd cms && node --env-file=.env --import=tsx/esm src/scripts/revertFieldMaterialAutoReady.ts --yes

import { getPayload } from 'payload'
import config from '../payload.config'
import { getPayloadWithRetry } from '../lib/util/getPayloadWithRetry'

const DRY = !process.argv.includes('--yes')

async function run() {
  console.log(DRY ? '=== DRY RUN（--yes 未指定、書き込みなし） ===' : '=== 実書き込みモード ===')
  const payload = await getPayloadWithRetry(() => getPayload({ config }))

  const before = await payload.count({ collection: 'article-facts', where: { enrichmentStatus: { equals: 'ready' } }, overrideAccess: true })
  console.log(`登録前 ready件数（全体）: ${before.totalDocs}`)

  // field_material の DiscoveredContent id 一覧を先に取得
  const { docs: fieldMaterialDocs } = await payload.find({
    collection: 'discovered-content',
    where: { collectionMethod: { equals: 'field_material' } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  const fieldMaterialIds = new Set(fieldMaterialDocs.map((d) => d.id))
  console.log(`collectionMethod=field_material のDiscoveredContent: ${fieldMaterialIds.size}件`)

  const { docs: readyFacts } = await payload.find({
    collection: 'article-facts',
    where: {
      and: [
        { enrichmentStatus: { equals: 'ready' } },
        { humanReviewedBy: { exists: false } },
        { humanReviewedAt: { exists: false } },
      ],
    },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })

  const targets = readyFacts.filter((f) => {
    const dcId = typeof f.discoveredContent === 'object' && f.discoveredContent !== null ? (f.discoveredContent as { id: number }).id : f.discoveredContent
    return fieldMaterialIds.has(dcId as number)
  })
  console.log(`是正対象（field_material かつ ready かつ 人間未レビュー）: ${targets.length}件`)

  let transactionID: string | number | null = null
  const results = { reverted: 0, errors: [] as string[] }
  try {
    if (!DRY) transactionID = (await payload.db.beginTransaction()) as string | number | null
    const reqCtx = transactionID != null ? { req: { transactionID } as any } : {}

    for (const f of targets) {
      if (DRY) {
        console.log(`[would revert] AF#${f.id} (DC#${(f.discoveredContent as { id: number } | number as any)})`)
        continue
      }
      await payload.update({
        collection: 'article-facts',
        id: f.id,
        overrideAccess: true,
        data: {
          enrichmentStatus: 'draft',
          notes: `${f.notes ?? ''}\n[revert:2026-09-23] field_materialの誤ったStage 0自動ready化を是正しdraftへ戻した（マロン指示：現地収集資料の個別事実は人間が公式情報と照合の上readyにする）。`,
        },
        ...reqCtx,
      })
      results.reverted++
    }

    if (!DRY && transactionID != null) {
      await payload.db.commitTransaction(transactionID)
      console.log('=== トランザクションをコミットしました ===')
    }
  } catch (err) {
    if (!DRY && transactionID != null) {
      await payload.db.rollbackTransaction(transactionID)
      console.log('=== エラーのためロールバックしました ===')
    }
    results.errors.push(err instanceof Error ? err.message : String(err))
    console.error(err)
    console.log(JSON.stringify({ results, error: true }))
    process.exit(1)
  }

  const after = await payload.count({ collection: 'article-facts', where: { enrichmentStatus: { equals: 'ready' } }, overrideAccess: true })
  console.log(JSON.stringify({ dryRun: DRY, before: before.totalDocs, after: after.totalDocs, results }))
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
