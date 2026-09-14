/*
 * GINZA WHISKERS / Project 02 — 自動制作パイプライン 監査コアの検証（2026-09-03）
 *
 * 実行:  cd cms && node --import=tsx/esm src/lib/audit/audit.check.ts
 *
 * 決定的・DB 非接続・AI 呼び出しなし。green / yellow / red の各シナリオと
 * 6つの sale 共通検査・重複検査・リスク集計を検証する。
 */
import { runArticleBodyChecks, type ArticleUnderAudit } from './articleBodyChecks'
import { aggregateVerdict } from './riskModel'
import { buildAuditCard, renderAuditCardText, renderAuditIndexText } from './buildAuditCard'

let fail = 0
const ok = (c: boolean, label: string) => {
  console.log(`  ${c ? '✅' : '❌'} ${label}`)
  if (!c) fail++
}
const section = (t: string) => console.log(`\n──────── ${t} ────────`)
const NOW = new Date('2026-09-03T00:00:00.000Z')
const FUT = '2026-09-20T00:00:00.000Z'

const URL = 'https://store.tsite.jp/ginza/event/x.html'

/** #331 相当の green な sale 記事 */
function greenSale(over: Partial<ArticleUnderAudit> = {}): ArticleUnderAudit {
  return {
    articleId: 55,
    discoveredContentId: 331,
    title: '指先に、秋の星空を。銀座で始まるネイルエス「ホロスコープシリーズ」',
    appliedTemplate: 'sale',
    templateType: 'sale',
    primaryCategory: 'BEAUTY',
    callToAction: 'EC予約・店頭販売の受付状況は、公式イベントページでご確認ください。',
    ctaInBody: true,
    hashtags: ['#銀座', '#銀座蔦屋書店', '#GINZASIX', '#ネイルエス', '#ホロスコープシリーズ'],
    hasOfficialUrl: true,
    verifiedAt: '2026-08-30T22:02:07.869Z',
    provenance: [
      { fact: '会場: 銀座 蔦屋書店', factType: 'venue', verificationStatus: 'confirmed', sourceUrl: URL, verifiedAt: '2026-08-30' },
      { fact: '開催開始: 2026-09-04', factType: 'date', verificationStatus: 'confirmed', sourceUrl: URL, verifiedAt: '2026-08-30' },
      { fact: '開催終了: 2026-09-27', factType: 'date', verificationStatus: 'confirmed', sourceUrl: URL, verifiedAt: '2026-08-30' },
      {
        fact: '開催時間: 10時30分から21時まで（公式イベントページの「時間」欄より取得。会場の店舗営業時間に一致する場合がある）',
        factType: 'hours',
        verificationStatus: 'confirmed',
        sourceUrl: URL,
        verifiedAt: '2026-08-30',
      },
    ],
    facts: {
      eventName: 'ネイルエス『ホロスコープシリーズ 開幕』',
      whatHappens:
        '指先で巡る、十二の星座。シリーズ第1弾として登場するのは、てんびん座をモチーフにした9月の新色「libra」と、さそり座をモチーフにした10月の新色「scorpio」。',
      eventDate: '2026年9月4日（金）〜9月27日（日）',
      eventDateISO: '2026-09-04T00:00:00.000Z',
      eventTime: '10時30分から21時まで',
      venues: [{ name: 'x', place: '銀座 蔦屋書店 文具売り場（GINZA SIX 6F）' }],
      priceText: 'libra：2,580円（税込）／scorpio：2,580円（税込）／monochrome library：2,480円（税込）',
      officialInfoNote:
        'libra、scorpio、monochrome libraryは、2026年8月28日12時からEC予約受付、9月4日から店頭販売。購入特典は蔦屋書店・TSUTAYA BOOK STORE限定で、EC購入は対象外です。記念ワークショップは完売しています。フェア終了日は変更される場合があります。',
      areaLead: '銀座 蔦屋書店の文具売り場で、9月4日から、星座をモチーフにしたネイルのフェアが始まります。',
      audienceNote: '星座やネイルを楽しみながら、季節の変わり目に指先から気分を整えたい方へ。',
      paid: 'unknown',
    },
    sections: [
      { name: '導入', text: '秋の銀座に、星座をモチーフにしたネイルのフェアが登場します。ネイルエスの新シリーズ「ホロスコープシリーズ」です。指先で巡る、十二の星座。装いを変えなくても、指先から秋を先取りできます。' },
      { name: "EDITOR'S CHOICE | BEAUTY", text: 'GINZA WHISKERS が今週の銀座から選んだのは、季節の変わり目をネイルで楽しむ、この小さな模様替えです。いつも目に入る指先だからこそ、色ひとつで一日の気分が変わります。' },
      { name: '何が見つかる？', text: 'シリーズ第1弾として登場するのは、てんびん座をモチーフにした9月の新色「libra」と、さそり座をモチーフにした10月の新色「scorpio」。さらに、過去に販売し好評だった人気色「monochrome library」も再販します。価格は、libraとscorpioが各2,580円（税込）、monochrome libraryが2,480円（税込）です。' },
      { name: 'WHY NOW?', text: '夏の名残がまだ残るいま、ひと足先に秋の色を迎えられます。予定を空けなくても、買い物のついでに立ち寄れるフェアです。新しい色をひとつ取り入れるだけで、気持ちは自然と秋へ向きます。ささやかな衣替えに、ちょうどいい時期です。' },
      { name: "GINZA WHISKERS' NOTE", text: '星座を選ぶ、という小さな楽しみがあります。自分の星座を選んでもいいし、その日の気分で選んでもいい。星座やネイルを楽しみながら、季節の変わり目に自分を整えたい——そんな人に、よく似合うフェアです。' },
      { name: '基本情報', text: '会期：2026年9月4日（金）〜9月27日（日）（終了日は変更される場合があります）\n店舗営業時間：10:30〜21:00（公式イベントページの「時間」欄より）\n会場：銀座 蔦屋書店 文具売り場（GINZA SIX 6F）' },
      { name: '購入について', text: '対象の3色は、2026年8月28日12時からEC予約受付、9月4日から店頭販売。購入特典は蔦屋書店・TSUTAYA BOOK STORE限定で、EC購入は対象外です。記念ワークショップは完売しています。' },
      { name: 'SOURCE', text: '情報：銀座 蔦屋書店（確認日 2026-08-30）／https://store.tsite.jp/ginza/event/x.html' },
    ],
    ...over,
  }
}

