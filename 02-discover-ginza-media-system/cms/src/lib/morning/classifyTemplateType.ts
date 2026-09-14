// GINZA WHISKERS / Project 02（2026-09-03、第一投稿遅延の是正）
// 記事種別ごとのテンプレート分類（決定的・AI なし）。
//
// classifyFactKind（event / product_news / unknown）の内側で、event をさらに
// テンプレート種別へ分ける。目的：通常の展覧会に公募・コンテスト用項目
// （editionLabel / theme / applicationDeadline / announcementDate /
//  applicationConditions）を要求しない。
//
//   exhibition      … 個展・展覧会・企画展・作品展（申込不要が基本）
//   application     … 公募・コンテスト・作品募集（applicationDeadline 等が必須）
//   workshop        … ワークショップ・体験会・講座・実演（参加型）
//   sale            … 商品・販売（factKind=product_news はここ）
//   recurring_event … 回次＋テーマを持つ恒例行事（銀茶会型）
//   unknown         … 判定不能（推測でどれかに寄せない）
//
// 【安全条件】単語1つで決めない／複数根拠と信頼度を記録／矛盾は unknown へ寄せる／
// HTML を解釈しない／AI を使わない／追加課金しない。

import { classifySourcePageType } from './classifySourcePageType'
import type { FactKind } from './types'

export type TemplateType =
  | 'exhibition'
  | 'application'
  | 'workshop'
  | 'sale'
  | 'recurring_event'
  | 'unknown'

export interface ClassifyTemplateTypeInput {
  factKind: FactKind
  contentType?: string | null
  uxType?: string | null
  title?: string | null
  excerpt?: string | null
  /** 任意：DiscoveredContent.articleUrl（URL 構造での決定的テンプレート種別ヒントに使う） */
  url?: string | null
  /** 任意：SOURCE LEDGER の sourceName（URL ホストの裏取り用・名称単独で分類しない） */
  sourceName?: string | null
  /** 任意：DiscoveredContent.venue */
  venue?: string | null
}

export interface TemplateTypeClassification {
  templateType: TemplateType
  confidence: 'high' | 'medium' | 'low'
  reasons: string[]
  signals: {
    exhibition: string[]
    application: string[]
    workshop: string[]
    recurringEvent: string[]
  }
}

const EXHIBITION_RE: { re: RegExp; label: string }[] = [
  { re: /個展|回顧展|遺作展/, label: '「個展・回顧展」語' },
  { re: /展覧会|企画展|特別展|巡回展/, label: '「展覧会・企画展」語' },
  { re: /作品展|絵画展|写真展|版画展|工芸展|書展|陶芸展/, label: '「◯◯展」語' },
  { re: /グループ展|二人展|コレクション展/, label: '「グループ展・二人展」語' },
  { re: /原画展|イラスト展|立体展|インスタレーション/, label: '「原画展・立体展」語' },
]
const APPLICATION_RE: { re: RegExp; label: string }[] = [
  { re: /公募(?!展の観覧)/, label: '「公募」語' },
  { re: /作品募集|募集作品|応募作品|応募受付/, label: '「作品募集・応募受付」語' },
  { re: /コンクール|コンテスト|アワード|グランプリ/, label: '「コンクール・コンテスト」語' },
  { re: /応募要項|応募規定|募集要項|エントリー(?:受付|期間|方法)/, label: '「応募要項・エントリー」語' },
  { re: /審査(?:員|結果|発表)|入選|受賞者/, label: '「審査・入選」語' },
]
const WORKSHOP_RE: { re: RegExp; label: string }[] = [
  { re: /ワークショップ|体験会|体験教室|実演会|実演販売/, label: '「ワークショップ・体験会」語' },
  { re: /講座|レクチャー|セミナー|トークショー|トークイベント/, label: '「講座・セミナー・トーク」語' },
  { re: /参加者(?:募集|は)|定員\s*\d+\s*名|要予約|事前予約/, label: '「参加者募集・定員・要予約」語' },
  { re: /づくり体験|手づくり|ハンズオン|制作体験/, label: '「◯◯づくり体験」語' },
]
const RECURRING_RE: { re: RegExp; label: string }[] = [
  { re: /第\s*[0-9０-９一二三四五六七八九十百]+\s*回/, label: '「第◯回」（回次）' },
  { re: /恒例(?:の|行事|イベント)|毎年(?:恒例|開催)|例年/, label: '「恒例・毎年」語' },
  { re: /今年のテーマ|本年のテーマ|本年度のテーマ/, label: '「今年のテーマ」語' },
]

const CT_EXHIBITION = new Set(['exhibition'])
const CT_WORKSHOP = new Set(['workshop', 'seminar'])
const UX_EXHIBITION = new Set(['see_exhibition', 'exhibition_viewing'])
const UX_WORKSHOP = new Set(['participate_workshop', 'join_seminar', 'attend_workshop'])

function joinText(...vals: (string | null | undefined)[]): string {
  return vals.map((v) => (typeof v === 'string' ? v : '')).join(' \n ')
}

