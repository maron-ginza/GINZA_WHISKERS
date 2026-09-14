/*
 * GINZA WHISKERS / Project 02 改善 第2段階A（文章品質 refine）— 検証スクリプト
 * （2026-09-02）。
 *
 * 実行:  cd cms && node --import=tsx/esm src/lib/template/renderArticleFromTemplate.check.ts
 *
 * 外部テストランナー・新規パッケージは使わない。決定性・事実保持・禁止語・
 * 未確認情報の非混入・重複回避・文字数・タイトル規則・編集後記の反映を検証し、
 * 失敗時は非ゼロ終了する。DB / Payload / Claude API には一切触れない。
 */
import { ginchakaiFixture } from './__fixtures__/ginchakai'
import { renderArticleFromTemplate } from './renderArticleFromTemplate'

let failures = 0
function ok(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  ✅ ${label}`)
  } else {
    failures += 1
    console.log(`  ❌ ${label}`)
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let n = 0
  let i = haystack.indexOf(needle)
  while (i !== -1) {
    n += 1
    i = haystack.indexOf(needle, i + needle.length)
  }
  return n
}

const { unconfirmedNotes, ...input } = ginchakaiFixture
const OLD_BOILERPLATE = '公式サイトの申し込み要項を、開催の概要'

// ---------------------------------------------------------------------------
// 1. 決定性
// ---------------------------------------------------------------------------
console.log('■ 1. 決定性')
const r1 = renderArticleFromTemplate(input)
const r2 = renderArticleFromTemplate(input)
ok(JSON.stringify(r1) === JSON.stringify(r2), '2回の出力が完全一致（JSON文字列レベル）')
ok(r1.noteBody === r2.noteBody, 'noteBody が完全一致')
ok(r1.title === r2.title, 'title が完全一致')
ok(
  JSON.stringify(r1.titleCandidates) === JSON.stringify(r2.titleCandidates),
  '3つのタイトル候補が2回とも完全一致',
)

const body = r1.noteBody

// ---------------------------------------------------------------------------
// 2. 事実保持（必須要素が入力どおり出力される）
// ---------------------------------------------------------------------------
console.log('■ 2. 事実保持（必須要素が入力どおり出力される）')
const mustContain: string[] = [
  input.fields.eventDate,
  input.fields.eventTime,
  input.fields.applyDeadline,
  input.fields.resultDate,
  input.sourceUrl,
  input.fields.editionLabel,
  input.fields.theme,
  ...input.fields.venues.map((v) => v.name),
  ...input.fields.venues.map((v) => v.place),
]
for (const s of mustContain) ok(body.includes(s), `含む: 「${s}」`)

// ---------------------------------------------------------------------------
// 3. 禁止語・制作用表現・画像指示の非混入
// ---------------------------------------------------------------------------
console.log('■ 3. 禁止語・制作用表現・画像指示の非混入')
const forbidden: string[] = [
  '核記事',
  '事実ベース',
  'WHY NOW',
  "EDITOR'S NOTE",
  'SOURCE:',
  'SOURCE',
  '【CORE',
  '【',
  '→ 次に：',
  '[IMAGE',
  'IMAGE:',
  'アイキャッチ',
  'なぜ、いまお伝えするのか', // refine: 独立見出しにしない
  '席をめぐる催し', // refine 要件8
  '席をめぐる',
]
for (const s of forbidden) ok(!body.includes(s), `含まない: 「${s}」`)
ok(!/\[image/i.test(body), '含まない: 画像マーカー（大文字小文字問わず [IMAGE …]）')

// ---------------------------------------------------------------------------
// 4. 入力にない情報の非追加
// ---------------------------------------------------------------------------
console.log('■ 4. 入力にない情報の非追加')
const notInInput: string[] = [
  '無料',
  '予約不要',
  '先着',
  '雨天',
  'キャンセル待ち',
  '同時開催',
  'コラボ',
  '割引',
  '無料配布',
  '当日券',
]
for (const s of notInInput) ok(!body.includes(s), `含まない（元情報に無い）: 「${s}」`)
console.log('■ 4b. 未確認フィールド（fixture.unconfirmedNotes）が本文に出ていない')
for (const s of unconfirmedNotes) ok(!body.includes(s), `含まない（未確認）: 「${s}」`)

// ---------------------------------------------------------------------------
// 5. 重複回避（同じ日付を本文で繰り返さない）
// ---------------------------------------------------------------------------
console.log('■ 5. 重複回避')
ok(countOccurrences(body, input.fields.editionLabel) === 1, `「${input.fields.editionLabel}」の出現は1回だけ`)
ok(countOccurrences(body, `「${input.fields.theme}」`) === 1, `「${input.fields.theme}」の出現は1回だけ`)
ok(countOccurrences(body, input.fields.eventDate) === 1, `開催日「${input.fields.eventDate}」の出現は1回だけ`)
ok(
  countOccurrences(body, input.fields.applyDeadline) === 1,
  `申込期限「${input.fields.applyDeadline}」の出現は1回だけ`,
)
ok(
  countOccurrences(body, input.fields.resultDate) === 1,
  `当選発表「${input.fields.resultDate}」の出現は1回だけ`,
)

// ---------------------------------------------------------------------------
// 6. 文字数（目標 700〜1,000）
// ---------------------------------------------------------------------------
console.log('■ 6. 文字数')
ok(r1.charCount >= 700 && r1.charCount <= 1000, `charCount=${r1.charCount} が 700〜1,000 の範囲内`)
ok([...body].length === r1.charCount, 'charCount が noteBody のコードポイント数と一致')

// ---------------------------------------------------------------------------
// 7. タイトル規則
// ---------------------------------------------------------------------------
console.log('■ 7. タイトル規則')
ok(typeof r1.title === 'string' && r1.title.length > 0, 'title が非空文字列')
ok(r1.titleCandidates.length === 3, 'titleCandidates が3件')
ok(r1.titleCandidates[0] === r1.title, 'title は titleCandidates[0]')
ok(r1.titleCandidates.every((t) => t.includes(input.fields.eventName)), '全タイトル案にイベント名を含む')
ok([...r1.title].length <= 45, `基本タイトルが45文字以内（実際: ${[...r1.title].length}）`)
r1.titleCandidates.forEach((t, i) =>
  ok([...t].length <= 45, `タイトル候補${i + 1}が45文字以内（実際: ${[...t].length}）`),
)
// 基本タイトルには開催日・申込期限を詰め込まない
ok(
  !r1.title.includes(input.fields.eventDate) && !r1.title.includes(input.fields.applyDeadline),
  '基本タイトルに開催日・申込期限を詰め込んでいない',
)
// 候補2/3が開催日・申込期限を両方は含まない（片方ずつ）
ok(
  !(r1.titleCandidates[1].includes(input.fields.eventDate) && r1.titleCandidates[1].includes(input.fields.applyDeadline)),
  'タイトル候補2は開催日と申込期限を同時に含まない',
)
ok(
  !(r1.titleCandidates[2].includes(input.fields.eventDate) && r1.titleCandidates[2].includes(input.fields.applyDeadline)),
  'タイトル候補3は開催日と申込期限を同時に含まない',
)

// ---------------------------------------------------------------------------
// 8. 構造・provenance
// ---------------------------------------------------------------------------
console.log('■ 8. 構造・provenance')
const headings = r1.blocks.filter((b) => b.type === 'heading')
const expectedHeadings = [
  `今年の${input.fields.eventName}と、参加のしかた`,
  'GINZA WHISKERS の視点',
  '次の一歩',
]
ok(headings.length === expectedHeadings.length, `見出しが${expectedHeadings.length}つ（実際: ${headings.length}）`)
ok(
  headings.map((h) => h.text).join(' | ') === expectedHeadings.join(' | '),
  '見出しの内容と順序が期待どおり（「なぜ、いま」「公式情報」の見出しは無い）',
)
ok(headings.every((h) => h.level === 2), '全見出しが level 2')
ok(r1.blocks[0].type === 'paragraph', '先頭ブロックは段落（導入）')
ok(r1.blocks.filter((b) => b.type === 'quote').length === 0, '引用ブロックは使わない（公式情報は末尾の簡潔行）')

const confirmedCount = input.sourceProvenance.filter((p) => p.verificationStatus === 'confirmed').length
ok(r1.provenance.length === confirmedCount, `provenance 件数 = confirmed 件数（${confirmedCount}）`)
ok(r1.provenance.every((p) => p.verificationStatus === 'confirmed'), 'provenance は全件 confirmed')
ok(r1.provenance.every((p) => p.sourceUrl === input.sourceUrl), 'provenance の sourceUrl が全件 入力どおり')

// ---------------------------------------------------------------------------
// 9. 編集後記（editorsNoteSeed）の反映
// ---------------------------------------------------------------------------
console.log('■ 9. 編集後記（editorsNoteSeed）の反映')
const seed = (input.fields.editorsNoteSeed ?? '').trim()
ok(seed.length > 0, 'fixture に editorsNoteSeed がある')
ok(body.includes(seed), 'editorsNoteSeed の文章がそのまま本文に含まれる（事実を変えていない）')
ok(!body.includes(OLD_BOILERPLATE), `旧・固定説明文（「${OLD_BOILERPLATE}…」）を使っていない`)
// seed は「GINZA WHISKERS の視点」見出しの直後の段落
const gwIdx = r1.blocks.findIndex((b) => b.type === 'heading' && b.text === 'GINZA WHISKERS の視点')
ok(gwIdx >= 0 && r1.blocks[gwIdx + 1]?.type === 'paragraph' && r1.blocks[gwIdx + 1].text === seed,
  '「GINZA WHISKERS の視点」の直後段落が editorsNoteSeed と一致')

// ---------------------------------------------------------------------------
// 10. 「なぜ、いま」の統合（独立見出しにせず申込案内へ）
// ---------------------------------------------------------------------------
console.log('■ 10. 「なぜ、いま」の統合')
ok(body.includes('受付はすでに始まって'), '申込案内に「受付はすでに始まって（いる）」という今伝える理由が統合されている')

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------
console.log('\n──────── titleCandidates ────────')
r1.titleCandidates.forEach((t, i) => console.log(`  ${i + 1}. ${t}  （${[...t].length}文字）`))
console.log('\n──────── 生成された noteBody（全文） ────────')
console.log(body)
console.log('──────── noteBody ここまで ────────')
console.log(`\n文字数(charCount): ${r1.charCount}`)
console.log(`ブロック数: ${r1.blocks.length}  / 見出し: ${headings.length}  / 引用: ${r1.blocks.filter((b) => b.type === 'quote').length}`)
console.log(`provenance: ${r1.provenance.length} 件`)

console.log(`\n=== 結果: ${failures === 0 ? 'PASS ✅（全チェック合格）' : `FAIL ❌（${failures} 件の不合格）`} ===`)
process.exit(failures === 0 ? 0 : 1)
