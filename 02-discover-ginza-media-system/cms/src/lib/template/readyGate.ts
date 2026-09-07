// GINZA WHISKERS / Project 02（2026-09-03、共通 Article Facts / 記事種別非依存化）
//
// 【役割】記事テンプレート種別ごとの「ready 化に必要な項目」と「適用テンプレート」を
// 決定的に返す純粋関数。18カテゴリーごとに DB スキーマを分けず、共通 Article Facts の
// 基本構造の上で、templateType によって必須項目・本文構造だけを切り替える。
//
// 【重要な動作】
//   ・templateType='unknown' → **ready 化・記事生成は不可**（missing に明示）。
//     ただし draft の作成自体は可能（register 側で担保）。
//   ・専用テンプレートが無い種別（sale / generic）→ **generic テンプレート**を適用。
//   ・generic テンプレートも confirmed 事実だけを使い、Human-in-the-loop と
//     公開前検査（reviewStatus:draft 固定・人間承認ゲート）を維持する。
//   ・存在しない値を推測補完しない。確認できない項目は空欄／unconfirmed のまま。
//   ・2026-09-06、根本改善：eventDateISO が日付のみ（時刻情報なし）の場合、
//     日本時間の当日23:59:59までは「過去」にしない（isPastEventEnd参照）。

import { isPastEventEnd } from '../curation/eventEndBoundary'

export type TemplateType =
  | 'exhibition'
  | 'application'
  | 'workshop'
  | 'sale'
  | 'recurring_event'
  | 'generic'
  | 'unknown'

/** 共通 Article Facts（記事種別非依存の基本構造）。すべて任意。空は「未入力」。 */
export interface CommonArticleFacts {
  discoveredContent?: number | null
  primaryCategory?: string | null // 既存18カテゴリー（BEAUTY / ART / …）
  templateType?: TemplateType | null

  // 「◯◯ または △△」は同じ1フィールドを両義的に使う（別カラムを増やさない）
  contentTitle?: string | null // = eventName
  contentSummary?: string | null // = whatHappens
  availablePeriod?: string | null // = eventDate（会期／販売期間／募集期間）
  eventDateISO?: string | null // 機械日付（過去/未来判定）
  eventTime?: string | null
  venues?: ({ name?: string | null; place?: string | null } | null)[] | null
  priceText?: string | null // 価格の表示文字列（sale 用。paid 列とは別）
  /**
   * 販売終了日の記載状況（sale 用。2026-09-07根本改善）。
   *   'ongoing_no_end_stated' … 公式本文に「発売中/販売中」の明記があり、完売・数量限定・
   *     期間限定等の終了を示す語がないことを confirmed に確認できた（開始日が過去でも
   *     ready 化を妨げない。詳細は evaluateReadyGate 内のコメント参照）。
   *   'has_end_date' / 'unknown' / 未設定 … 従来どおり eventDateISO の過去/未来判定を適用する。
   */
  saleAvailability?: 'unknown' | 'ongoing_no_end_stated' | 'has_end_date' | string | null
  paid?: 'paid' | 'free' | 'unknown' | string | null
  applyRequired?: 'yes' | 'no' | string | null
  applyDeadline?: string | null
  resultDate?: string | null
  resultRule?: string | null
  applyRule?: string | null
  officialInfoNote?: string | null
  editionLabel?: string | null
  theme?: string | null
  areaLead?: string | null
  audienceNote?: string | null
  hashtags?: ({ tag?: string | null } | null)[] | null
  sourceProvenanceFacts?:
    | ({ fact?: string | null; verificationStatus?: string | null } | null)[]
    | null
  enrichmentStatus?: 'draft' | 'ready' | 'withdrawn' | string | null
}

export interface ReadyGateResult {
  templateType: TemplateType
  /** ready 化してよいか（＝すべての必須が非空・confirmed 出典あり・機械日付が未来） */
  eligible: boolean
  /** 不足している項目（人間が admin で埋める） */
  missing: string[]
  /** この種別で必須の項目（表示用） */
  requiredFields: string[]
  /** 実際に適用される本文テンプレート */
  appliedTemplate: AppliedTemplate
}

