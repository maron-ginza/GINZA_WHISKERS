// Project 02-2 収益化② Tier 1（2026-08-30）：記事生成「後」の決定的品質ゲート。
//
// pre-gate（interestArticlePreGate.ts）が「候補として妥当か」の粗いふるいなのに対し、
// ここでは AI が実際に生成した ginza_whiskers（および interest）候補の本文を検査し、
// 4品質ゲートの本判定を行う。AI呼び出しなし。
//
// 【9月Trial の扱い】すべて WARNING として記録するのみ（hard drop しない）。
// 呼び出し側（generateMultiAngleArticleDrafts）が warnObserveMode の間は
// included から除外せず、WARNING コードだけを上流へ渡す。
//
//   weakGinzaSpecificity      … 会場/日付の出典も、銀座での具体的行為の記述も無い
//   noConcreteGinzaExperience … 本文に「銀座で見る/歩く/訪れる/体験する具体対象」が無い
//   weakEditorialViewpoint    … editorsNote が空・短すぎ・content の言い換え・選定理由の語が無い
//   whyNowNotDateBacked       … whyNow が空、または日付/会期に接地していない
//   unsourcedHistory          … 裏付けのない歴史・年代・一般論
//   factLeakInEditorsNote     … editorsNote に日付/料金/時刻などの事実情報が混入
//   editorsNoteRestatesContent… editorsNote が content+whyNow の言い換え（類似度過大）

import { computeCharBigramJaccardSimilarity } from './textSimilarity'
import { checkFactNoteSeparation } from './factNoteSeparation'
import { checkUnsourcedHistory } from './unsourcedHistoryGuard'

export interface InterestPostGateConfig {
  restateSim: number
  edNoteMinChars: number
}

export interface PostGateProvenanceFact {
  fact: string
  factType: string
  verificationStatus: string
}

export interface InterestPostGateCandidate {
  angle: string
  title: string
  content: string
  whyNow: string
  editorsNote: string
  sourceProvenanceFacts: PostGateProvenanceFact[]
}

export interface InterestPostGateDcContext {
  venue?: string | null
  excerpt?: string | null
  title?: string | null
  contentType?: string | null
}

export interface InterestPostGateResult {
  warnings: string[]
  /** WARNING コード → 人間向けの短い説明（ログ・CLI 表示用） */
  details: Record<string, string>
}

// 「銀座で（具体的に）見る・歩く・訪れる・体験する」という記述の検出。
const GINZA_EXPERIENCE_RE =
  /(銀座|GINZA|Ginza|中央区)[^。\n]{0,40}(?:で|を|に|へ)[^。\n]{0,28}(?:見(?:る|られ|に行|学|物)|歩(?:く|ける|いて)|訪れ|巡(?:る|れ)|立ち寄|入場|鑑賞|散策|味わ|体験|楽し(?:む|める)|過ごせ|足を運|出かけ|訪ね)/

// editorsNote が「選定理由・新しい見方」を語っていることを示す語。
const EDNOTE_RATIONALE_RE =
  /(選(?:ん|定|び)|注目|GINZA WHISKERS|編集部|私たち|見方|捉え|読み解|接続|昭和浪漫|六本柱|6本柱|昔・今・未来|なぜ)/

// whyNow が日付・会期に接地していることを示す語。
const WHYNOW_DATE_RE = /\d{3,4}\s*年|\d{1,2}\s*月|会期|開催(?:期間|中)|(?:まで|から)|今(?:週|月|季)|この(?:週末|時期)/

