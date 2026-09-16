// GINZA WHISKERS / Project 02（2026-09-15、マロン指示：A判定候補が少なすぎる根本原因の是正）
//
// 【根本原因（実データで確認）】
// 従来のA判定は「ArticleFacts.enrichmentStatus='ready'（必須項目すべてを人間が
// 手入力済み）」を必須条件にしていた。これは「記事生成の準備が整っているか」の
// 判定であり、「銀座で今旬の候補として提示する価値があるか」の判定ではない。
// 結果、ArticleFactsが人間によって作成されるまで**どの候補も自動ではAになれない**
// 構造になっていた（2026-09-15実データ：1,167件中A=0、非A理由の上位は
// 「ArticleFacts未作成」163件・「factKind判定不能」231件・「PRE-GATE除外」259件・
// 「銀座関連性なし」385件——いずれもArticleFacts手入力の有無や記事タイプ2分類の
// 都合であり、「銀座限定でないか」「常設店舗か」等の条件は実際には効いていなかった）。
//
// 【新しいA判定（18カテゴリー共通・目的型／発見型）】
// A：以下をすべて満たす候補。
//   1. 銀座で現在または近い将来に購入・飲食・鑑賞・利用・体験できる
//      （＝終了済みでない。C判定の安全条件は呼び出し元でそのまま維持）
//   2. 公式情報で銀座の場所と提供状況を確認できる（venue/facilityKeyのいずれか）
//   3. 季節性・新規性・期間性・話題性・発見性のいずれかがある
//   4. 既投稿・近似記事ではない（duplicate/近似重複。呼び出し元の判定をそのまま使う）
//   5. 終了済みではない（同上）
//   6. 読者に具体的な行動を提案できる（＝18カテゴリーへ分類できる）
//
// 銀座限定でない・他地域にも店舗がある・通販でも買える・銀座を訪れる唯一の目的で
// ない・常設店舗である、はいずれも除外理由にしない。ただし常設商品・常設サービスで
// 3の signal が一切無いものは B のまま（意図的な設計）。
//
// mode（目的型／発見型）はA判定の条件ではなく、A判定後の分類・表示用。
//
// 【安全条件】AIを使わない・推測しない（書かれている語のみを見る）・既存のC判定
// （終了済み・重複・銀座関連性なし・出典なし）はこのモジュールでは判定し直さず
// 呼び出し元の結果をそのまま受け取る。

import { deriveProvisionalCategory } from '../pipeline/provisionalCategory'
import { resolveFacilityKey } from '../curation/facilityKey'
import { hasNoveltySignal } from '../crawler/sweetsDiscoveryKeywords'
import type { FactKind } from './types'

// 新規性・季節性は既存のsweetsDiscoveryKeywords.ts（hasNoveltySignal）をそのまま使う。
// ここでは「話題性・発見性・目的型体験」寄りの明記語のみを補う（推測しない・明記語のみ）。
// 2026-09-15追加：「待望の◯◯登場」等、実データ（DC#246等）で頻出する新商品告知の
// 定型表現（「新」が直前に無い「登場」単体）を追加。
// 【2026-09-15修正】単独の「催し」はテストのプレースホルダー文言（「〜な催しです」等の
// 一般的な言い回し）にも一致してしまい過検出になるため除外し、より具体的な「催し物」に
// 限定した（「フェア」「物産展」等の他語で実質的な催事シグナルはカバーできている）。
const TOPIC_OR_EXPERIENCE_SIGNAL_RE =
  /話題|人気|注目|初出店|初上陸|初開催|オープン|グランドオープン|リニューアル|コラボ(?:レーション)?|個展|企画展|展覧会|展示販売|体験会|ワークショップ|トークイベント|トークショー|サイン会|公演|ライブ|催し物|フェア|物産展|登場|待望/

/** 明記された開催・販売期間があるか（推測しない。構造化日付のいずれかがあれば true） */
function hasExplicitPeriodSignal(eventStartAt: string | null, eventEndAt: string | null): boolean {
  return !!(eventStartAt || eventEndAt)
}

export interface DiscoverySignalResult {
  has: boolean
  reason: string
}

/**
 * 季節性・新規性・期間性・話題性・発見性のいずれかがあるかを判定する（明記語のみ・推測しない）。
 */
export function evaluateDiscoverySignal(
  title: string | null,
  excerpt: string | null,
  eventStartAt: string | null,
  eventEndAt: string | null,
  now: Date = new Date(),
): DiscoverySignalResult {
  const text = `${title ?? ''} ${(excerpt ?? '').slice(0, 300)}`
  if (hasNoveltySignal(text, now)) {
    return { has: true, reason: '新規性・季節性の明記語を確認（新商品／季節限定／期間限定等）' }
  }
  if (hasExplicitPeriodSignal(eventStartAt, eventEndAt)) {
    return { has: true, reason: '開催・販売期間が明記されている（期間性）' }
  }
  if (TOPIC_OR_EXPERIENCE_SIGNAL_RE.test(text)) {
    return { has: true, reason: '話題性・発見性・体験性の明記語を確認（個展／企画展／催し／コラボ等）' }
  }
  return { has: false, reason: '季節性・新規性・期間性・話題性・発見性のいずれも確認できない（常設情報のみ）' }
}

