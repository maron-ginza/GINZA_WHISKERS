import { getPayload } from 'payload'

import config from '../payload.config'

// 🌈TNS #36 / Article 49：土曜日の選曲差し替え（2026-08-28、マロン承認済み）。
//
// 「夏の日 / オフコース（1984, id=50）」→「I LOVE YOU / オフコース（1981, id=48）」。
// あわせて土曜の見出し・気分・情景・EDITORIAL POINT OF VIEW・選曲理由・編集コメントを、
// 週後半の流れ「金曜の高揚 → 土曜の静けさ → 日曜の余韻」に合わせて書き直す。
//
// 変更対象：
//   - soundtrack-editions id=10 の dailyScenes[5]（土曜）のみ（他6日は不変）
//   - Article 49 body(locale ja) の土曜ブロック 8 個のみ
// reviewStatus は draft のまま。approve・自動投稿はしない。--dry-run で書き込みなし。

const EDITION_ID = 10
const ARTICLE_ID = 49
const OLD_TRACK = 50
const NEW_TRACK = 48
const SAT_DATE = '2026-09-05'

const NEW_SCENE = {
  weeklyEnglishSubtitle: "A Gentle Drizzle, A Weekend's Quiet",
  emotion:
    '金曜の夜の高揚が静かに引いていく土曜日。霧雨と低い気温が街の音を吸い込み、ゆったりとした週末のリズムに身をゆだねる。夏の名残はもう遠く、心はただ静けさの中にある。',
  ginzaExperience: '霧雨の中、カフェの窓辺で温かい飲み物を片手に、行き交う傘をぼんやりと眺める。',
  sceneDescription:
    '霧雨が銀座を静かに包み、通りの喧騒も一段やわらいでいる。週末らしい穏やかな時間が、雨音とともにゆっくりと流れていく。',
  editorialPointOfView:
    '金曜の夜の高揚が静かに鎮まったあと、土曜はただ穏やかに過ごしたい。「quiet」という言葉を持つこの一曲を、霧雨の週末の静けさに重ねた。翌日の余韻へと、そっと橋を渡すように。',
  internalReason:
    'スコア2点（気分タグ「quiet」一致）。Human Editorial により、金曜の高揚→土曜の静けさ→日曜の余韻という週後半のトーン設計を優先し、『夏の日』（邦楽・同一アーティスト、AUTUMN判定週でSUMMERタグのみ）から差し替え。',
  readerFacingComment:
    '霧雨の土曜にそっと置く「I LOVE YOU」——高ぶりのあとの静けさに、この曲のやわらかさがよく似合う。',
}

