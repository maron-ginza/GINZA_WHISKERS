// GINZA WHISKERS / Project 02 — 自動制作パイプラインの回帰テスト（2026-09-03）
//
//   node --import=tsx/esm src/scripts/regressPipeline.ts
//
// 完全 in-memory・DB 非接続・AI 呼び出しなし・有料 API なし。
// runThemeToNoteDraft を「renderPreview 差し替え（DI）＋モック payload」で回し、
//   ・green / yellow / red の各シナリオ
//   ・10件一括（1件 red / 1件 例外でも他が継続）
//   ・green だけが green バケット、red は note-draft を作らない
//   ・ready でない ArticleFacts は pending 一覧に出る（auto-ready しない）
// を検証する。出力は /tmp のスクラッチへ書き、検証後に削除する。

import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import type { Payload } from 'payload'

import { runThemeToNoteDraft } from '../lib/pipeline/runThemeToNoteDraft'
import type { CreateDraftFromArticleFactsResult } from '../lib/template/createDraftFromArticleFacts'

let fail = 0
const ok = (c: boolean, label: string) => {
  console.log(`  ${c ? '✅' : '❌'} ${label}`)
  if (!c) fail++
}
const section = (t: string) => console.log(`\n──────── ${t} ────────`)
const NOW = new Date('2026-09-03T00:00:00.000Z')
const URL = 'https://store.tsite.jp/ginza/event/x.html'

// --- 合成 preview（テンプレ経路の createDraftFromArticleFacts 相当） ---
function baseBlocks(over: { intro?: string; whyNow?: string; kihon?: string; kounyu?: string } = {}) {
  return [
    { type: 'paragraph', text: over.intro ?? '秋の銀座に、星座をモチーフにしたネイルのフェアが登場します。ネイルエスの新シリーズ「ホロスコープシリーズ」です。' },
    { type: 'paragraph', text: '指先で巡る、十二の星座。装いを変えなくても、指先から秋を先取りできます。' },
    { type: 'heading', level: 2, text: "EDITOR'S CHOICE | BEAUTY" },
    { type: 'paragraph', text: 'GINZA WHISKERS が今週の銀座から選んだのは、季節の変わり目をネイルで楽しむ、この小さな模様替えです。' },
    { type: 'heading', level: 2, text: '何が見つかる？' },
    { type: 'paragraph', text: 'シリーズ第1弾は、9月の新色「libra」と10月の新色「scorpio」。価格は、libraとscorpioが各2,580円（税込）、monochrome libraryが2,480円（税込）です。' },
    { type: 'heading', level: 2, text: 'WHY NOW?' },
    { type: 'paragraph', text: over.whyNow ?? '夏の名残がまだ残るいま、ひと足先に秋の色を迎えられます。新しい色をひとつ取り入れるだけで、気持ちは自然と秋へ向きます。' },
    { type: 'heading', level: 2, text: "GINZA WHISKERS' NOTE" },
    { type: 'paragraph', text: '星座を選ぶ、という小さな楽しみがあります。自分の星座を選んでもいいし、その日の気分で選んでもいい。' },
    { type: 'heading', level: 2, text: '基本情報' },
    { type: 'paragraph', text: over.kihon ?? '会期：2026年9月4日（金）〜9月27日（日）（終了日は変更される場合があります）\n店舗営業時間：10:30〜21:00（公式イベントページの「時間」欄より）\n会場：銀座 蔦屋書店 文具売り場（GINZA SIX 6F）' },
    { type: 'heading', level: 2, text: '購入について' },
    { type: 'paragraph', text: over.kounyu ?? '対象の3色は、2026年8月28日12時からEC予約受付、9月4日から店頭販売。購入特典は蔦屋書店・TSUTAYA BOOK STORE限定で、EC購入は対象外です。記念ワークショップは完売しています。' },
    { type: 'paragraph', text: 'EC予約・店頭販売の受付状況は、公式イベントページでご確認ください。' },
    { type: 'heading', level: 2, text: 'SOURCE' },
    { type: 'paragraph', text: '情報：銀座 蔦屋書店（確認日 2026-08-30）／https://store.tsite.jp/ginza/event/x.html' },
  ]
}