export interface TargetOrDiscoveryInput {
  title: string | null
  venue: string | null
  articleUrl: string | null
  excerpt: string | null
  sourceSiteName: string | null
  contentType: string | null
  factKind: FactKind
  eventStartAt: string | null
  eventEndAt: string | null
  /** 呼び出し元（assessCandidate）が既に判定済みの安全条件。ここでは判定し直さない */
  expired: boolean
  ginzaRelevant: boolean
  hasTraceableSource: boolean
  duplicate: boolean
  recentBrandVenueDuplicate: boolean
  /** 情報の確認日時が古い（freshnessDays 超過）。呼び出し元が判定済み（既定 undefined=false 扱い） */
  stale?: boolean
  now?: Date
}

export type EligibilityMode = 'purpose' | 'discovery'

export interface TargetOrDiscoveryResult {
  eligible: boolean
  mode: EligibilityMode | null
  category: string | null
  /** eligible時：目的型／発見型と判定した明記根拠 */
  reasons: string[]
  /** !eligible時：Aにならなかった理由（複数該当しうる） */
  blockers: string[]
}

// 目的型＝その体験・展示・催事自体が来訪理由になりうるカテゴリー。
// 発見型＝銀ブラの途中で出会う商品・サービス寄りのカテゴリー。
// あくまで表示上の分類であり、A判定の可否には影響しない。
const PURPOSE_CATEGORIES = new Set([
  'ART', 'MUSIC', 'EVENT', 'EXPERIENCE', 'WORKSHOP', 'PHOTO', 'NIGHT', 'NIGHT_VIEW', 'ARCHITECTURE',
])

export function evaluateTargetOrDiscoveryEligibility(input: TargetOrDiscoveryInput): TargetOrDiscoveryResult {
  const now = input.now ?? new Date()
  const blockers: string[] = []

  // 4. 既投稿・近似記事ではない／5. 終了済みではない：呼び出し元のC判定・近似重複判定をそのまま使う
  //    （このモジュールでは判定し直さない・安全条件を緩めない）。
  if (input.expired) blockers.push('終了済み')
  if (input.duplicate) blockers.push('既投稿と重複')
  if (input.recentBrandVenueDuplicate) blockers.push('近似重複（同一ブランド・同一会場、直近14日以内）')
  if (!input.ginzaRelevant) blockers.push('銀座関連性を確認できない')
  if (!input.hasTraceableSource) blockers.push('追跡可能な公式出典URLが無い')
  if (input.stale) blockers.push('情報の確認日時が古く再確認が必要')

  // 2. 公式情報で銀座の場所と提供状況を確認できる
  const facility = resolveFacilityKey({
    venue: input.venue,
    sourceName: input.sourceSiteName,
    sourceUrl: input.articleUrl,
    title: input.title,
  })
  const locationConfirmed = !!(input.venue && input.venue.trim()) || !!facility.key
  if (!locationConfirmed) blockers.push('公式情報で銀座の場所・提供状況を確認できない')

  // 18カテゴリーへの分類（タイトル/会場の明記語のみ。表示・mode振り分け用の付随情報であり、
  // 2026-09-15改訂でA判定のブロッカーからは外した——「未分類＝提示不可」にすると、
  // 一般的な祭事・催事等の生の情報源タイトルが分類語を偶然含まないだけでB化してしまい、
  // 過剰な足切りになるため（原因調査④で確認）。category は null のままでも A になりうる。
  const provisional = deriveProvisionalCategory({
    title: input.title,
    venue: input.venue,
    contentType: input.contentType,
  })
  const category = provisional.category

  // 3. 季節性・新規性・期間性・話題性・発見性のいずれかがある
  const discovery = evaluateDiscoverySignal(input.title, input.excerpt, input.eventStartAt, input.eventEndAt, now)
  if (!discovery.has) blockers.push(discovery.reason)

  const eligible = blockers.length === 0
  if (!eligible) {
    return { eligible: false, mode: null, category, reasons: [], blockers }
  }

  const mode: EligibilityMode =
    input.factKind === 'event' || (category != null && PURPOSE_CATEGORIES.has(category)) ? 'purpose' : 'discovery'

  return {
    eligible: true,
    mode,
    category,
    reasons: [discovery.reason],
    blockers: [],
  }
}