// ---------------------------------------------------------------------------
section('S1: green — #331 相当の sale 記事は指摘 0（公式情報が揃い矛盾なし）')
{
  const a = greenSale()
  const findings = runArticleBodyChecks(a, { now: NOW })
  console.log('  findings:', JSON.stringify(findings.map((f) => f.checkId)))
  ok(findings.length === 0, `指摘 0 件（実際: ${findings.length}）`)
  ok(aggregateVerdict(findings) === 'green', 'verdict = green')
  const card = buildAuditCard({ article: a, findings, notePackagePath: '.devlogs/pipeline/x/green/55.json', now: NOW })
  ok(card.verdict === 'green' && card.bucket === 'green', 'カード verdict/bucket = green')
  ok(card.confirmedFacts.length === 4, 'confirmedFacts 4 件')
  ok(card.editorialExpressions.length > 0, '編集表現を抽出')
  ok(card.cta.warranted === true && card.cta.inBody === true, 'CTA 要 かつ 本文にあり')
}

// ---------------------------------------------------------------------------
section('S2: yellow — 表現重複（10字以上の同一表現が別セクション）')
{
  const a = greenSale({
    sections: greenSale().sections.map((s) =>
      s.name === 'WHY NOW?'
        ? { ...s, text: '指先から季節を整える——そんなささやかな衣替えに、ちょうどいいタイミングです。' }
        : s.name === '導入'
          ? { ...s, text: '秋の銀座に、フェアが登場します。指先から季節を整えることができます。装いを変えなくても指先から季節を整える楽しみがあります。' }
          : s,
    ),
  })
  const findings = runArticleBodyChecks(a, { now: NOW })
  const codes = findings.map((f) => f.checkId)
  console.log('  findings:', JSON.stringify(codes))
  ok(codes.includes('crossSectionRepeat'), '「指先から季節を整える」の反復を crossSectionRepeat で検出')
  ok(findings.every((f) => f.severity === 'yellow'), 'すべて yellow')
  ok(aggregateVerdict(findings) === 'yellow', 'verdict = yellow')
}

