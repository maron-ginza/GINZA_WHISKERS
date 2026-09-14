import { getPayload } from 'payload'

import config from '../payload.config'

// 一回限りのデータ投入スクリプト（2026-09-03）。
// DiscoveredContent #310「百世個展『めぐり はじまる』@銀座 蔦屋書店」の
// ArticleFacts draft を、2026-09-03 に確認した公式ページの事実だけで決定的に作成する。
//
//   node --env-file=.env --import=tsx/esm src/scripts/createArticleFactsDraft310.ts            # dry-run（既定・DB 書き込みなし）
//   node --env-file=.env --import=tsx/esm src/scripts/createArticleFactsDraft310.ts --commit   # 実書き込み（1行 create）
//
// 【設計】
// - Claude / Anthropic API を一切呼ばない（payload.create のみ・追加課金 0円）。
// - enrichmentStatus は 'draft' 固定。ready 遷移フックは発火しない。ready 化はしない。
// - 公式確認済みの事実 = 通常フィールド + sourceProvenanceFacts(confirmed)。
// - 公式ページに記載がない事項 = sourceProvenanceFacts(unconfirmed)。本文利用不可。
// - 編集判断項目（areaLead / audienceNote / hashtags / 編集後記等）は空のまま
//   ——マロンが admin で確認・入力する。
// - #310 の article_facts 行が既にあれば中断（上書きしない・二重作成しない）。
// - 既存パイプライン・スキーマ・他コレクション・DiscoveredContent は無変更。
//
// 出典: https://store.tsite.jp/ginza/event/art/56361-2057100821.html （2026-09-03 確認）

const DC_ID = 310
const SOURCE_URL = 'https://store.tsite.jp/ginza/event/art/56361-2057100821.html'

const DRAFT_DATA = {
  discoveredContent: DC_ID,
  enrichmentStatus: 'draft' as const,

  // --- 公式確認済み（通常フィールド） ---
  eventName: '百世個展『めぐり はじまる』',
  whatHappens:
    '消しゴムハンコ作家・百世による個展。オリジナルキャラクターや日常のモチーフを「彫って描く」作品を展示。',
  eventDate: '2026年8月28日（金）〜9月6日（日）',
  eventDateISO: '2026-09-06',
  eventTime: '11時から21時まで（最終日9月6日は19時終了予定）',
  venues: [
    {
      name: '百世個展『めぐり はじまる』',
      place: '銀座 蔦屋書店 ART IN CABINET（GINZA SIX 6F）',
    },
  ],
  // --- システム提案（editorial 判断・事実ではない。マロンは確認のみ） ---
  areaLead: '会場はGINZA SIX 6F・銀座 蔦屋書店内のアートスペース「ART IN CABINET」の1か所',
  audienceNote:
    '消しゴムハンコの素朴で温かな表現や、手仕事のものづくりに惹かれる方に向いています。',
  hashtags: [
    { tag: '#百世個展' },
    { tag: '#消しゴムハンコ' },
    { tag: '#銀座蔦屋書店' },
    { tag: '#GINZASIX' },
    { tag: '#銀座' },
  ],
  paid: 'free' as const,
  applyRequired: 'no' as const,
  officialInfoNote:
    '入場無料。会期中の日曜に消しゴムハンコワークショップ開催予定だが、日程・時間・参加費・定員・申込方法は公式ページに記載がなく、作家Instagram（@momoyo_hanko）・ACG社X（@BPOSinfo）で告知。忌野清志郎の絵本『世界中の人に自慢したいよ』（リットーミュージック刊、2026年9月18日発売予定）を会場で先行販売予定（価格・数量は公式未記載）。撮影可否は公式未記載。',
  notes:
    `[auto:deterministic-fill 2026-09-03] 公式ページ ${SOURCE_URL} を 2026-09-03 に決定的に反映。` +
    '会期・会場・営業時間・入場無料・作家プロフィールは公式明記（confirmed）。' +
    'WS詳細・絵本価格・撮影可否は公式未記載（unconfirmed・本文利用不可）。' +
    'マロンの手入力フォームには依存していない。areaLead / audienceNote / hashtags はシステム提案値（editorial 判断・事実ではない・マロン確認待ち）。editorsNoteSeed / closing / callToAction は任意のため未入力。',

  // --- confirmed / unconfirmed を分離して記録 ---
  sourceProvenanceFacts: [
    // confirmed（本文利用可）
    {
      fact: '会期 2026年8月28日（金）〜9月6日（日）',
      factType: 'date' as const,
      sourceType: 'official' as const,
      verificationStatus: 'confirmed' as const,
    },
    {
      fact: '会場 銀座 蔦屋書店 ART IN CABINET（GINZA SIX 6F）',
      factType: 'venue' as const,
      sourceType: 'official' as const,
      verificationStatus: 'confirmed' as const,
    },
    {
      fact: '営業時間 11:00〜21:00、最終日（9月6日）は19:00終了予定',
      factType: 'hours' as const,
      sourceType: 'official' as const,
      verificationStatus: 'confirmed' as const,
    },
    {
      fact: '入場無料',
      factType: 'price' as const,
      sourceType: 'official' as const,
      verificationStatus: 'confirmed' as const,
    },
    {
      fact: '作家：百世（消しゴムハンコ作家、忌野清志郎の娘）',
      factType: 'other' as const,
      sourceType: 'official' as const,
      verificationStatus: 'confirmed' as const,
    },
    // unconfirmed（本文利用不可・分離記録）
    {
      fact: '会期中の日曜に消しゴムハンコWSを開催予定（日程・時間・参加費・定員・申込方法は公式未記載）',
      factType: 'reservation' as const,
      sourceType: 'official' as const,
      verificationStatus: 'unconfirmed' as const,
    },
    {
      fact: '忌野清志郎の絵本『世界中の人に自慢したいよ』を会場で先行販売予定（2026年9月18日発売予定、価格・数量は公式未記載）',
      factType: 'other' as const,
      sourceType: 'official' as const,
      verificationStatus: 'unconfirmed' as const,
    },
    {
      fact: '会場内の撮影可否',
      factType: 'other' as const,
      sourceType: 'official' as const,
      verificationStatus: 'unconfirmed' as const,
    },
  ],
}