// Article body の土曜ブロック：old（現在の完全一致）-> new
const BODY_REPLACEMENTS: Array<[string, string]> = [
  [
    '2026-09-05（土曜日）｜GINZA CODE 6：過ぎゆく夏へ',
    '2026-09-05（土曜日）｜GINZA CODE 6：静けさへ',
  ],
  [
    "A Gentle Drizzle, A Summer's Fading Glow",
    "A Gentle Drizzle, A Weekend's Quiet",
  ],
  [
    '天気：霧雨（20.8〜23.5℃）／気分：霧雨に包まれた土曜日、気温の低さが夏の終わりを静かに告げる。ゆったりとした週末のリズムに身を委ねる気分。',
    '天気：霧雨（20.8〜23.5℃）／気分：金曜の夜の高揚が静かに引いていく土曜日。霧雨と低い気温が街の音を吸い込み、ゆったりとした週末のリズムに身をゆだねる。夏の名残はもう遠く、心はただ静けさの中にある。',
  ],
  [
    '過ごし方：霧雨の中、カフェの窓辺で温かい飲み物を片手に街を眺める。',
    '過ごし方：霧雨の中、カフェの窓辺で温かい飲み物を片手に、行き交う傘をぼんやりと眺める。',
  ],
  [
    '霧雨が銀座を静かに包み、気温も涼しさを増している。週末らしい穏やかな時間が、雨音とともに流れていく。',
    '霧雨が銀座を静かに包み、通りの喧騒も一段やわらいでいる。週末らしい穏やかな時間が、雨音とともにゆっくりと流れていく。',
  ],
  [
    'EDITORIAL POINT OF VIEW　夏の終わりを名に持つ曲を、霧雨の土曜の静けさに重ねて。過ぎてゆく季節へ、そっと手を振るように。',
    'EDITORIAL POINT OF VIEW　金曜の夜の高揚が静かに鎮まったあと、土曜はただ穏やかに過ごしたい。「quiet」という言葉を持つこの一曲を、霧雨の週末の静けさに重ねた。翌日の余韻へと、そっと橋を渡すように。',
  ],
  [
    '♪ 「夏の日」／オフコース／1984年',
    '♪ 「I LOVE YOU」／オフコース／1981年',
  ],
  [
    '霧雨の土曜に響く「夏の日」——過ぎゆく季節への静かな敬意がここにある。',
    '霧雨の土曜にそっと置く「I LOVE YOU」——高ぶりのあとの静けさに、この曲のやわらかさがよく似合う。',
  ],
]

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const payload = await getPayload({ config })

  // ── STEP 1: guards ─────────────────────────────────────────
  const guards: string[] = []

  const newTrack = await payload.findByID({ collection: 'music-tracks', id: NEW_TRACK, depth: 0 }).catch(() => null)
  if (!newTrack) guards.push(`music-tracks id=${NEW_TRACK} が見つからない`)
  else {
    if ((newTrack as { origin?: string }).origin !== 'japanese')
      guards.push(`id=${NEW_TRACK} は origin=${(newTrack as { origin?: string }).origin}（japanese 期待＝邦洋比率維持）`)
    if (!(newTrack as { verified?: boolean }).verified) guards.push(`id=${NEW_TRACK} は verified=false`)
    if (!(newTrack as { active?: boolean }).active) guards.push(`id=${NEW_TRACK} は active=false`)
  }

  const ledgerHit = await payload.count({
    collection: 'music-usage-ledger',
    where: { and: [{ musicTrack: { equals: NEW_TRACK } }, { reuseAllowed: { equals: false } }] },
  })
  if (ledgerHit.totalDocs !== 0) guards.push(`id=${NEW_TRACK} は台帳(reuseAllowed=false)に${ledgerHit.totalDocs}件——過去使用重複`)

  const edition = (await payload.findByID({ collection: 'soundtrack-editions', id: EDITION_ID, depth: 0 })) as {
    dailyScenes: Array<Record<string, unknown>>
    music?: { musicBalance?: Record<string, unknown> }
  }
  const satIdx = edition.dailyScenes.findIndex(
    (s) => String(s.date).slice(0, 10) === SAT_DATE && s.weekday === 'saturday',
  )
  if (satIdx === -1) guards.push(`dailyScenes に ${SAT_DATE}(saturday) が見つからない`)
  else {
    const cur = edition.dailyScenes[satIdx].musicSelected as { trackRef?: unknown }
    const curId = typeof cur.trackRef === 'object' && cur.trackRef ? (cur.trackRef as { id: number }).id : cur.trackRef
    if (Number(curId) !== OLD_TRACK) guards.push(`土曜の現在の trackRef=${curId}（期待 ${OLD_TRACK}）`)
  }

  // 他6日が NEW_TRACK を使っていないこと（週内重複防止）
  const others = edition.dailyScenes.filter((_, i) => i !== satIdx)
  for (const s of others) {
    const ms = s.musicSelected as { trackRef?: unknown }
    const id = typeof ms.trackRef === 'object' && ms.trackRef ? (ms.trackRef as { id: number }).id : ms.trackRef
    if (Number(id) === NEW_TRACK) guards.push(`他の日(${s.date})が既に id=${NEW_TRACK} を使用——週内重複`)
  }

  if (guards.length) {
    console.error('[STEP1] 中断：')
    for (const g of guards) console.error('  - ' + g)
    process.exit(2)
  }
  console.log(`[STEP1] guard OK（新曲 id=${NEW_TRACK} は邦楽・verified・台帳0・週内未使用／土曜の現行 trackRef=${OLD_TRACK}）`)

  // ── STEP 2: dailyScenes[sat] を書き換え ────────────────────
  const scenes = JSON.parse(JSON.stringify(edition.dailyScenes)) as Array<Record<string, unknown>>
  const sat = scenes[satIdx]
  const code = sat.tnsEditorialCode as Record<string, unknown>
  code.weeklyEnglishSubtitle = NEW_SCENE.weeklyEnglishSubtitle
  sat.emotion = NEW_SCENE.emotion
  sat.ginzaExperience = NEW_SCENE.ginzaExperience
  sat.sceneDescription = NEW_SCENE.sceneDescription
  sat.editorialPointOfView = NEW_SCENE.editorialPointOfView
  const ms = sat.musicSelected as Record<string, unknown>
  ms.trackRef = NEW_TRACK
  ms.internalReason = NEW_SCENE.internalReason
  ms.readerFacingComment = NEW_SCENE.readerFacingComment
  // pendingHumanSelection は false のまま

  // ── STEP 3: Article body の土曜ブロック置換 ───────────────
  const article = (await payload.findByID({ collection: 'articles', id: ARTICLE_ID, locale: 'ja', depth: 0 })) as {
    reviewStatus?: string
    body?: { root: { children: Array<{ children?: Array<{ text?: string }> }> } }
  }
  if (article.reviewStatus !== 'draft') {
    console.error(`[abort] Article ${ARTICLE_ID} の reviewStatus が "${article.reviewStatus}"`)
    process.exit(2)
  }
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
    if (hits !== 1) notFound.push(`(${hits}回一致) ${oldText}`)
  }
  if (notFound.length) {
    console.error('[STEP3] 中断：想定テキストが1回一致しませんでした:')
    for (const s of notFound) console.error('  - ' + s.slice(0, 90))
    process.exit(2)
  }

  if (dryRun) {
    console.log('[dry-run] dailyScenes[土] trackRef ' + OLD_TRACK + ' -> ' + NEW_TRACK)
    console.log('[dry-run] body 置換 8件 OK')
    console.log('[dry-run] DB書き込みは行いません。')
    process.exit(0)
  }

  await payload.update({ collection: 'soundtrack-editions', id: EDITION_ID, data: { dailyScenes: scenes as never } })
  console.log('[STEP2] soundtrack-editions dailyScenes[土] を更新')
  await payload.update({ collection: 'articles', id: ARTICLE_ID, locale: 'ja', data: { body: body as never } })
  console.log('[STEP3] Article body を更新（reviewStatus は draft のまま）')

  // ── STEP 4: verify ────────────────────────────────────────
  const edAfter = (await payload.findByID({ collection: 'soundtrack-editions', id: EDITION_ID, depth: 1 })) as {
    dailyScenes: Array<Record<string, unknown>>
  }
  const rows = edAfter.dailyScenes.map((s) => {
    const tr = (s.musicSelected as { trackRef?: { id?: number; title?: string; artist?: string; origin?: string } }).trackRef
    return {
      date: String(s.date).slice(0, 10),
      weekday: s.weekday,
      trackId: tr?.id,
      title: tr?.title,
      artist: tr?.artist,
      origin: tr?.origin,
    }
  })
  const jp = rows.filter((r) => r.origin === 'japanese').length
  const intl = rows.filter((r) => r.origin === 'international').length
  const ids = rows.map((r) => r.trackId)
  const dupWithinWeek = ids.length - new Set(ids).size
  // 台帳(reuseAllowed=false)との重複
  const ledgerAll = await payload.find({ collection: 'music-usage-ledger', where: { reuseAllowed: { equals: false } }, limit: 500, depth: 0 })
  const ledgerTrackIds = new Set(ledgerAll.docs.map((d) => Number(typeof d.musicTrack === 'object' ? (d.musicTrack as { id: number }).id : d.musicTrack)))
  const contamination = ids.filter((id) => id != null && ledgerTrackIds.has(Number(id)))

  console.log('[STEP4] verify:')
  console.log(JSON.stringify({ rows, japaneseCount: jp, internationalCount: intl, dupWithinWeek, ledgerContamination: contamination }, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