function makePreview(
  dcId: number,
  articleId: number,
  blocks: ReturnType<typeof baseBlocks>,
  extra: Partial<CreateDraftFromArticleFactsResult['preview']> = {},
): CreateDraftFromArticleFactsResult {
  const preview: CreateDraftFromArticleFactsResult['preview'] = {
    title: `指先に、秋の星空を。銀座で始まるネイルエス「ホロスコープシリーズ ${dcId}」`,
    titleCandidates: [],
    blocks,
    charCount: 1100,
    hashtags: ['#銀座', '#銀座蔦屋書店', '#GINZASIX', '#ネイルエス', '#ホロスコープシリーズ'],
    callToAction: 'EC予約・店頭販売の受付状況は、公式イベントページでご確認ください。',
    appliedTemplate: 'sale',
    provenance: [
      { fact: '会場: 銀座 蔦屋書店', factType: 'venue', verificationStatus: 'confirmed', sourceUrl: URL, verifiedAt: '2026-08-30' },
      { fact: '開催開始: 2026-09-04', factType: 'date', verificationStatus: 'confirmed', sourceUrl: URL, verifiedAt: '2026-08-30' },
      { fact: '開催終了: 2026-09-27', factType: 'date', verificationStatus: 'confirmed', sourceUrl: URL, verifiedAt: '2026-08-30' },
      { fact: '開催時間: 10時30分から21時まで（公式イベントページの「時間」欄より取得。会場の店舗営業時間に一致する場合がある）', factType: 'hours', verificationStatus: 'confirmed', sourceUrl: URL, verifiedAt: '2026-08-30' },
    ],
    facts: {
      eventName: `ネイルエス『ホロスコープシリーズ ${dcId}』`,
      whatHappens: '指先で巡る、十二の星座。',
      eventDate: '2026年9月4日（金）〜9月27日（日）',
      eventDateISO: '2026-09-04T00:00:00.000Z',
      eventTime: '10時30分から21時まで',
      venues: [{ name: 'x', place: '銀座 蔦屋書店 文具売り場（GINZA SIX 6F）' }],
      priceText: 'libra：2,580円（税込）／scorpio：2,580円（税込）／monochrome library：2,480円（税込）',
      officialInfoNote:
        'libra、scorpio、monochrome libraryは、2026年8月28日12時からEC予約受付、9月4日から店頭販売。購入特典は蔦屋書店・TSUTAYA BOOK STORE限定で、EC購入は対象外です。記念ワークショップは完売しています。フェア終了日は変更される場合があります。',
      applyRequired: 'no',
      applyDeadline: null,
      paid: 'unknown',
      areaLead: '銀座 蔦屋書店の文具売り場で、9月4日から、星座をモチーフにしたネイルのフェアが始まります。',
      audienceNote: '星座やネイルを楽しみながら、季節の変わり目に指先から気分を整えたい方へ。',
    },
    primaryCategory: 'BEAUTY',
    templateType: 'sale',
    sourceUrl: URL,
    verifiedAt: '2026-08-30T22:02:07.869Z',
    ...extra,
  }
  return {
    discoveredContentId: dcId,
    status: 'would_create',
    dryRun: true,
    templateEligible: true,
    route: 'template',
    factsSource: 'ready',
    existingArticleId: articleId,
    plan: {
      title: preview.title,
      slug: 's',
      pillar: 'イベント',
      appliedTemplate: 'sale',
      charCount: 1100,
      reviewStatus: 'draft',
      aiGeneratedBy: `template:sale:af#${dcId}`,
      editorialProvenanceCount: 4,
      relatedArticleCount: 0,
    },
    preview,
  }
}