/**
 * 実際に適用される本文テンプレート。
 *   exhibition      … 展覧会・個展・企画展
 *   recurring_event … 回次・テーマ・抽選のある催事（銀茶会型。application/workshop もここへ寄せる）
 *   sale            … 商品販売・フェア（価格・購入条件・購入特典の構造化 8 セクション）
 *   generic         … 専用テンプレの無い種別のフォールバック（confirmed 事実のみの最小構成）
 */
export type AppliedTemplate = 'exhibition' | 'recurring_event' | 'sale' | 'generic'

function s(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
function nonEmpty(v: unknown): boolean {
  return s(v) !== ''
}
function confirmedProvenanceCount(f: CommonArticleFacts): number {
  return (Array.isArray(f.sourceProvenanceFacts) ? f.sourceProvenanceFacts : []).filter(
    (p) => s(p?.fact) !== '' && (p?.verificationStatus ?? 'confirmed') === 'confirmed',
  ).length
}
function venuesOk(f: CommonArticleFacts): boolean {
  return (Array.isArray(f.venues) ? f.venues : []).some((v) => s(v?.name) !== '' && s(v?.place) !== '')
}
function hashtagsOk(f: CommonArticleFacts): boolean {
  return (Array.isArray(f.hashtags) ? f.hashtags : []).some((h) => s(h?.tag) !== '')
}

// テンプレート種別 → 適用される本文テンプレート
export function appliedTemplateFor(t: TemplateType): AppliedTemplate {
  if (t === 'exhibition') return 'exhibition'
  if (t === 'recurring_event' || t === 'application' || t === 'workshop') return 'recurring_event'
  if (t === 'sale') return 'sale' // 商品販売は専用の 8 セクション renderer（saleTemplate.ts）
  return 'generic' // generic / unknown（unknown は eligible にならないが表示用に generic）
}

/**
 * templateType ごとの ready ゲート評価。DB / AI に触れない純粋関数。
 * facts は「人間が admin で入力した共通 Article Facts の読み取り値」。
 */
export function evaluateReadyGate(
  facts: CommonArticleFacts,
  templateTypeIn: TemplateType | string | null | undefined,
  opts: { now?: Date } = {},
): ReadyGateResult {
  const now = opts.now ?? new Date()
  const t = (
    ['exhibition', 'application', 'workshop', 'sale', 'recurring_event', 'generic', 'unknown'].includes(
      String(templateTypeIn),
    )
      ? templateTypeIn
      : 'unknown'
  ) as TemplateType
  const appliedTemplate = appliedTemplateFor(t)
  const missing: string[] = []

  // unknown は draft 作成は可・ready 化と記事生成は不可
  if (t === 'unknown') {
    return {
      templateType: 'unknown',
      eligible: false,
      missing: [
        'templateType が未確定。マロンが Primary Category と templateType（exhibition / sale / application / workshop / recurring_event / generic）を確定するまで ready 化・記事生成はできない',
      ],
      requiredFields: ['templateType（人間が確定）', 'primaryCategory（人間が確定）'],
      appliedTemplate,
    }
  }

  // --- 種別別の必須テキスト ---
  let requiredText: { key: keyof CommonArticleFacts; label: string }[]
  if (t === 'sale') {
    requiredText = [
      { key: 'contentTitle', label: 'contentTitle（商品名／シリーズ名。= eventName 欄）' },
      { key: 'contentSummary', label: 'contentSummary（商品概要。= whatHappens 欄）' },
      { key: 'availablePeriod', label: 'availablePeriod（販売期間の表示文字列。= eventDate 欄）' },
      { key: 'priceText', label: 'priceText（価格の表示文字列）' },
      { key: 'officialInfoNote', label: 'officialInfoNote（購入条件・在庫注意など公式補足）' },
    ]
  } else if (t === 'generic') {
    requiredText = [
      { key: 'contentTitle', label: 'contentTitle（見出し。= eventName 欄）' },
      { key: 'contentSummary', label: 'contentSummary（概要。= whatHappens 欄）' },
      { key: 'availablePeriod', label: 'availablePeriod（有効期間の表示文字列。= eventDate 欄）' },
      { key: 'officialInfoNote', label: 'officialInfoNote（公式補足）' },
    ]
  } else {
    // exhibition / recurring_event / application / workshop（イベント系）
    requiredText = [
      { key: 'contentTitle', label: 'eventName（イベント名。= contentTitle 欄）' },
      { key: 'contentSummary', label: 'whatHappens（何が行われるか。= contentSummary 欄）' },
      { key: 'availablePeriod', label: 'eventDate（会期。= availablePeriod 欄）' },
      { key: 'eventTime', label: 'eventTime（開催時間）' },
      { key: 'areaLead', label: 'areaLead（会場の前置き一文）' },
      { key: 'audienceNote', label: 'audienceNote（対象読者の一文）' },
      { key: 'officialInfoNote', label: 'officialInfoNote（公式情報の補足）' },
    ]
  }
  for (const r of requiredText) {
    if (!nonEmpty(facts[r.key])) missing.push(r.label)
  }

  // --- 会場（sale/generic は任意、イベント系は必須） ---
  if (t !== 'sale' && t !== 'generic' && !venuesOk(facts)) {
    missing.push('venues（name+place を1件以上。イベント系で必須）')
  }

  // --- ハッシュタグ（全種別で1件以上） ---
  if (!hashtagsOk(facts)) missing.push('hashtags（1件以上）')

  // --- confirmed 出典（全種別で1件以上。confirmed 事実だけを本文に使うため） ---
  if (confirmedProvenanceCount(facts) < 1) {
    missing.push('sourceProvenanceFacts（confirmed の出典事実を1件以上）')
  }

  // --- 有料/無料 or 価格（イベント系は paid 確定、sale は priceText で代替可） ---
  if (t !== 'sale' && t !== 'generic') {
    if (facts.paid !== 'paid' && facts.paid !== 'free') missing.push('paid（有料/無料を確定。unknown 不可）')
  }

  // --- 回次・テーマ（recurring_event のみ必須） ---
  if (t === 'recurring_event') {
    if (!nonEmpty(facts.editionLabel)) missing.push('editionLabel（回次。recurring_event で必須）')
    if (!nonEmpty(facts.theme)) missing.push('theme（テーマ。recurring_event で必須）')
  }

  // --- 申込系（application / workshop で applyRequired=yes のとき必須） ---
  if ((t === 'application' || t === 'workshop') && facts.applyRequired !== 'yes') {
    missing.push('applyRequired（application/workshop は applyRequired=yes を設定）')
  }
  if (facts.applyRequired === 'yes') {
    for (const [k, lbl] of [
      ['applyDeadline', 'applyDeadline（申込期限）'],
      ['resultDate', 'resultDate（当選発表日）'],
      ['resultRule', 'resultRule（発表方法）'],
      ['applyRule', 'applyRule（申込条件）'],
    ] as const) {
      if (!nonEmpty(facts[k])) missing.push(lbl)
    }
  }

  // --- 過去/未来ゲート（機械日付が必要。過去は eligible にしない） ---
  //   【2026-09-07根本改善】sale かつ saleAvailability==='ongoing_no_end_stated'（公式本文に
  //   「発売中/販売中」の明記があり、完売・数量限定・期間限定等の終了を示す語がないことを
  //   confirmed に確認できた場合のみ）は、この過去/未来ゲート自体を適用しない——販売開始日が
  //   過去なのは「継続して販売中」という事実の当然の帰結であり、終了日が無い以上「過去」を
  //   判定する機械日付が存在しないため。他の templateType・他の sale（saleAvailability が
  //   'has_end_date'／'unknown'／未設定）には一切影響しない（既定 'unknown' で従来どおり）。
  const salesOngoingNoEnd = t === 'sale' && facts.saleAvailability === 'ongoing_no_end_stated'
  if (!salesOngoingNoEnd) {
    const iso = s(facts.eventDateISO)
    if (!iso) {
      missing.push('eventDateISO（過去/未来を機械判定できないため必須）')
    } else if (Number.isNaN(new Date(iso).getTime())) {
      missing.push('eventDateISO（日付として解釈できない）')
    } else if (isPastEventEnd(iso, now)) {
      missing.push('eventDateISO / availablePeriod（会期・有効期間が過去）')
    }
  }

  return {
    templateType: t,
    eligible: missing.length === 0,
    missing,
    requiredFields: requiredText.map((r) => r.label),
    appliedTemplate,
  }
}
