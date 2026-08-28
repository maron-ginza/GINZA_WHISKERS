import { getPayload } from 'payload'

import config from '../payload.config'

// 🌈TNS #36（気象庁主軸再生成版）/ Article 50 の Human Editorial パス（2026-08-28）。
//
//   1. 各日 h3 見出しの内部コード「— TNS Editorial Code: codeN」を除去し
//      「GINZA CODE N：<日本語ムード>」へ（code2/3/4/6 は日本語ムード見出しを付与）。
//   2. EDITORIAL POINT OF VIEW を読者向け文体へ整える（7日分。fixedMoodLabel 露出も除去）。
//   3. 本文末尾に note 向けハッシュタグ段落を追加。
//   4. 土曜は Human Editorial 継続で I LOVE YOU / オフコース（id48）を維持
//      （自動選曲の「夏の日」id50 から差し替え）。dailyScenes[土]＋本文の土曜ブロックを更新。
//   5. translationStatus.ja = complete。
//
// reviewStatus は draft のまま。approve・自動投稿はしない。--dry-run で書き込みなし。

const ARTICLE_ID = 50
const EDITION_ID = 11
const SAT_DATE = '2026-09-05'
const OLD_SAT_TRACK = 50 // 夏の日 / オフコース
const NEW_SAT_TRACK = 48 // I LOVE YOU / オフコース

const SAT_SCENE = {
  weeklyEnglishSubtitle: "A Soft Drizzle and a Weekend's Quiet",
  emotion:
    '金曜の高揚が静かに引いていく土曜日。弱い霧雨と25℃前後の涼しさが街の音を吸い込み、ゆったりとした週末のリズムに身をゆだねる。',
  ginzaExperience: '傘をささずに歩けるほどの霧雨の中、ゆっくりとウィンドウショッピングを楽しむ。',
  sceneDescription:
    '霧のような雨が街全体を柔らかく包み、気温も一段落ち着いている。週末らしいゆったりとした足取りが目立つ。',
  editorialPointOfView:
    '金曜の高揚が静かに引いたあとの土曜。「quiet」という言葉を持つ一曲を、霧雨の週末の静けさに重ねた。翌日の余韻へ、そっと橋を渡すように。',
  internalReason:
    'スコア2点（気分タグ「quiet」一致）。Human Editorial により、金曜の高揚→土曜の静けさ→日曜の余韻という週後半のトーン設計を優先し、『夏の日』（邦楽・同一アーティスト）から差し替え。',
  readerFacingComment: '高ぶりのあとの静けさに、この曲のやわらかさがよく馴染む。',
}

