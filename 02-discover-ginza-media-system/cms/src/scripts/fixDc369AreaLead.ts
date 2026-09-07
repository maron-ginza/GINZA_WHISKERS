import { getPayload } from 'payload'

import config from '../payload.config'

// GINZA WHISKERS / Project 02（2026-09-07）— DC #369 の areaLead（decision候補・事実ではない）を、
// mapSaleFactsToDraft.ts の根本修正（商品販売を「催し」と表現しない）を反映した値へ直接補正する。
// 一回限りスクリプト。areaLead は事実（fact）ではなく決定的生成の候補フィールドのため、
// 既存の「confirmed事実は上書きしない」ゲートの対象外——このスクリプトで直接補正してよい。
//
//   node --env-file=.env --import=tsx/esm src/scripts/fixDc369AreaLead.ts --dry-run
//   node --env-file=.env --import=tsx/esm src/scripts/fixDc369AreaLead.ts --write

const DRY = !process.argv.includes('--write')
const DC_ID = 369
const OLD_MARKER = '催し'
const NEW_VALUE = '花西子 FLORASIS GINZA フロア: B1Fで、新作チークを販売中です。'

async function main() {
  console.log(`\n=== fixDc369AreaLead  mode=${DRY ? 'DRY-RUN（DB 書き込みなし）' : 'WRITE'} ===\n`)
  const payload = await getPayload({ config })

  const found = await payload.find({
    collection: 'article-facts',
    where: { discoveredContent: { equals: DC_ID } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = found.docs[0] as unknown as Record<string, unknown> | undefined
  if (!doc) throw new Error(`DC #${DC_ID} の ArticleFacts が見つからない`)

  const before = String(doc.areaLead ?? '')
  console.log(`現在の areaLead: ${before}`)
  if (!before.includes(OLD_MARKER)) {
    console.log('既に修正済み、または想定外の値のため何もしない（安全のため中止）。')
    process.exit(0)
  }
  console.log(`修正後の areaLead: ${NEW_VALUE}`)

  if (DRY) {
    console.log('\nDRY-RUN: DB 書き込みなし。')
    process.exit(0)
  }
  await payload.update({
    collection: 'article-facts',
    id: doc.id as number,
    overrideAccess: true,
    data: { areaLead: NEW_VALUE } as never,
  })
  console.log('\n更新完了。')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