async function main() {
  const commit = process.argv.slice(2).includes('--commit')
  const payload = await getPayload({ config })

  // ガード: #310 の article_facts 行が既にあれば中断
  const existing = await payload.find({
    collection: 'article-facts',
    where: { discoveredContent: { equals: DC_ID } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.totalDocs > 0) {
    console.error(
      `[abort] article-facts に DiscoveredContent #${DC_ID} の行が既に存在します（id=${existing.docs[0].id}）。上書きしません。`,
    )
    process.exit(2)
  }

  // 参考: #310 が approved か
  const dc = await payload.findByID({
    collection: 'discovered-content',
    id: DC_ID,
    depth: 0,
    overrideAccess: true,
  })
  const confirmed = DRAFT_DATA.sourceProvenanceFacts.filter((f) => f.verificationStatus === 'confirmed')
  const unconfirmed = DRAFT_DATA.sourceProvenanceFacts.filter(
    (f) => f.verificationStatus === 'unconfirmed',
  )

  console.log('=== ArticleFacts draft 作成プレビュー（DiscoveredContent #310） ===')
  console.log(`mode: ${commit ? 'COMMIT（実書き込み）' : 'DRY-RUN（DB 書き込みなし）'}`)
  console.log(`DiscoveredContent #${DC_ID} curationStatus = ${(dc as { curationStatus?: string }).curationStatus}`)
  console.log(`既存 article-facts 行: なし（新規 create）`)
  console.log('')
  console.log('--- data（payload.create に渡す内容） ---')
  console.log(JSON.stringify(DRAFT_DATA, null, 2))
  console.log('')
  console.log(`--- sourceProvenanceFacts: confirmed ${confirmed.length} 件 / unconfirmed ${unconfirmed.length} 件 ---`)
  for (const f of confirmed) console.log(`  [confirmed]   (${f.factType}) ${f.fact}`)
  for (const f of unconfirmed) console.log(`  [unconfirmed] (${f.factType}) ${f.fact}`)
  console.log('')
  console.log('--- enrichmentStatus ---')
  console.log(`  ${DRAFT_DATA.enrichmentStatus}（ready 化しない・ready 遷移フックは発火しない）`)

  if (!commit) {
    console.log('')
    console.log('DRY-RUN のため DB へは書き込みません。実行するには --commit を付けてください。')
    process.exit(0)
  }

  // 一回限りの投入スクリプト。DRAFT_DATA は ArticleFacts スキーマに合わせて手で組んだ
  // プレーンオブジェクト（enrichmentStatus:'draft' 固定）。
  const created = await payload.create({
    collection: 'article-facts',
    data: DRAFT_DATA,
    overrideAccess: true,
  })
  console.log('')
  console.log(`[created] article-facts id=${created.id} / enrichmentStatus=${(created as { enrichmentStatus?: string }).enrichmentStatus}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