// old（現在の完全一致テキスト）-> new
const BODY_REPLACEMENTS: Array<[string, string]> = [
  // ── 1. 各日 h3 見出し ──────────────────────────────────────
  [
    '2026-08-31（月曜日） — TNS Editorial Code: code1・リスタート／静かな決意',
    '2026-08-31（月曜日）｜GINZA CODE 1：リスタート／静かな決意',
  ],
  ['2026-09-01（火曜日） — TNS Editorial Code: code2', '2026-09-01（火曜日）｜GINZA CODE 2：遠い記憶へ'],
  ['2026-09-02（水曜日） — TNS Editorial Code: code3', '2026-09-02（水曜日）｜GINZA CODE 3：季節の変わり目に'],
  ['2026-09-03（木曜日） — TNS Editorial Code: code4', '2026-09-03（木曜日）｜GINZA CODE 4：雨の日の落ち着き'],
  [
    '2026-09-04（金曜日） — TNS Editorial Code: code5・夜が始まる',
    '2026-09-04（金曜日）｜GINZA CODE 5：夜が始まる',
  ],
  ['2026-09-05（土曜日） — TNS Editorial Code: code6', '2026-09-05（土曜日）｜GINZA CODE 6：静けさへ'],
  [
    '2026-09-06（日曜日） — TNS Editorial Code: code7・Soft-Cloud Ginza',
    '2026-09-06（日曜日）｜GINZA CODE 7：Soft-Cloud Ginza',
  ],
  // ── 2. EDITORIAL POINT OF VIEW ────────────────────────────
  [
    'EDITORIAL POINT OF VIEW　月曜特有の切り替えの感覚と、季節がまだ夏に留まっている感覚を重ね、無理のないリスタートとして描いた。',
    'EDITORIAL POINT OF VIEW　月曜の切り替えの感覚と、まだ夏に留まる季節の感覚が重なる。無理のない、静かなリスタートの一曲を。',
  ],
  [
    'EDITORIAL POINT OF VIEW　曜日の慣れが生まれる火曜日に、感傷的な余白を持たせる編集を意識した。',
    'EDITORIAL POINT OF VIEW　曜日の慣れが戻ってくる火曜に、感傷のための余白を少しだけ。同じ曇り空の下でも、心の動きは昨日と違う。',
  ],
  [
    'EDITORIAL POINT OF VIEW　水曜日という中間地点に、季節の境目という週全体のテーマを重ねて描いた。',
    'EDITORIAL POINT OF VIEW　週の折り返しという中間地点に、「季節の境目」という今週のテーマがちょうど重なる。半分だけ回った季節を、水曜の気だるさとともに。',
  ],
  [
    'EDITORIAL POINT OF VIEW　雨という要素を、木曜日の落ち着きと季節の移ろいの両方に結びつけて選んだ。',
    'EDITORIAL POINT OF VIEW　一時の雨が、木曜の落ち着きと季節の移ろいの両方を連れてくる。雨音に街の音がやわらぐ時間に。',
  ],
  [
    'EDITORIAL POINT OF VIEW　fixedMoodLabel「夜が始まる」に合わせ、涼やかさと解放感を結びつけて編集した。',
    'EDITORIAL POINT OF VIEW　「夜が始まる」金曜に、涼やかさと解放感を重ねて。雨上がりの気温の下がりが、夜の空気を軽くする。',
  ],
  [
    'EDITORIAL POINT OF VIEW　土曜日の緩やかさと、夏の名残を惜しむ感覚を、霧雨という天気に重ねて描いた。',
    'EDITORIAL POINT OF VIEW　金曜の高揚が静かに引いたあとの土曜。「quiet」という言葉を持つ一曲を、霧雨の週末の静けさに重ねた。翌日の余韻へ、そっと橋を渡すように。',
  ],
  [
    'EDITORIAL POINT OF VIEW　fixedMoodLabel「Soft-Cloud Ginza」を、晴天と季節の境目という週の締めくくりに重ねた。',
    'EDITORIAL POINT OF VIEW　晴れ渡った空と季節の境目で、一週間を閉じる。「Soft-Cloud Ginza」という定点に、この日の清々しさを置いた。',
  ],
  // ── 3. 土曜ブロック（I LOVE YOU へ差し替え）────────────────
  ["A Soft Drizzle and Summer's Last Whisper", "A Soft Drizzle and a Weekend's Quiet"],
  [
    '天気：弱い霧雨（22〜25.4℃）／気分：弱い霧雨と25℃前後の涼しさに、夏の終わりを静かに惜しむような気分が広がる週末の朝。',
    '天気：弱い霧雨（22〜25.4℃）／気分：金曜の高揚が静かに引いていく土曜日。弱い霧雨と25℃前後の涼しさが街の音を吸い込み、ゆったりとした週末のリズムに身をゆだねる。',
  ],
  ['♪ 「夏の日」／オフコース／1984年', '♪ 「I LOVE YOU」／オフコース／1981年'],
  ['夏の終わりを惜しむような響きが、霧雨の街によく馴染む。', '高ぶりのあとの静けさに、この曲のやわらかさがよく馴染む。'],
]

const HASHTAG_LINE = '#TokyoNostalgicSoundtrack #銀座 #昭和歌謡 #シティポップ #AOR #GINZAWHISKERS'

