import { getPayload } from 'payload'

import config from '../payload.config'
import { writeBackup } from '../lib/tns/maintenance'

// 🌈TNS #36 note転記前の軽微な整合性修正（2026-08-30、一回限り）。
//
//   node --env-file=.env --import=tsx/esm src/scripts/tnsFixCode7AltText.ts [--dry-run]
//
// CODE7 の image-assets id=10 の altText.ja が旧ラベル「Soft-Cloud Ginza」の
// ままなので、現在の GINZA CODE 7「新しい季節へ」に整合させる。
// 変更するのは image-assets id=10 の altText.ja のみ。
// 本文 / 選曲 / dailyScenes[].image 紐付け / 天気 / GINZA CODE /
// Article 50 reviewStatus には一切触れない。

const IMAGE_ASSET_ID = 10
const OLD_JA = 'Tokyo Nostalgic Soundtrack #36 世界観挿絵 — 日曜日（2026-09-06）／Soft-Cloud Ginza'
const NEW_JA = 'Tokyo Nostalgic Soundtrack #36 世界観挿絵 — 日曜日（2026-09-06）／新しい季節へ'

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const payload = await getPayload({ config })

  // 期待する紐付けの再確認（現在DBを正とする）：edition 11 の日曜シーンが
  // この image を指していること、GINZA CODE 7 のラベルが「新しい季節へ」で
  // あることを確認してから触る。
  const edition = (await payload.findByID({ collection: 'soundtrack-editions', id: 11, depth: 0 })) as Record<string, any>
  const sun = (edition.dailyScenes ?? []).find((s: any) => s.weekday === 'sunday')
  const sunImageId = sun && (typeof sun.image === 'object' ? sun.image?.id : sun.image)
  const sunLabel = sun?.tnsEditorialCode?.fixedMoodLabel

  const asset = (await payload.findByID({ collection: 'image-assets', id: IMAGE_ASSET_ID, depth: 0 })) as Record<
    string,
    any
  >

  const guards: string[] = []
  if (!asset) guards.push(`image-assets id=${IMAGE_ASSET_ID} が見つからない`)
  if (Number(sunImageId) !== IMAGE_ASSET_ID)
    guards.push(`edition 11 の日曜シーンの image=${sunImageId}（期待 ${IMAGE_ASSET_ID}）`)
  if (sunLabel !== '新しい季節へ')
    guards.push(`日曜シーンの GINZA CODE 7 ラベルが "${sunLabel}"（期待 "新しい季節へ"）`)
  const curJa = asset?.altText?.ja
  if (curJa === NEW_JA) {
    console.log('[skip] altText.ja は既に「新しい季節へ」に整合済み。変更なし。')
    process.exit(0)
  }
  if (curJa !== OLD_JA) guards.push(`altText.ja が想定値と一致しない: "${curJa}"`)

  if (guards.length) {
    console.error('[abort]')
    for (const g of guards) console.error('  - ' + g)
    process.exit(2)
  }

  console.log('=== 変更内容 ===')
  console.log(`  image-assets id=${IMAGE_ASSET_ID} altText.ja`)
  console.log(`    before: ${curJa}`)
  console.log(`    after : ${NEW_JA}`)
  console.log(`  altText.en は変更なし（"${asset.altText?.en ?? ''}"）`)

  if (dryRun) {
    console.log('\n[dry-run] DB書き込みなし。')
    process.exit(0)
  }

  const backupPath = await writeBackup(
    payload,
    { editionId: 11, articleId: 50, editionNumber: 36, skipNumberCheck: false },
    'code7_alttext_before',
  )

  await payload.update({
    collection: 'image-assets',
    id: IMAGE_ASSET_ID,
    data: { altText: { ja: NEW_JA, en: asset.altText?.en ?? '' } } as never,
  })

  const after = (await payload.findByID({ collection: 'image-assets', id: IMAGE_ASSET_ID, depth: 0 })) as Record<
    string,
    any
  >
  console.log(`\n[done] 更新しました。altText.ja = "${after.altText?.ja}"`)
  console.log(`バックアップ: ${backupPath}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
