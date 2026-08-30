// Project 02-2 収益化②「興味関心 × 銀座 × GINZA WHISKERS視点」の
// 調整可能パラメータ（2026-08-28 新設、2026-08-30 Tier 1 で拡張）。
//
// 【9月Trial方針】W_PAID・C_MATCH は「初期提案値」であり実データで調整する。
// コード再デプロイなしで振れるよう、すべて環境変数で上書き可能にする
// （未設定時は確定済みの初期値を使う）。
//
// --- 2026-08-28 の既存パラメータ ---
// - INTEREST_W_PAID           : monetization 補正の強さ（既定 8）
// - INTEREST_C_MATCH          : テーマ→承認済みDiscoveredContent プレマッチの
//                               「テーマ側 bigram 被覆率」しきい値（既定 0.6）
// - INTEREST_MAX_DAILY_DRAFTS : 1日あたり生成する記事ドラフトの上限（既定 5）
// - INTEREST_MIN_PAID_SAMPLE  : paidRatio を信頼する最小 totalArticleCount。
//                               これ未満なら monetization 補正を 1.0 に落とす
//                               （初期段階でスコアが暴れないための fallback、既定 500）
// - INTEREST_MAX_MON_MULT     : monetization 乗数の上限（既定 1.6 = overlap K=3 と同値。
//                               paidRatio 異常値でも興味シグナル最強値を超えさせない）
//
// --- 2026-08-30 Tier 1（ginza_whiskers 主稿化 ＋ 4品質ゲート） ---
// - INTEREST_PRIMARY_ANGLE            : 主稿の角度（既定 'ginza_whiskers'）
// - INTEREST_INCLUDE_INTEREST_ANGLE   : interest 補助稿を既定で生成するか（既定 false。
//                                      CLI --with-interest でも有効化）
// - INTEREST_GATE_UPCOMING_DAYS       : pre-gate「今行く理由」の近日開催判定窓（既定 14）
// - INTEREST_GATE_PUBLISHED_RECENCY_DAYS : pre-gate「今行く理由」の publishedAt 近接窓（既定 21）
// - INTEREST_GATE_GINZA_MIN           : pre-gate「銀座固有性」で editorialScore.ginza を
//                                      根拠にする最小値（0〜25、既定 13）
// - INTEREST_EXPERIENCE_CONTENT_TYPES : pre-gate「体験価値」で下限 pass にする contentType
//                                      （CSV、既定 'event,exhibition,food,shopping'）
// - INTEREST_POSTGATE_RESTATE_SIM     : post-gate で editorsNote が content の言い換えと
//                                      みなす char-bigram 類似度しきい値（既定 0.5）
// - INTEREST_POSTGATE_EDNOTE_MIN_CHARS: post-gate で editorsNote が短すぎると WARNING する
//                                      最小文字数（既定 60）
// - INTEREST_WARN_OBSERVE_MODE        : true の間は post-gate 指摘を WARNING 記録のみとし
//                                      Article 生成をブロックしない（9月Trial の既定 true）

function numFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) {
    console.error(`[interestDiscovery/config] ${name}="${raw}" を数値として解釈できないため既定値 ${fallback} を使用します`)
    return fallback
  }
  return n
}

function strFromEnv(name: string, fallback: string): string {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  return raw.trim()
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const v = raw.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'off'].includes(v)) return false
  console.error(`[interestDiscovery/config] ${name}="${raw}" を真偽値として解釈できないため既定値 ${fallback} を使用します`)
  return fallback
}

function listFromEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export interface InterestMonetizationConfig {
  wPaid: number
  cMatch: number
  maxDailyDrafts: number
  minPaidSampleSize: number
  maxMonetizationMultiplier: number
  // --- Tier 1（2026-08-30） ---
  primaryAngle: string
  includeInterestAngle: boolean
  gateUpcomingDays: number
  gatePublishedRecencyDays: number
  gateGinzaMin: number
  experienceContentTypes: string[]
  postgateRestateSim: number
  postgateEdNoteMinChars: number
  warnObserveMode: boolean
  // --- Tier S1 / S2（2026-08-30、Social Copy 媒体別最適化） ---
  socialCopyNoteMaxTags: number
  socialCopyXMaxTags: number
  socialCopyInstagramMaxTags: number
  socialCopyDupSim: number
  socialCopyBoilerplatePhrases: string[]
}

export function loadInterestMonetizationConfig(): InterestMonetizationConfig {
  return {
    wPaid: numFromEnv('INTEREST_W_PAID', 8),
    cMatch: numFromEnv('INTEREST_C_MATCH', 0.6),
    maxDailyDrafts: numFromEnv('INTEREST_MAX_DAILY_DRAFTS', 5),
    minPaidSampleSize: numFromEnv('INTEREST_MIN_PAID_SAMPLE', 500),
    maxMonetizationMultiplier: numFromEnv('INTEREST_MAX_MON_MULT', 1.6),
    // --- Tier 1 ---
    primaryAngle: strFromEnv('INTEREST_PRIMARY_ANGLE', 'ginza_whiskers'),
    includeInterestAngle: boolFromEnv('INTEREST_INCLUDE_INTEREST_ANGLE', false),
    gateUpcomingDays: numFromEnv('INTEREST_GATE_UPCOMING_DAYS', 14),
    gatePublishedRecencyDays: numFromEnv('INTEREST_GATE_PUBLISHED_RECENCY_DAYS', 21),
    gateGinzaMin: numFromEnv('INTEREST_GATE_GINZA_MIN', 13),
    experienceContentTypes: listFromEnv('INTEREST_EXPERIENCE_CONTENT_TYPES', [
      'event',
      'exhibition',
      'food',
      'shopping',
    ]),
    postgateRestateSim: numFromEnv('INTEREST_POSTGATE_RESTATE_SIM', 0.5),
    postgateEdNoteMinChars: numFromEnv('INTEREST_POSTGATE_EDNOTE_MIN_CHARS', 60),
    warnObserveMode: boolFromEnv('INTEREST_WARN_OBSERVE_MODE', true),
    // --- Tier S1 / S2 ---
    socialCopyNoteMaxTags: numFromEnv('SOCIALCOPY_NOTE_MAX_TAGS', 3),
    socialCopyXMaxTags: numFromEnv('SOCIALCOPY_X_MAX_TAGS', 3),
    socialCopyInstagramMaxTags: numFromEnv('SOCIALCOPY_INSTAGRAM_MAX_TAGS', 2),
    socialCopyDupSim: numFromEnv('SOCIALCOPY_DUP_SIM', 0.65),
    socialCopyBoilerplatePhrases: listFromEnv('SOCIALCOPY_BOILERPLATE', [
      'いかがでしょうか',
      'してみてはいかが',
      'ぜひチェック',
      'ぜひ足を運',
      'ぜひご覧',
      'ぜひお立ち寄り',
      'おすすめです',
      'おすすめの一',
      '方におすすめ',
      '話題の',
      '話題沸騰',
      '必見',
      '見逃せない',
      '要チェック',
      'マストバイ',
      '大注目',
    ]),
  }
}