// dcId → 期待 verdict と preview の作り方
const SCENARIOS: Record<number, { verdict: 'green' | 'yellow' | 'red'; make: (dcId: number, aid: number) => CreateDraftFromArticleFactsResult; ready?: boolean }> = {
  1: { verdict: 'green', make: (d, a) => makePreview(d, a, baseBlocks()) },
  2: {
    verdict: 'yellow',
    make: (d, a) =>
      makePreview(d, a, baseBlocks({ whyNow: '指先から季節を整える——そんなささやかな衣替えに、ちょうどいいタイミングです。', intro: '秋の銀座に、ネイルのフェアが登場します。装いを変えなくても指先から季節を整える楽しみがあります。指先から季節を整えることができます。' })),
  },
  3: {
    verdict: 'yellow',
    make: (d, a) =>
      makePreview(d, a, baseBlocks({ intro: '秋の銀座に、ネイルのフェアが登場します。記念ワークショップは完売しています。' })),
  },
  4: {
    verdict: 'red',
    make: (d, a) =>
      makePreview(d, a, baseBlocks({ kounyu: '対象の3色は9月4日から店頭販売。定員は各20名です。参加費は3,000円。開始は2026年9月5日から。' })),
  },
  5: {
    verdict: 'red',
    make: (d, a) =>
      makePreview(d, a, baseBlocks({ kihon: '会期：2026年9月4日（金）〜9月27日（日）\n開催時間：10:30〜21:00\n会場：銀座 蔦屋書店 文具売り場（GINZA SIX 6F）' })),
  },
  6: {
    verdict: 'red',
    make: (d, a) => {
      const p = makePreview(d, a, baseBlocks())
      p.preview!.provenance = [] // 出典なし
      return p
    },
  },
  7: { verdict: 'green', make: (d, a) => makePreview(d, a, baseBlocks()) },
  8: {
    // renderPreview 自体が skipped（記事生成に進めない）→ blocked（red）
    verdict: 'red',
    make: (d) => ({
      discoveredContentId: d,
      status: 'skipped',
      dryRun: true,
      templateEligible: false,
      route: 'human_review',
      factsSource: 'ready',
      reason: 'template_type_unknown',
      missing: ['templateType が unknown。admin で確定してください'],
    }),
  },
  9: { verdict: 'green', make: (d, a) => makePreview(d, a, baseBlocks()), ready: false }, // ready でない → pending（items に出ない）
  10: {
    // 例外：renderPreview が throw → error（他は継続）
    verdict: 'red',
    make: () => {
      throw new Error('意図的な例外（10件目）')
    },
  },
}

function mockPayload(dcIds: number[]): Payload {
  const mock = {
    find: async ({ collection, where }: { collection: string; where?: unknown }) => {
      if (collection === 'source-ledger') return { docs: [] }
      if (collection === 'discovered-content') {
        return { docs: dcIds.map((id) => ({ id, title: `テーマ #${id}`, articleUrl: URL, sourceSite: { name: '銀座 蔦屋書店' }, curationStatus: 'approved' })) }
      }
      if (collection === 'article-facts') {
        const w = JSON.stringify(where ?? {})
        const m = w.match(/"equals":(\d+)/)
        const dcId = m ? Number(m[1]) : 0
        const sc = SCENARIOS[dcId]
        if (!sc) return { docs: [] }
        return {
          docs: [{ id: 7000 + dcId, discoveredContent: dcId, enrichmentStatus: sc.ready === false ? 'draft' : 'ready', templateType: 'sale', primaryCategory: 'BEAUTY' }],
        }
      }
      return { docs: [] }
    },
  }
  return mock as unknown as Payload
}