// ---------------------------------------------------------------------------
section('S3: yellow — 完売が本文2回以上 ＋ 購入についてセクション外')
{
  const a = greenSale({
    sections: greenSale().sections.map((s) =>
      s.name === '導入'
        ? { ...s, text: '秋の銀座に、ネイルのフェアが登場します。記念ワークショップは完売しています。' }
        : s,
    ),
  })
  const findings = runArticleBodyChecks(a, { now: NOW })
  const codes = findings.map((f) => f.checkId)
  console.log('  findings:', JSON.stringify(codes))
  ok(codes.includes('soldOutRepeated'), '完売2回 → soldOutRepeated')
  ok(codes.includes('soldOutOutsideSection'), '購入について以外に完売 → soldOutOutsideSection')
  ok(aggregateVerdict(findings) === 'yellow', 'verdict = yellow（red は無い＝公式確認済みのため）')
}

// ---------------------------------------------------------------------------
section('S4: red — 未確認の「完売」表現')
{
  const g = greenSale()
  const a = greenSale({
    facts: { ...g.facts, officialInfoNote: 'libra、scorpioは9月4日から店頭販売。' }, // 完売の記載なし
    provenance: g.provenance, // 完売の confirmed fact なし
    sections: g.sections.map((s) =>
      s.name === '購入について' ? { ...s, text: '対象の3色は9月4日から店頭販売。記念ワークショップは完売しています。' } : s,
    ),
  })
  const findings = runArticleBodyChecks(a, { now: NOW })
  const codes = findings.map((f) => f.checkId)
  console.log('  findings:', JSON.stringify(codes))
  ok(codes.includes('soldOutUnverified'), '未確認の完売 → red soldOutUnverified')
  ok(findings.find((f) => f.checkId === 'soldOutUnverified')?.severity === 'red', 'severity = red')
  ok(aggregateVerdict(findings) === 'red', 'verdict = red')
}

// ---------------------------------------------------------------------------
section('S5: red — 店舗営業時間を「開催時間」として記載（sale）')
{
  const g = greenSale()
  const a = greenSale({
    sections: g.sections.map((s) =>
      s.name === '基本情報'
        ? { ...s, text: '会期：2026年9月4日（金）〜9月27日（日）\n開催時間：10:30〜21:00\n会場：銀座 蔦屋書店 文具売り場（GINZA SIX 6F）' }
        : s,
    ),
  })
  const findings = runArticleBodyChecks(a, { now: NOW })
  const codes = findings.map((f) => f.checkId)
  console.log('  findings:', JSON.stringify(codes))
  ok(codes.includes('storeHoursMislabeled'), '「開催時間：10:30」→ red storeHoursMislabeled')
  ok(findings.find((f) => f.checkId === 'storeHoursMislabeled')?.severity === 'red', 'severity = red')
}

// ---------------------------------------------------------------------------
section('S6: red — 推測補完（confirmed にない数値）＋ 数値矛盾')
{
  const g = greenSale()
  const a = greenSale({
    sections: g.sections.map((s) =>
      s.name === '購入について'
        ? { ...s, text: '定員は各20名です。参加費は3,000円。開始は2026年9月5日から。' }
        : s,
    ),
  })
  const findings = runArticleBodyChecks(a, { now: NOW })
  const codes = findings.map((f) => f.checkId)
  console.log('  findings:', JSON.stringify(codes))
  ok(codes.includes('unbackedClaim'), '「各20名」「3,000円」→ unbackedClaim（推測補完）')
  ok(codes.includes('numericConflict'), '「2026年9月5日」→ numericConflict（eventDateISO は 9月4日）')
  ok(aggregateVerdict(findings) === 'red', 'verdict = red')
}

// ---------------------------------------------------------------------------
section('S7: red — 出典なし（provenance 空）')
{
  const a = greenSale({ provenance: [] })
  const findings = runArticleBodyChecks(a, { now: NOW })
  ok(findings.some((f) => f.checkId === 'noProvenance' && f.severity === 'red'), 'provenance 空 → red noProvenance')
  ok(aggregateVerdict(findings) === 'red', 'verdict = red')
}

// ---------------------------------------------------------------------------
section('S8: yellow — CTA を無条件に出さない（exhibition に CTA）')
{
  const a: ArticleUnderAudit = {
    ...greenSale(),
    appliedTemplate: 'exhibition',
    templateType: 'exhibition',
    callToAction: '詳細と参加方法は、公式の案内をご確認ください。',
    ctaInBody: true,
    facts: { ...greenSale().facts, applyRequired: 'no' },
  }
  const findings = runArticleBodyChecks(a, { now: NOW })
  const codes = findings.map((f) => f.checkId)
  console.log('  findings:', JSON.stringify(codes))
  ok(codes.includes('ctaNotWarranted'), '購入も申込も無いのに CTA → yellow ctaNotWarranted')
}