function makeParagraph(text: string) {
  return {
    type: 'paragraph',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: [{ mode: 'normal', text, type: 'text', style: '', detail: 0, format: 0, version: 1 }],
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const payload = await getPayload({ config })

  // ── ガード ───────────────────────────────────────────────
  const newTrack = await payload.findByID({ collection: 'music-tracks', id: NEW_SAT_TRACK, depth: 0 }).catch(() => null)
  const guards: string[] = []
  if (!newTrack) guards.push(`music-tracks id=${NEW_SAT_TRACK} が見つからない`)
  else {
    if ((newTrack as { origin?: string }).origin !== 'japanese') guards.push(`id=${NEW_SAT_TRACK} は origin != japanese`)
    if (!(newTrack as { verified?: boolean }).verified) guards.push(`id=${NEW_SAT_TRACK} は verified=false`)
  }
  const ledgerHit = await payload.count({
    collection: 'music-usage-ledger',
    where: { and: [{ musicTrack: { equals: NEW_SAT_TRACK } }, { reuseAllowed: { equals: false } }] },
  })
  if (ledgerHit.totalDocs !== 0) guards.push(`id=${NEW_SAT_TRACK} は台帳(reuseAllowed=false)に${ledgerHit.totalDocs}件——過去使用重複`)

  const edition = (await payload.findByID({ collection: 'soundtrack-editions', id: EDITION_ID, depth: 0 })) as {
    dailyScenes: Array<Record<string, unknown>>
  }
  const satIdx = edition.dailyScenes.findIndex(
    (s) => String(s.date).slice(0, 10) === SAT_DATE && s.weekday === 'saturday',
  )
  if (satIdx === -1) guards.push(`dailyScenes に ${SAT_DATE}(saturday) が無い`)
  else {
    const cur = edition.dailyScenes[satIdx].musicSelected as { trackRef?: unknown }
    const curId = typeof cur.trackRef === 'object' && cur.trackRef ? (cur.trackRef as { id: number }).id : cur.trackRef
    if (Number(curId) !== OLD_SAT_TRACK) guards.push(`土曜の現在の trackRef=${curId}（期待 ${OLD_SAT_TRACK}）`)
  }
  for (const s of edition.dailyScenes.filter((_, i) => i !== satIdx)) {
    const ms = s.musicSelected as { trackRef?: unknown }
    const id = typeof ms.trackRef === 'object' && ms.trackRef ? (ms.trackRef as { id: number }).id : ms.trackRef
    if (Number(id) === NEW_SAT_TRACK) guards.push(`他の日(${s.date})が既に id=${NEW_SAT_TRACK} を使用——週内重複`)
  }

  const article = (await payload.findByID({ collection: 'articles', id: ARTICLE_ID, locale: 'ja', depth: 0 })) as {
    reviewStatus?: string
    translationStatus?: { ja?: string; en?: string }
    body?: { root: { children: Array<{ children?: Array<{ text?: string }> }> } }
  }
  if (article.reviewStatus !== 'draft') guards.push(`Article ${ARTICLE_ID} の reviewStatus が "${article.reviewStatus}"`)

  if (guards.length) {
    console.error('[abort]')
    for (const g of guards) console.error('  - ' + g)
    process.exit(2)
  }

  // ── 本文置換 ─────────────────────────────────────────────
  const body = JSON.parse(JSON.stringify(article.body)) as {
    root: { children: Array<{ children?: Array<{ text?: string }> }> }
  }
  const notFound: string[] = []
  for (const [oldText, newText] of BODY_REPLACEMENTS) {
    let hits = 0
    for (const child of body.root.children) {
      const node = child.children?.[0]
      if (node && node.text === oldText) {
        node.text = newText
        hits++
      }
    }
    if (hits !== 1) notFound.push(`(${hits}回一致) ${oldText.slice(0, 60)}`)
  }
  if (notFound.length) {
    console.error('[abort] 想定テキストが1回一致しませんでした:')
    for (const s of notFound) console.error('  - ' + s)
    process.exit(2)
  }
  const alreadyHashtags = body.root.children.some((c) =>
    (c.children?.[0]?.text ?? '').startsWith('#TokyoNostalgicSoundtrack'),
  )
  if (!alreadyHashtags) body.root.children.push(makeParagraph(HASHTAG_LINE) as never)

  // ── dailyScenes[土] 差し替え ─────────────────────────────
  const scenes = JSON.parse(JSON.stringify(edition.dailyScenes)) as Array<Record<string, unknown>>
  const sat = scenes[satIdx]
  ;(sat.tnsEditorialCode as Record<string, unknown>).weeklyEnglishSubtitle = SAT_SCENE.weeklyEnglishSubtitle
  sat.emotion = SAT_SCENE.emotion
  sat.ginzaExperience = SAT_SCENE.ginzaExperience
  sat.sceneDescription = SAT_SCENE.sceneDescription
  sat.editorialPointOfView = SAT_SCENE.editorialPointOfView
  const ms = sat.musicSelected as Record<string, unknown>
  ms.trackRef = NEW_SAT_TRACK
  ms.internalReason = SAT_SCENE.internalReason
  ms.readerFacingComment = SAT_SCENE.readerFacingComment

  if (dryRun) {
    console.log('[dry-run] body 置換', BODY_REPLACEMENTS.length, '件 + ハッシュタグ' + (alreadyHashtags ? '（既存）' : '追加'))
    console.log('[dry-run] dailyScenes[土] trackRef', OLD_SAT_TRACK, '->', NEW_SAT_TRACK)
    console.log('[dry-run] translationStatus.ja -> complete')
    console.log('[dry-run] DB書き込みなし')
    process.exit(0)
  }

  await payload.update({ collection: 'soundtrack-editions', id: EDITION_ID, data: { dailyScenes: scenes as never } })
  await payload.update({
    collection: 'articles',
    id: ARTICLE_ID,
    locale: 'ja',
    data: {
      body: body as never,
      translationStatus: { ja: 'complete', en: article.translationStatus?.en ?? 'not_started' },
    } as never,
  })
  console.log('[done] Article 50 body / dailyScenes[土] / translationStatus.ja を更新（reviewStatus は draft）')

  // ── verify ──────────────────────────────────────────────
  const after = (await payload.findByID({ collection: 'articles', id: ARTICLE_ID, locale: 'ja', depth: 0 })) as {
    reviewStatus?: string
    translationStatus?: { ja?: string; en?: string }
    body?: { root?: { children?: Array<{ tag?: string; children?: Array<{ text?: string }> }> } }
  }
  const edAfter = (await payload.findByID({ collection: 'soundtrack-editions', id: EDITION_ID, depth: 1 })) as {
    dailyScenes: Array<{ weekday?: string; musicSelected?: { trackRef?: { id?: number; title?: string; origin?: string } } }>
  }
  const kids = after.body?.root?.children ?? []
  const rows = edAfter.dailyScenes.map((s) => ({
    weekday: s.weekday,
    trackId: s.musicSelected?.trackRef?.id,
    title: s.musicSelected?.trackRef?.title,
    origin: s.musicSelected?.trackRef?.origin,
  }))
  console.log(
    JSON.stringify(
      {
        reviewStatus: after.reviewStatus,
        translationStatus: after.translationStatus,
        headings: kids.filter((c) => c.tag === 'h3').map((c) => c.children?.[0]?.text),
        stillHasInternalCode: kids.some((c) => /TNS Editorial Code|fixedMoodLabel|code[1-7]\b/.test(c.children?.[0]?.text ?? '')),
        lastBlock: kids.at(-1)?.children?.[0]?.text,
        tracks: rows,
        japaneseCount: rows.filter((r) => r.origin === 'japanese').length,
        internationalCount: rows.filter((r) => r.origin === 'international').length,
        dupWithinWeek: rows.length - new Set(rows.map((r) => r.trackId)).size,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