async function main() {
  const scratch = mkdtempSync(resolve(tmpdir(), 'p2-pipeline-'))
  try {
    const dcIds = Object.keys(SCENARIOS).map(Number)
    const payload = mockPayload(dcIds)

    section('10件一括（dry-run・renderPreview 差し替え）')
    const res = await runThemeToNoteDraft(payload, {
      dryRun: true,
      fetch: false,
      limit: 10,
      date: '2026-09-03',
      now: NOW,
      outRoot: scratch,
      renderPreview: async (_p, dcId) => SCENARIOS[Number(dcId)].make(Number(dcId), 900 + Number(dcId)),
    })

    console.log('  counts:', JSON.stringify(res.counts))
    console.log('  items :', JSON.stringify(res.items.map((i) => ({ dc: i.discoveredContentId, v: i.verdict, s: i.status }))))
    console.log('  pending:', JSON.stringify(res.pending.map((p) => p.discoveredContentId)))

    // 期待：dc9 は ready でない → pending（items に出ない）。処理対象は 9 件。
    ok(res.pending.length === 1 && res.pending[0].discoveredContentId === 9, 'ready でない ArticleFacts（dc9）は pending 一覧へ（auto-ready しない）')
    ok(res.processed === 9, '処理件数 9（10 − pending 1）')

    // 1件 red / 1件 例外でも他が継続
    const v = (id: number) => res.items.find((i) => i.discoveredContentId === id)
    ok(v(1)?.verdict === 'green' && v(1)?.status === 'audited', 'dc1 → green（公式情報が揃い矛盾なし）')
    ok(v(2)?.verdict === 'yellow', 'dc2 → yellow（表現重複）')
    ok(v(3)?.verdict === 'yellow', 'dc3 → yellow（完売 2回以上・購入について外）')
    ok(v(4)?.verdict === 'red' && v(4)?.status === 'audited', 'dc4 → red（推測補完 / 数値矛盾）')
    ok(v(5)?.verdict === 'red', 'dc5 → red（店舗営業時間を「開催時間」として記載）')
    ok(v(6)?.verdict === 'red', 'dc6 → red（出典なし）')
    ok(v(7)?.verdict === 'green', 'dc7 → green')
    ok(v(8)?.verdict === 'red' && v(8)?.status === 'blocked', 'dc8 → red / blocked（renderPreview が skipped＝記事生成に進めない）')
    ok(v(10)?.status === 'error' && !!v(10)?.reason?.includes('意図的な例外'), 'dc10 → error（例外・理由を保持）')
    ok(res.items.length === 9 && res.counts.error === 1, '例外が出ても他 8 件は監査済み（1件が例外でも継続）')

    ok(res.counts.green === 2, 'green 2 件（dc1, dc7）')
    ok(res.counts.yellow === 2, 'yellow 2 件（dc2, dc3）')
    ok(res.counts.red === 4, 'red 4 件（dc4,5,6,8）')

    section('バケット出力・note-draft の有無')
    ok(existsSync(resolve(scratch, '2026-09-03', 'green', 'dc1.json')), 'green バケットに dc1 のカード')
    ok(existsSync(resolve(scratch, '2026-09-03', 'yellow', 'dc2.json')), 'yellow バケットに dc2 のカード')
    ok(existsSync(resolve(scratch, '2026-09-03', 'red', 'dc4.json')), 'red バケットに dc4 のカード')
    ok(existsSync(resolve(scratch, '2026-09-03', 'index.txt')), 'index.txt を出力')
    const idxTxt = readFileSync(resolve(scratch, '2026-09-03', 'index.txt'), 'utf8')
    ok(/🟢 2（公開候補） \/ 🟡 2（保留） \/ 🔴 4（停止）/.test(idxTxt), 'index.txt に green/yellow/red 件数')
    ok(/ready 待ち/.test(idxTxt), 'index.txt に「ready 待ち」（pending）セクション')
    ok(/公開は必ずマロンが手動で承認・実行する/.test(idxTxt), 'index.txt に公開ポリシー注記')

    const greenCard = JSON.parse(readFileSync(resolve(scratch, '2026-09-03', 'green', 'dc1.json'), 'utf8'))
    ok(greenCard.verdict === 'green' && greenCard.bucket === 'green', 'green カード verdict/bucket')
    ok(greenCard.findings.length === 0, 'green カードは指摘 0')
    ok(greenCard.confirmedFacts.length === 4 && greenCard.sourceUrls.length === 1, 'green カードに主要事実・出典URL')
    // dry-run では note-draft は未生成（パス文字列だけ）
    ok(String(greenCard.notePackagePath).includes('dry-run: 未生成'), 'dry-run では note-draft 未生成（パスのみ）')

    const redCard = JSON.parse(readFileSync(resolve(scratch, '2026-09-03', 'red', 'dc4.json'), 'utf8'))
    ok(redCard.notePackagePath === null, 'red カードは notePackagePath=null（公開候補に載せない）')
    const redTxt = readFileSync(resolve(scratch, '2026-09-03', 'red', 'dc4.txt'), 'utf8')
    ok(/🔴 red（生成 \/ 公開候補登録を停止）/.test(redTxt), 'red カード整形に停止理由セクション')

    section('冪等：再実行で green はスキップ（重複生成しない）')
    const res2 = await runThemeToNoteDraft(payload, {
      dryRun: true,
      limit: 10,
      date: '2026-09-03',
      now: NOW,
      outRoot: scratch,
      renderPreview: async (_p, dcId) => SCENARIOS[Number(dcId)].make(Number(dcId), 900 + Number(dcId)),
    })
    const skipped = res2.items.filter((i) => i.status === 'skipped_idempotent')
    ok(skipped.length === 2, '2回目は green 2件が skipped_idempotent（重複生成なし）')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }

  console.log(`\n=== 結果: ${fail === 0 ? 'PASS ✅（全チェック合格）' : `FAIL ❌（${fail} 件）`} ===`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
