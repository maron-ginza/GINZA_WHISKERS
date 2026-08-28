import { getPayload } from 'payload'

import config from '../payload.config'

// 🌈TNS #36 / Article 49：日本語本文を「完成稿候補」として確定し、
// translationStatus.ja を complete に更新する（2026-08-28、マロン承認済み）。
//
// reviewStatus は draft のまま。translationStatus.en は not_started のまま。
// approve・自動投稿はしない。--dry-run で書き込みなし。

const ARTICLE_ID = 49

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const payload = await getPayload({ config })

  const before = (await payload.findByID({
    collection: 'articles',
    id: ARTICLE_ID,
    locale: 'ja',
    depth: 0,
  })) as { reviewStatus?: string; translationStatus?: { ja?: string; en?: string } }

  if (before.reviewStatus !== 'draft') {
    console.error(`[abort] reviewStatus が "${before.reviewStatus}"（draft 期待）`)
    process.exit(2)
  }
  console.log(`[before] reviewStatus=${before.reviewStatus} translationStatus=${JSON.stringify(before.translationStatus)}`)

  if (dryRun) {
    console.log('[dry-run] translationStatus.ja -> complete（en は据え置き）。DB書き込みなし。')
    process.exit(0)
  }

  await payload.update({
    collection: 'articles',
    id: ARTICLE_ID,
    locale: 'ja',
    data: {
      translationStatus: {
        ja: 'complete',
        en: before.translationStatus?.en ?? 'not_started',
      },
    } as never,
  })

  const after = (await payload.findByID({
    collection: 'articles',
    id: ARTICLE_ID,
    locale: 'ja',
    depth: 0,
  })) as { reviewStatus?: string; translationStatus?: { ja?: string; en?: string } }

  console.log(`[after]  reviewStatus=${after.reviewStatus} translationStatus=${JSON.stringify(after.translationStatus)}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
