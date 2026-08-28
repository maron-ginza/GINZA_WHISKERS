import { getPayload } from 'payload'

import config from '../payload.config'

// 🌈TNS #36 / Article 49 の公開前エディット（2026-08-28、マロン承認済み）。
//
// 対象は本文（body, locale ja）のテキストのみ：
//   1. 各日の h3 見出しから内部コード表記「— TNS Editorial Code: codeN」を除去し、
//      読者向けの「GINZA CODE N：<日本語ムード>」へ置換（7日分）。
//   2. 各日の「EDITORIAL POINT OF VIEW　…」段落を、内部メモ調（〜したい 等）から
//      読者向けの文章へ整える（7日分）。
//   3. 末尾に note 向けハッシュタグ段落を1つ追加。
//
// reviewStatus は draft のまま。approve・自動投稿・選曲（dailyScenes）の変更は行わない。
// --dry-run で書き込みなしのプレビュー。

const ARTICLE_ID = 49

// old（現在の完全一致テキスト） -> new（置換後）
const REPLACEMENTS: Array<[string, string]> = [
  // ── 1. 各日 h3 見出し ───────────────────────────────────────
  [
    '2026-08-31（月曜日） — TNS Editorial Code: code1・リスタート／静かな決意',
    '2026-08-31（月曜日）｜GINZA CODE 1：リスタート／静かな決意',
  ],
  [
    '2026-09-01（火曜日） — TNS Editorial Code: code2',
    '2026-09-01（火曜日）｜GINZA CODE 2：遠い記憶へ',
  ],
  [
    '2026-09-02（水曜日） — TNS Editorial Code: code3',
    '2026-09-02（水曜日）｜GINZA CODE 3：霧雨のなかの内省',
  ],
  [
    '2026-09-03（木曜日） — TNS Editorial Code: code4',
    '2026-09-03（木曜日）｜GINZA CODE 4：驟雨、そして秋の気配',
  ],
  [
    '2026-09-04（金曜日） — TNS Editorial Code: code5・夜が始まる',
    '2026-09-04（金曜日）｜GINZA CODE 5：夜が始まる',
  ],
  [
    '2026-09-05（土曜日） — TNS Editorial Code: code6',
    '2026-09-05（土曜日）｜GINZA CODE 6：過ぎゆく夏へ',
  ],
  [
    '2026-09-06（日曜日） — TNS Editorial Code: code7・Soft-Cloud Ginza',
    '2026-09-06（日曜日）｜GINZA CODE 7：Soft-Cloud Ginza',
  ],
  // ── 2. EDITORIAL POINT OF VIEW（内部メモ調 → 読者向け）─────────
  [
    'EDITORIAL POINT OF VIEW　週の始まりを穏やかに迎えるこの曲は、リスタートというテーマにふさわしい柔らかさを持っている。',
    'EDITORIAL POINT OF VIEW　週の始まりを穏やかに迎えるこの一曲は、「静かな決意」という月曜のテーマに、やわらかく寄り添う。',
  ],
  [
    'EDITORIAL POINT OF VIEW　激しい雷雨の日にこそ、内省的な名曲を添えることで、天候と感情のコントラストを編集として際立たせたい。',
    'EDITORIAL POINT OF VIEW　激しい雷雨の日に、あえて内省的な一曲を。荒れる空と静かな感情のコントラストが、この火曜日の輪郭を描いている。',
  ],
  [
    'EDITORIAL POINT OF VIEW　霧雨の柔らかさと、水色というモチーフの重なりを大切にした選曲コメントを添えたい。',
    'EDITORIAL POINT OF VIEW　霧雨のやわらかさと、「みずいろ」という言葉の色が静かに重なる。週なかの水曜に、街の輪郭をそっとにじませる一曲。',
  ],
  [
    'EDITORIAL POINT OF VIEW　季節の境目を象徴するタイトルの曲を、天候の激しさと重ねて編集した木曜日。',
    'EDITORIAL POINT OF VIEW　季節の名を持つ曲を、驟雨の激しさと重ねて。夏と秋がすれ違う木曜日に、境目の音を置いている。',
  ],
  [
    'EDITORIAL POINT OF VIEW　「夜が始まる」というムードラベルに合わせ、涼やかな夜の訪れを感じさせる選曲コメントを添えた。',
    'EDITORIAL POINT OF VIEW　夜が始まる金曜に、涼やかな一曲を。気温が下がり、霧雨がネオンをぼかす銀座に、静かな高揚が立ち上がる。',
  ],
  [
    'EDITORIAL POINT OF VIEW　夏の終わりを感じさせるタイトルの曲を、土曜日の静けさと重ねて選んだ。',
    'EDITORIAL POINT OF VIEW　夏の終わりを名に持つ曲を、霧雨の土曜の静けさに重ねて。過ぎてゆく季節へ、そっと手を振るように。',
  ],
  [
    'EDITORIAL POINT OF VIEW　「Soft-Cloud Ginza」というムードラベルに合わせ、穏やかな航海のような一曲で週を締めくくりたかった。',
    'EDITORIAL POINT OF VIEW　やわらかな雲の下で、穏やかな航海のような一曲を。季節の境目を静かに渡って、一週間を閉じる。',
  ],
]