export function classifyTemplateType(
  input: ClassifyTemplateTypeInput,
): TemplateTypeClassification {
  // product_news は sale で確定（別スキーマ）
  if (input.factKind === 'product_news') {
    return {
      templateType: 'sale',
      confidence: 'high',
      reasons: ['factKind=product_news（商品・販売ニュース）'],
      signals: { exhibition: [], application: [], workshop: [], recurringEvent: [] },
    }
  }
  if (input.factKind === 'unknown') {
    return {
      templateType: 'unknown',
      confidence: 'low',
      reasons: ['factKind=unknown（イベントか商品かの判定がついていない）'],
      signals: { exhibition: [], application: [], workshop: [], recurringEvent: [] },
    }
  }

  const text = joinText(input.title, input.excerpt)
  const ct = (input.contentType ?? '').toLowerCase().trim()
  const ux = (input.uxType ?? '').toLowerCase().trim()

  const ex: string[] = []
  const ap: string[] = []
  const wk: string[] = []
  const rc: string[] = []

  if (CT_EXHIBITION.has(ct)) ex.push(`contentType=${ct}`)
  if (UX_EXHIBITION.has(ux)) ex.push(`uxType=${ux}`)
  if (CT_WORKSHOP.has(ct)) wk.push(`contentType=${ct}`)
  if (UX_WORKSHOP.has(ux)) wk.push(`uxType=${ux}`)

  for (const m of EXHIBITION_RE) if (m.re.test(text)) ex.push(`本文に${m.label}`)
  for (const m of APPLICATION_RE) if (m.re.test(text)) ap.push(`本文に${m.label}`)
  for (const m of WORKSHOP_RE) if (m.re.test(text)) wk.push(`本文に${m.label}`)
  for (const m of RECURRING_RE) if (m.re.test(text)) rc.push(`本文に${m.label}`)

  // URL 構造 ＋ タイトル・本文の明記から決定的に導けるテンプレート種別ヒント。
  let spHint: TemplateType | null = null
  let spHigh = false
  if (input.url || input.venue) {
    const sp = classifySourcePageType({
      sourceName: input.sourceName ?? null,
      url: input.url ?? null,
      venue: input.venue ?? null,
      title: input.title ?? null,
      excerpt: input.excerpt ?? null,
      contentType: input.contentType ?? null,
      uxType: input.uxType ?? null,
    })
    const label = sp.evidence.find((e) => /タイトル|本文/.test(e)) ?? sp.evidence[0] ?? 'URL 構造'
    if (sp.templateTypeHint === 'exhibition') { ex.push(`URL/タイトルが展覧会形式（${label}）`); spHint = 'exhibition' }
    else if (sp.templateTypeHint === 'workshop') { wk.push(`URL/タイトルが参加型形式（${label}）`); spHint = 'workshop' }
    else if (sp.templateTypeHint === 'recurring_event') { rc.push(`URL/タイトルが恒例行事形式（${label}）`); spHint = 'recurring_event' }
    // URL が個別イベント詳細 ＋ タイトル/本文の明記が corroborate（決定的シグナル 2 つ）。
    // サイトのナビゲーション由来のノイズ（uxType など）より優先する。
    spHigh = sp.confidence === 'high' && spHint != null
  }

  if (spHigh && spHint) {
    return {
      templateType: spHint,
      confidence: 'high',
      reasons: [
        `URL 構造で個別イベント詳細と確定し、タイトル/本文の明記が ${spHint} を裏づけ（決定的シグナル 2 つ）`,
        `内訳: exhibition=${ex.length} / application=${ap.length} / workshop=${wk.length} / recurring_event=${rc.length}`,
      ],
      signals: { exhibition: ex, application: ap, workshop: wk, recurringEvent: rc },
    }
  }

  const signals = { exhibition: ex, application: ap, workshop: wk, recurringEvent: rc }
  const scores: [TemplateType, number][] = [
    ['application', ap.length],
    ['workshop', wk.length],
    ['exhibition', ex.length],
    ['recurring_event', rc.length],
  ]
  // application / workshop は「展覧会でもある」ことが多い（例：作品展＋WS）。
  // 公募・参加要件がある方を優先する（そのテンプレの必須項目を落とさないため）。
  scores.sort((a, b) => b[1] - a[1])
  const [topType, topScore] = scores[0]
  const [, secondScore] = scores[1]

  if (topScore === 0) {
    return {
      templateType: 'unknown',
      confidence: 'low',
      reasons: ['exhibition / application / workshop / recurring_event のいずれも本文シグナルなし'],
      signals,
    }
  }
  // 単語1つだけでは決めない：スコア1かつ他が0のときは low
  const confidence: TemplateTypeClassification['confidence'] =
    topScore >= 2 && topScore > secondScore
      ? 'high'
      : topScore >= 2 || (topScore === 1 && secondScore === 0 && (ex.length > 0 || ap.length > 0))
        ? 'medium'
        : 'low'

  const reasons = [
    `${topType} シグナル ${topScore} 件が最多`,
    `内訳: exhibition=${ex.length} / application=${ap.length} / workshop=${wk.length} / recurring_event=${rc.length}`,
  ]
  if (topType === 'exhibition' && (ap.length > 0 || wk.length > 0)) {
    reasons.push(
      `注意: application(${ap.length}) / workshop(${wk.length}) のシグナルもある。` +
        `公募・参加要件があるなら ArticleFacts で applyRequired=yes を設定すること（未設定だと公募情報が抜ける）`,
    )
  }

  // 1対1 の同点で unknown になる場合、決定的なタイトル明記ヒント（spHint）が
  // 同点候補のいずれかなら、そのヒントでタイブレーク（ナビ由来の弱い1票より優先）。
  if (topScore === 1 && secondScore === 1 && spHint) {
    const tiedTypes = scores.filter(([, n]) => n === 1).map(([tt]) => tt)
    if (tiedTypes.includes(spHint)) {
      return {
        templateType: spHint,
        confidence: 'medium',
        reasons: [
          `同点（${tiedTypes.join(' / ')}）をタイトルの明記ヒントで ${spHint} に確定`,
          `内訳: exhibition=${ex.length} / application=${ap.length} / workshop=${wk.length} / recurring_event=${rc.length}`,
        ],
        signals,
      }
    }
  }

  return { templateType: topScore === 1 && secondScore === 1 ? 'unknown' : topType, confidence, reasons, signals }
}