export function evaluateInterestArticlePostGate(
  cand: InterestPostGateCandidate,
  dc: InterestPostGateDcContext,
  config: InterestPostGateConfig,
): InterestPostGateResult {
  const warnings: string[] = []
  const details: Record<string, string> = {}
  const content = cand.content ?? ''
  const whyNow = cand.whyNow ?? ''
  const editorsNote = (cand.editorsNote ?? '').trim()
  const contentWhyNow = `${content}\n${whyNow}`

  const venueStr = (dc.venue ?? '').trim()
  const hasVenueOrDateFact = cand.sourceProvenanceFacts.some(
    (f) => f.factType === 'venue' || f.factType === 'date',
  )
  const ginzaExperienceInBody = GINZA_EXPERIENCE_RE.test(content) || GINZA_EXPERIENCE_RE.test(whyNow)

  // --- ゲート1（本判定）: 銀座固有性 ---
  if (!hasVenueOrDateFact && !ginzaExperienceInBody) {
    warnings.push('weakGinzaSpecificity')
    details.weakGinzaSpecificity =
      '会場/日付の sourceProvenance も、銀座での具体的な行為の記述も無い'
  }

  // --- ゲート3（本判定 / 項目3）: 銀座で具体的に見る/歩く/体験する対象 ---
  const concreteByRegex = GINZA_EXPERIENCE_RE.test(content)
  const concreteByVenueFact =
    venueStr.length > 0 &&
    content.includes(venueStr) &&
    cand.sourceProvenanceFacts.some((f) => f.factType === 'venue')
  const concreteByExhibitionVenue =
    (dc.contentType === 'exhibition' || dc.contentType === 'event') &&
    venueStr.length > 0 &&
    content.includes(venueStr)
  if (!concreteByRegex && !concreteByVenueFact && !concreteByExhibitionVenue) {
    warnings.push('noConcreteGinzaExperience')
    details.noConcreteGinzaExperience =
      '本文に「銀座で見る/歩く/訪れる/体験する具体対象」が見当たらない（応募・告知のみの可能性）'
  }

  // --- ゲート4（本判定 / 項目4）: GINZA WHISKERS 独自の編集視点 ---
  const enLen = editorsNote.length
  const enSim = editorsNote
    ? Number(computeCharBigramJaccardSimilarity(editorsNote, contentWhyNow).toFixed(3))
    : 0
  const enShort = enLen < config.edNoteMinChars
  const enRestate = enSim >= config.restateSim
  const enNoRationale = !EDNOTE_RATIONALE_RE.test(editorsNote)
  if (enShort || enRestate || enNoRationale) {
    warnings.push('weakEditorialViewpoint')
    details.weakEditorialViewpoint =
      `editorsNote 文字数=${enLen}(min ${config.edNoteMinChars}) 類似度=${enSim}(max ${config.restateSim}) 選定理由の語=${!enNoRationale}`
  }

  // --- ゲート2（後段 / 項目5）: whyNow の日付根拠 ---
  const whyNowHasDateFact = cand.sourceProvenanceFacts.some(
    (f) => f.factType === 'date' && f.verificationStatus === 'confirmed',
  )
  if (!whyNow.trim() || (!whyNowHasDateFact && !WHYNOW_DATE_RE.test(whyNow))) {
    warnings.push('whyNowNotDateBacked')
    details.whyNowNotDateBacked = 'whyNow が空、または日付/会期に接地していない'
  }

  // --- 項目6: 裏付けのない歴史・一般論 ---
  const backing = [
    ...cand.sourceProvenanceFacts.map((f) => f.fact),
    dc.excerpt ?? '',
    dc.title ?? '',
  ]
  const history = checkUnsourcedHistory([content, editorsNote], backing)
  if (history.hits.length > 0) {
    warnings.push('unsourcedHistory')
    details.unsourcedHistory =
      '裏付けなし: ' + history.hits.slice(0, 3).map((h) => h.phrase).join(' / ')
  }

  // --- 項目6: Fact と EDITOR'S NOTE の混同 ---
  const sep = checkFactNoteSeparation(editorsNote, contentWhyNow, config.restateSim)
  if (sep.factLeak) {
    warnings.push('factLeakInEditorsNote')
    details.factLeakInEditorsNote = 'editorsNote に事実情報: ' + sep.leakedSamples.join(' / ')
  }
  if (sep.restatesContent && !warnings.includes('weakEditorialViewpoint')) {
    warnings.push('editorsNoteRestatesContent')
    details.editorsNoteRestatesContent = `editorsNote と content+whyNow の類似度 ${sep.similarity} ≥ ${config.restateSim}`
  }

  return { warnings, details }
}