const HASHTAG_LINE = '#TokyoNostalgicSoundtrack #銀座 #昭和歌謡 #シティポップ #AOR #GINZAWHISKERS'

function makeParagraph(text: string) {
  return {
    type: 'paragraph',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: [
      { mode: 'normal', text, type: 'text', style: '', detail: 0, format: 0, version: 1 },
    ],
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const payload = await getPayload({ config })

  const article = (await payload.findByID({
    collection: 'articles',
    id: ARTICLE_ID,
    locale: 'ja',
    depth: 0,
  })) as { reviewStatus?: string; body?: { root?: { children?: Array<Record<string, unknown>> } } }

  if (article.reviewStatus !== 'draft') {
    console.error(`[abort] Article ${ARTICLE_ID} の reviewStatus が "${article.reviewStatus}"（draft 以外は編集しない）`)
    process.exit(2)
  }

  const body = JSON.parse(JSON.stringify(article.body)) as {
    root: { children: Array<{ children?: Array<{ text?: string }> }> }
  }

  // ── テキスト置換（完全一致・各1回）────────────────────────
  const notFound: string[] = []
  for (const [oldText, newText] of REPLACEMENTS) {
    let hits = 0
    for (const child of body.root.children) {
      const node = child.children?.[0]
      if (node && node.text === oldText) {
        node.text = newText
        hits++
      }
    }
    if (hits === 0) notFound.push(oldText)
    if (hits > 1) notFound.push(`(複数一致: ${hits}) ${oldText}`)
  }
  if (notFound.length) {
    console.error('[abort] 想定テキストが1回一致しませんでした:')
    for (const s of notFound) console.error('  - ' + s.slice(0, 80))
    process.exit(2)
  }

  // ── ハッシュタグ段落の追加（既存なら追加しない）──────────
  const alreadyHasHashtags = body.root.children.some((c) =>
    (c.children?.[0]?.text ?? '').startsWith('#TokyoNostalgicSoundtrack'),
  )
  if (!alreadyHasHashtags) {
    body.root.children.push(makeParagraph(HASHTAG_LINE) as never)
  }

  if (dryRun) {
    console.log('[dry-run] 置換14件 OK / ハッシュタグ段落追加' + (alreadyHasHashtags ? '（既存のためスキップ）' : ''))
    console.log('[dry-run] 見出し（置換後）:')
    for (const c of body.root.children) {
      const t = c.children?.[0]?.text ?? ''
      if (/^2026-09|^2026-08-31/.test(t)) console.log('   ' + t)
    }
    console.log('[dry-run] 末尾段落: ' + (body.root.children.at(-1)?.children?.[0]?.text ?? ''))
    console.log('[dry-run] DB書き込みは行いません。')
    process.exit(0)
  }

  await payload.update({
    collection: 'articles',
    id: ARTICLE_ID,
    locale: 'ja',
    data: { body: body as never },
  })
  console.log(`[done] Article ${ARTICLE_ID} body を更新（reviewStatus は draft のまま）`)

  // ── verify ────────────────────────────────────────────────
  const after = (await payload.findByID({
    collection: 'articles',
    id: ARTICLE_ID,
    locale: 'ja',
    depth: 0,
  })) as { reviewStatus?: string; body?: { root?: { children?: Array<{ tag?: string; children?: Array<{ text?: string }> }> } } }

  const kids = after.body?.root?.children ?? []
  console.log(JSON.stringify({
    reviewStatus: after.reviewStatus,
    totalBlocks: kids.length,
    headings: kids.filter((c) => c.tag === 'h3').map((c) => c.children?.[0]?.text),
    stillHasInternalCode: kids.some((c) => /TNS Editorial Code|code[1-7]\b/.test(c.children?.[0]?.text ?? '')),
    lastBlock: kids.at(-1)?.children?.[0]?.text,
  }, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
