import { getPayload } from 'payload'

import config from '../payload.config'

// GINZA WHISKERS / Project 02（2026-09-07）— DC #369（花西子 FLORASIS「洛花飛霞チーク」）を
// 対象に、マロンが公式出典から確認済みとして確定した値だけを ArticleFacts（draft）へ
// 直接反映する。一回限りスクリプト。
//
//   node --env-file=.env --import=tsx/esm src/scripts/applyDc369ConfirmedFacts.ts --dry-run
//   node --env-file=.env --import=tsx/esm src/scripts/applyDc369ConfirmedFacts.ts --write
//
// 【厳守】
//   ・DC #369（ArticleFacts.discoveredContent=369）のみを対象にする。他行は一切触れない。
//   ・enrichmentStatus は draft のまま固定（ready 化しない）。ready 化はマロンが admin で行う。
//   ・終了日（saleEndAt 相当）は入力しない（本人が「推測して入力しない」と明記）。
//   ・値はすべてマロンが本メッセージで確定した文字列そのまま（自動抽出・AI 生成ではない）。
//   ・sourceProvenanceFacts は [human:maron] タグで、自動パイプライン（[auto:...]）とは
//     出所を区別して記録する。
//   ・記事作成・公開・push・外部送信は行わない。

const DRY = !process.argv.includes('--write')
const DC_ID = 369

const CONFIRMED = {
  primaryCategory: 'BEAUTY',
  templateType: 'sale' as const,
  season: '秋',
  eventName: '洛花飛霞チーク 14 パープルロータス',
  whatHappens: '肌なじみの良い繊細なカラーで、内側からにじむような自然な血色感を演出する新作チークを販売中。',
  eventDate: '2026年9月2日（水）〜販売中',
  eventDateISO: '2026-09-02',
  priceText: '3,190円（税込）',
  officialInfoNote: '販売終了日の記載なし。商品の詳細は店舗へ問い合わせ。',
  venueName: '花西子 FLORASIS GINZA',
  venuePlace: 'GINZA SIX B1F',
  sourceUrl: 'https://ginza6.tokyo/news/detail/shopnews/224270?tenant_cd=8111006',
  officialPublishedOn: '2026年8月31日',
} as const

let fail = 0
const ok = (c: boolean, label: string) => {
  console.log(`  ${c ? '✅' : '❌'} ${label}`)
  if (!c) fail++
}

function diffLine(field: string, before: unknown, after: unknown): string {
  const b = JSON.stringify(before)
  const a = JSON.stringify(after)
  return b === a ? `    ${field}: (変更なし) ${a}` : `    ${field}: ${b} -> ${a}`
}