// ---------------------------------------------------------------------------
section('S9: yellow — 公式↔編集の混在（NOTE に日付 / 基本情報に「必見」）')
{
  const g = greenSale()
  const a = greenSale({
    sections: g.sections.map((s) => {
      if (s.name === "GINZA WHISKERS' NOTE") return { ...s, text: '星座を選ぶ、という小さな楽しみがあります。2026年9月4日から始まります。' }
      if (s.name === '基本情報') return { ...s, text: '会期：2026年9月4日（金）〜9月27日（日）\n店舗営業時間：10:30〜21:00（公式イベントページの「時間」欄より）\n会場：銀座 蔦屋書店 文具売り場（GINZA SIX 6F）。必見です。' }
      return s
    }),
  })
  const findings = runArticleBodyChecks(a, { now: NOW })
  const codes = findings.map((f) => f.checkId)
  console.log('  findings:', JSON.stringify(codes))
  ok(codes.includes('factInEditorialSection'), 'NOTE に日付 → factInEditorialSection')
  ok(codes.includes('opinionInInfoSection'), '基本情報に「必見」→ opinionInInfoSection')
  ok(aggregateVerdict(findings) === 'yellow', 'verdict = yellow')
}

// ---------------------------------------------------------------------------
section('S10: green — 固有名詞・日付・価格・出典表示は重複判定の対象外')
{
  // 会場名・イベント名・日付・URL を複数セクションに入れても crossSectionRepeat にしない
  const g = greenSale()
  const a = greenSale({
    sections: g.sections.map((s) =>
      s.name === '導入'
        ? { ...s, text: 'ネイルエス『ホロスコープシリーズ 開幕』が、銀座 蔦屋書店 文具売り場（GINZA SIX 6F）で、2026年9月4日（金）〜9月27日（日）に開催されます。' }
        : s,
    ),
  })
  const findings = runArticleBodyChecks(a, { now: NOW })
  const codes = findings.map((f) => f.checkId)
  console.log('  findings:', JSON.stringify(codes))
  ok(!codes.includes('crossSectionRepeat'), '固有名詞・会場・日付の再掲は crossSectionRepeat にしない')
}

// ---------------------------------------------------------------------------
section('S11: 集計 — red > yellow > green / インデックス整形')
{
  const cards = [
    buildAuditCard({ article: greenSale(), findings: [], now: NOW }),
    buildAuditCard({
      article: greenSale(),
      findings: [{ checkId: 'crossSectionRepeat', severity: 'yellow', message: 'x' }],
      now: NOW,
    }),
    buildAuditCard({
      article: greenSale(),
      findings: [
        { checkId: 'soldOutUnverified', severity: 'red', message: 'x' },
        { checkId: 'crossSectionRepeat', severity: 'yellow', message: 'y' },
      ],
      now: NOW,
    }),
  ]
  ok(cards[0].verdict === 'green' && cards[1].verdict === 'yellow' && cards[2].verdict === 'red', 'verdict 集計')
  ok(cards[2].counts.red === 1 && cards[2].counts.yellow === 1, 'counts 集計')
  const idx = renderAuditIndexText(cards, { date: '2026-09-03' })
  ok(/🟢 1（公開候補） \/ 🟡 1（保留） \/ 🔴 1（停止）/.test(idx), 'インデックスに green/yellow/red 件数')
  ok(/reviewStatus は draft のまま・自動公開なし/.test(idx), 'インデックスに公開ポリシー注記')
  ok(cards[2].notePackagePath === null, 'red カードは notePackagePath=null')
  // カード整形テキストが例外なく生成できる
  ok(renderAuditCardText(cards[2]).includes('🔴 red（生成 / 公開候補登録を停止）'), 'red カード整形に理由セクション')
  ok(renderAuditCardText(cards[1]).includes('🟡 yellow（該当箇所のみ確認・保留）'), 'yellow カード整形に該当箇所セクション')
}

console.log(`\n=== 結果: ${fail === 0 ? 'PASS ✅（全チェック合格）' : `FAIL ❌（${fail} 件）`} ===`)
process.exit(fail === 0 ? 0 : 1)