async function main() {
  console.log(`\n=== applyDc369ConfirmedFacts  mode=${DRY ? 'DRY-RUN（DB 書き込みなし）' : 'WRITE（draft 更新）'} ===\n`)
  const payload = await getPayload({ config })

  // --- 接続先が ローカル discover_ginza であることを再確認 ---
  const uri = process.env.DATABASE_URI ?? ''
  const m = uri.match(/^postgres(?:ql)?:\/\/[^@]+@([^:/]+)(?::\d+)?\/([^?]+)/)
  const host = m?.[1] ?? '(不明)'
  const db = m?.[2] ?? '(不明)'
  console.log(`接続先: host=${host === 'localhost' || host === '127.0.0.1' ? 'ループバック(ローカル)' : host}  db=${db}`)
  if (db !== 'discover_ginza' || !['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`想定外の接続先（host=${host} db=${db}）。中止。`)
  }

  const found = await payload.find({
    collection: 'article-facts',
    where: { discoveredContent: { equals: DC_ID } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const before = found.docs[0] as unknown as Record<string, unknown> | undefined
  if (!before) throw new Error(`DC #${DC_ID} の ArticleFacts が見つからない（先に ./p2 morning --write-facts で draft 作成が必要）`)

  const beforeDc =
    typeof before.discoveredContent === 'object' && before.discoveredContent
      ? (before.discoveredContent as { id: number }).id
      : Number(before.discoveredContent)
  if (beforeDc !== DC_ID) throw new Error(`discoveredContent が想定外（${beforeDc} != ${DC_ID}）。中止。`)
  if (before.enrichmentStatus === 'ready') throw new Error('既に ready 化済み。このスクリプトの対象外（安全のため中止）。')

  console.log(`対象: article-facts id=${before.id}（discoveredContent=#${DC_ID}）`)
  console.log(`現在の enrichmentStatus=${before.enrichmentStatus}\n`)

  const existingProvenance = Array.isArray(before.sourceProvenanceFacts)
    ? (before.sourceProvenanceFacts as Array<{ fact?: string | null }>)
    : []
  const newProvenance = [
    {
      fact: `[human:maron] eventName（商品名）: ${CONFIRMED.eventName} — GINZA SIX公式ページで確認`,
      sourceType: 'official',
      factType: 'other',
      verificationStatus: 'confirmed',
    },
    {
      fact: `[human:maron] whatHappens（商品概要）: ${CONFIRMED.whatHappens}`,
      sourceType: 'official',
      factType: 'other',
      verificationStatus: 'confirmed',
    },
    {
      fact: `[human:maron] eventDate（販売期間・表示）: ${CONFIRMED.eventDate}（終了日の記載なし、推測補完しない）`,
      sourceType: 'official',
      factType: 'date',
      verificationStatus: 'confirmed',
    },
    {
      fact: `[human:maron] priceText（価格）: ${CONFIRMED.priceText}`,
      sourceType: 'official',
      factType: 'price',
      verificationStatus: 'confirmed',
    },
    {
      fact: `[human:maron] venues（販売場所）: ${CONFIRMED.venueName}／${CONFIRMED.venuePlace}`,
      sourceType: 'official',
      factType: 'venue',
      verificationStatus: 'confirmed',
    },
    {
      fact: `[human:maron] officialInfoNote: ${CONFIRMED.officialInfoNote}`,
      sourceType: 'official',
      factType: 'other',
      verificationStatus: 'confirmed',
    },
    {
      fact: `[human:maron] 出典URL: ${CONFIRMED.sourceUrl}（公式ページ公開日: ${CONFIRMED.officialPublishedOn}）`,
      sourceType: 'official',
      factType: 'other',
      verificationStatus: 'confirmed',
    },
  ]
  // 冪等性：同一 fact 文字列が既にあれば重複追加しない（再実行を安全にする）
  const mergedProvenance = [
    ...existingProvenance,
    ...newProvenance.filter((n) => !existingProvenance.some((e) => e.fact === n.fact)),
  ]

  const existingNotes = typeof before.notes === 'string' ? before.notes : ''
  const manualNoteBlock =
    `[human:maron] ${new Date().toISOString()} マロンが公式出典（GINZA SIX）から確認した値を手動確定・自動反映。` +
    ` 終了日は未確認のため入力していない（販売中）。` +
    ` 反映項目: primaryCategory / templateType / season / eventName / whatHappens / eventDate / eventDateISO / priceText / officialInfoNote / venues。` +
    ` 【注意】eventDateISO は販売開始日（2026-09-02）のみが確認済みで終了日は不明。` +
    ` 現行 readyGate は eventDateISO を「過去/未来判定用の機械日付」として扱うため、` +
    ` 実行日（本スクリプト実行日）が 2026-09-03 (JST) 以降の場合、この値のままでは` +
    ` 「eventDateISO / availablePeriod（会期・有効期間が過去）」が missing に残り ready 化できない。` +
    ` 終了日未定の「販売中」商品を扱う恒久ルールは今回未確定（マロンの追加判断が必要）。`
  const mergedNotes = existingNotes ? `${existingNotes}\n${manualNoteBlock}` : manualNoteBlock

  const data = {
    primaryCategory: CONFIRMED.primaryCategory,
    templateType: CONFIRMED.templateType,
    season: CONFIRMED.season,
    eventName: CONFIRMED.eventName,
    whatHappens: CONFIRMED.whatHappens,
    eventDate: CONFIRMED.eventDate,
    eventDateISO: CONFIRMED.eventDateISO,
    priceText: CONFIRMED.priceText,
    officialInfoNote: CONFIRMED.officialInfoNote,
    venues: [{ name: CONFIRMED.venueName, place: CONFIRMED.venuePlace }],
    sourceProvenanceFacts: mergedProvenance,
    notes: mergedNotes,
    // enrichmentStatus は明示的に指定しない（draft のまま。ready へは絶対に変更しない）
  }

  console.log('── 変更前後の差分 ──')
  console.log(diffLine('primaryCategory', before.primaryCategory, data.primaryCategory))
  console.log(diffLine('templateType', before.templateType, data.templateType))
  console.log(diffLine('season', before.season, data.season))
  console.log(diffLine('eventName', before.eventName, data.eventName))
  console.log(diffLine('whatHappens', before.whatHappens, data.whatHappens))
  console.log(diffLine('eventDate', before.eventDate, data.eventDate))
  console.log(diffLine('eventDateISO', before.eventDateISO, data.eventDateISO))
  console.log(diffLine('priceText', before.priceText, data.priceText))
  console.log(diffLine('officialInfoNote', before.officialInfoNote, data.officialInfoNote))
  console.log(diffLine('venues', before.venues, data.venues))
  console.log(`    sourceProvenanceFacts: ${existingProvenance.length}件 -> ${mergedProvenance.length}件（+${mergedProvenance.length - existingProvenance.length}）`)
  console.log(`    notes: ${existingNotes.length}字 -> ${mergedNotes.length}字（追記のみ）`)
  console.log(`    enrichmentStatus: ${before.enrichmentStatus}（変更しない）`)

  if (DRY) {
    ok(true, 'DRY-RUN: DB 書き込みなし（上記は適用予定の内容）')
  } else {
    const updated = await payload.update({
      collection: 'article-facts',
      id: before.id as number,
      overrideAccess: true,
      data: data as never,
    })
    const after = updated as unknown as Record<string, unknown>
    console.log('\n── 実 DB 反映後 ──')
    ok(after.enrichmentStatus === 'draft', 'enrichmentStatus=draft のまま（ready化していない）')
    ok(after.primaryCategory === CONFIRMED.primaryCategory, `primaryCategory=${CONFIRMED.primaryCategory}`)
    ok(after.templateType === CONFIRMED.templateType, `templateType=${CONFIRMED.templateType}`)
    ok(after.eventName === CONFIRMED.eventName, 'eventName 反映')
    ok(after.priceText === CONFIRMED.priceText, 'priceText 反映')
    ok(after.officialInfoNote === CONFIRMED.officialInfoNote, 'officialInfoNote 反映')
    ok(Array.isArray(after.venues) && (after.venues as unknown[]).length === 1, 'venues 1件反映')
    ok(
      Array.isArray(after.sourceProvenanceFacts) && (after.sourceProvenanceFacts as unknown[]).length >= 7,
      'sourceProvenanceFacts 7件以上（confirmed）',
    )
    ok(after.humanReviewedAt == null && after.humanReviewedBy == null, 'humanReviewed* は未設定のまま（ready遷移なし）')
  }

  console.log(`\n=== 結果: ${fail === 0 ? 'PASS ✅' : `FAIL ❌（${fail}）`} ===`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
