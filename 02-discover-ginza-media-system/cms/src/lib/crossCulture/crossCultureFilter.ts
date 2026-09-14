// GINZA WHISKERS / Project 02 — CROSS CULTURE FILTER 本体（2026-09-04）
//
// 記事候補 1 件について、5市場（UAE / Singapore / France / United States / Italy）
// それぞれとの相性を **決定的に** スコアリングする純粋関数。
//
//   ・AI 呼び出しなし・ネットワークなし・DB 非依存・追加課金なし
//   ・入力は既存の取得済みフィールドのみ（title / excerpt / venue / contentType /
//     uxType / factKind / templateType / primaryCategory / extraText）
//   ・処理は文字列の部分一致カウントのみ（1 件あたり 1ms 未満）
//   ・例外は内部で握りつぶし、mode='normal_only' の安全な結果を返す
//     （呼び出し元の既存フローを止めない）
//
// 判定ルール（ユーザー確定・2026-09-04）:
//   score >= 70            → 派生記事候補（derivative）
//   score 50-69           → 編集候補として保持（editorial）
//   score <= 49           → 原則、派生しない（excluded）
//   5市場すべてが 50 未満  → mode='normal_only'（通常記事のみ）
//   有料候補（paid）       → 単なるイベント紹介ではなく「文化差の解説 / 具体的な
//                            歩き方 / 比較 / 現地検証」のいずれかが成立する場合のみ

import {
  activeMarkets,
  loadCrossCultureThresholds,
  CROSS_CULTURE_VERSION,
  type AxisDef,
  type CrossCultureThresholds,
  type MarketDef,
} from './marketAxes'
import { sourceAxisBonuses } from './sourceAffinity'

export interface CrossCultureInput {
  discoveredContentId?: number | string | null
  title?: string | null
  excerpt?: string | null
  venue?: string | null
  contentType?: string | null
  uxType?: string | null
  factKind?: string | null
  templateType?: string | null
  primaryCategory?: string | null
  /** 監査カード等から渡せる追加本文（任意） */
  extraText?: string | null
  /**
   * SOURCE LEDGER の情報源名（seedData.ts の name）。UAE / France 等の判定に使う
   * 二次シグナル。**本文語彙のヒットがある軸にしか効かない**（sourceAffinity.ts）。
   */
  sourceName?: string | null
  /** 情報源 URL（host 照合フォールバック用） */
  sourceUrl?: string | null
}

export type ArticlePotential = 'none' | 'free' | 'paid'
export type MatchConfidence = 'high' | 'medium' | 'low'

export interface MarketScore {
  market: string
  score: number
  matchedAxes: string[]
  reason: string
  confidence: MatchConfidence
  articlePotential: ArticlePotential
  suggestedAngle: string
  /** 有料候補の成立根拠（決定的判定）。paid 以外では空 */
  paidBasis: string[]
  /** 情報源 affinity が加点した軸（監査用）。無ければ空 */
  sourceBoostedAxes?: string[]
}

export interface CrossCultureFilterResult {
  version: string
  evaluatedAt: string
  /** true の場合、FILTER が例外で中断し通常処理へフォールバックした */
  skipped: boolean
  skipReason?: string
  mode: 'normal_only' | 'has_derivative'
  /** 有効市場すべて（score 降順）。しきい値未満も score を残す */
  markets: MarketScore[]
  /** score >= minDerivative の市場名 */
  derivativeMarkets: string[]
  /** minEditorial <= score < minDerivative の市場名 */
  editorialMarkets: string[]
  /** score < minEditorial または無効化された市場名 */
  excludedMarkets: string[]
  topMarket: string | null
  notes: string[]
}

// ---------------------------------------------------------------------------
// contentType / uxType / factKind / templateType → 語彙ヒントへの決定的マッピング
// （既存の分類結果を「文章に書かれていた語」と同じ土俵に載せる）
// ---------------------------------------------------------------------------
const SEMANTIC_HINTS: Record<string, string[]> = {
  // contentType
  exhibition: ['展覧会', 'アート', '文化'],
  event: ['体験', 'イベント'],
  culture: ['文化', '歴史'],
  news: [],
  other: [],
  // uxType（DiscoveredContent.ux_type）
  participate_workshop: ['ワークショップ', '体験', '実演', '参加'],
  hands_on: ['体験', '手を動か', '参加'],
  watch_performance: ['ライブ', 'パフォーマンス', '体験'],
  taste_dine: ['テイスティング', 'アフタヌーンティー', '体験'],
  browse_shop: [],
  view_exhibit: ['展覧会', 'アート', '文化', '没入'],
  // templateType
  sale: [],
  recurring_event: ['体験'],
  application: ['体験', '参加'],
  workshop: ['ワークショップ', '体験', '実演', '参加'],
}

function hintsFor(...keys: (string | null | undefined)[]): string[] {
  const out: string[] = []
  for (const k of keys) {
    if (!k) continue
    const h = SEMANTIC_HINTS[k.toLowerCase()]
    if (h) out.push(...h)
  }
  return out
}

// ---------------------------------------------------------------------------
// スコアリング
// ---------------------------------------------------------------------------
/** 1 軸のヒット数 → 得点（決定的） */
function axisPoints(hits: number, boostHits: number, weight: number): number {
  let base = 0
  if (hits >= 3) base = 42
  else if (hits === 2) base = 36
  else if (hits === 1) base = 26
  const boost = Math.min(20, boostHits * 10)
  return (base + boost) * (weight ?? 1)
}

function countHits(haystack: string, terms: string[]): { hits: number; matched: string[] } {
  const matched: string[] = []
  for (const t of terms) {
    const needle = t.toLowerCase()
    if (needle && haystack.includes(needle)) matched.push(t)
  }
  return { hits: matched.length, matched }
}

interface AxisEval {
  axis: AxisDef
  points: number
  hits: number
  matchedTerms: string[]
}

function evalAxis(haystack: string, axis: AxisDef): AxisEval {
  const inc = countHits(haystack, axis.include)
  const bst = axis.boost ? countHits(haystack, axis.boost) : { hits: 0, matched: [] as string[] }
  return {
    axis,
    hits: inc.hits,
    matchedTerms: [...new Set([...inc.matched, ...bst.matched])],
    points: axisPoints(inc.hits, bst.hits, axis.weight ?? 1),
  }
}

const DEEP_AXES = new Set([
  'Heritage',
  'Culture',
  'Craft',
  'Material',
  'Story',
  'Specialist Culture',
  'Cultural Exchange',
])

/** 有料候補の成立判定（決定的プロキシ）。最終判断はマロン（Human-in-the-loop）。 */
function evaluatePaid(
  input: CrossCultureInput,
  market: MarketDef,
  matchedAxes: string[],
  score: number,
  minDerivative: number,
): { potential: ArticlePotential; basis: string[] } {
  if (score < minDerivative) return { potential: score >= 1 ? 'free' : 'none', basis: [] }

  const basis: string[] = []
  const deep = matchedAxes.filter((a) => DEEP_AXES.has(a))
  const ct = (input.contentType ?? '').toLowerCase()
  const substantive =
    input.factKind === 'event' ||
    ['event', 'exhibition', 'culture', 'article'].includes(ct)

  // 「文化差の解説」: 文化交流 / Heritage / Culture 軸が立つ → 差分を語れる
  if (deep.some((a) => ['Cultural Exchange', 'Heritage', 'Culture'].includes(a)))
    basis.push('文化差の解説（Heritage / Culture / Cultural Exchange 軸が成立）')
  // 「比較」: 手仕事・素材・専門文化 → 産地 / 技法 / 選び方の比較が書ける
  if (deep.some((a) => ['Craft', 'Material', 'Specialist Culture'].includes(a)))
    basis.push('比較（Craft / Material / Specialist Culture 軸 — 産地・技法・選び方）')
  // 「具体的な歩き方」: 体験 / 参加 / 予約性のある催事
  if (matchedAxes.some((a) => ['Experience', 'Participation', 'Immersion', 'Space'].includes(a)) && substantive)
    basis.push('具体的な歩き方（体験・参加・所要時間を設計できる催事）')
  // 「現地検証」: event かつ会場が銀座で確定 → 実地で確かめられる
  if (input.factKind === 'event' && (input.venue ?? '').includes('銀座'))
    basis.push('現地検証（銀座の会場で実地確認できる）')

  // 単なる商品ニュース（news・factKind != event）で軸が 1 本だけ → 有料にしない
  if (!substantive && matchedAxes.length < 2) return { potential: 'free', basis: [] }
  if (basis.length === 0) return { potential: 'free', basis: [] }
  return { potential: 'paid', basis }
}

function confidenceOf(matchedAxesCount: number, score: number): MatchConfidence {
  if (matchedAxesCount >= 2 && score >= 70) return 'high'
  if (matchedAxesCount >= 1 && score >= 50) return 'medium'
  return 'low'
}

function buildHaystack(input: CrossCultureInput): string {
  // excerpt は **意図的に除外**する。DiscoveredContent.excerpt はサイトナビ
  // （「ニュース／お知らせ／文化／歴史…」等）を大量に含み、誤ヒットの温床になる
  // ——既存の provisionalCategory.ts / ginzaRelevance.ts と同じ判断。
  // extraText（監査カード等から渡す本文）は編集済みテキストなので使う。
  const parts = [
    input.title ?? '',
    input.venue ?? '',
    input.primaryCategory ?? '',
    input.extraText ?? '',
    ...hintsFor(input.contentType, input.uxType, input.templateType),
  ]
  return parts.join(' │ ').toLowerCase()
}

/**
 * CROSS CULTURE FILTER。例外時は skipped=true / mode='normal_only' を返す。
 */
export function runCrossCultureFilter(
  input: CrossCultureInput,
  opts: { now?: Date; thresholds?: CrossCultureThresholds } = {},
): CrossCultureFilterResult {
  const now = opts.now ?? new Date()
  const evaluatedAt = now.toISOString()
  const base: CrossCultureFilterResult = {
    version: CROSS_CULTURE_VERSION,
    evaluatedAt,
    skipped: false,
    mode: 'normal_only',
    markets: [],
    derivativeMarkets: [],
    editorialMarkets: [],
    excludedMarkets: [],
    topMarket: null,
    notes: [],
  }

  try {
    const thresholds = opts.thresholds ?? loadCrossCultureThresholds()
    if (!thresholds.enabled) {
      return { ...base, skipped: true, skipReason: 'CROSS_CULTURE_ENABLED=0（FILTER 停止・通常処理継続）' }
    }

    const markets = activeMarkets(thresholds)
    const haystack = buildHaystack(input)
    const allMarketNames = markets.map((m) => m.market)
    const disabledNames = thresholds.disabledMarkets

    // 情報源 affinity（UAE / France 補強）。**ヒット済みの軸にしか効かせない**。
    const SOURCE_AXIS_BONUS = 12
    const SOURCE_MARKET_CAP = 24
    const { entry: affinityEntry, perMarketAxis } = sourceAxisBonuses(input.sourceName, input.sourceUrl)

    const scored: MarketScore[] = markets.map((m) => {
      const axisEvals = m.axes.map((a) => evalAxis(haystack, a))
      let raw = axisEvals.reduce((s, e) => s + e.points, 0)

      // 相性が悪い語（negative）による減点
      const neg = m.negative ? countHits(haystack, m.negative) : { hits: 0, matched: [] as string[] }
      raw -= neg.hits * 18

      // 情報源 affinity 加点：本文語彙で hits>0 の軸だけに小さく上乗せ（ゼロから作らない）
      const affAxes = perMarketAxis.get(m.market)
      const sourceBoostedAxes: string[] = []
      if (affAxes) {
        let bonus = 0
        for (const e of axisEvals) {
          if (e.hits > 0 && affAxes.has(e.axis.key)) {
            bonus += SOURCE_AXIS_BONUS
            sourceBoostedAxes.push(e.axis.key)
          }
        }
        raw += Math.min(SOURCE_MARKET_CAP, bonus)
      }

      const score = Math.max(0, Math.min(100, Math.round(raw)))
      const matchedAxisEvals = axisEvals.filter((e) => e.hits > 0)
      const matchedAxes = matchedAxisEvals.map((e) => e.axis.key)
      const confidence = confidenceOf(matchedAxes.length, score)
      const paid = evaluatePaid(input, m, matchedAxes, score, thresholds.minDerivative)

      const bucket =
        score >= thresholds.minDerivative
          ? '派生記事候補'
          : score >= thresholds.minEditorial
            ? '編集候補として保持'
            : '原則、派生しない'

      const termHint = matchedAxisEvals
        .map((e) => `${e.axis.key}:${e.matchedTerms.slice(0, 4).join('・') || '—'}`)
        .join(' / ')
      const negHint = neg.hits > 0 ? ` ／ 減点語: ${neg.matched.join('・')}` : ''
      const srcHint =
        sourceBoostedAxes.length > 0 && affinityEntry
          ? ` ／ 情報源 affinity（${affinityEntry.name}）で ${[...new Set(sourceBoostedAxes)].join('・')} を補強`
          : ''
      const reason =
        matchedAxes.length > 0
          ? `${m.compass} と相性（仮説軸による推定）。反応した軸＝${termHint}${negHint}${srcHint} → score ${score}（${bucket}）`
          : `${m.compass} に反応する語が見つからない（仮説軸による推定）。score ${score}（${bucket}）`

      const suggestedAngle =
        score >= thresholds.minEditorial
          ? pickAngle(m, matchedAxes)
          : ''

      return {
        market: m.market,
        score,
        matchedAxes,
        reason,
        confidence,
        articlePotential: paid.potential,
        suggestedAngle,
        paidBasis: paid.basis,
        sourceBoostedAxes: [...new Set(sourceBoostedAxes)],
      }
    })

    scored.sort((a, b) => b.score - a.score || a.market.localeCompare(b.market))

    const derivativeMarkets = scored.filter((s) => s.score >= thresholds.minDerivative).map((s) => s.market)
    const editorialMarkets = scored
      .filter((s) => s.score >= thresholds.minEditorial && s.score < thresholds.minDerivative)
      .map((s) => s.market)
    const excludedMarkets = [
      ...scored.filter((s) => s.score < thresholds.minEditorial).map((s) => s.market),
      ...disabledNames,
    ]

    const notes: string[] = []
    if (derivativeMarkets.length === 0)
      notes.push('派生記事候補となる市場なし（5市場すべて score < 70）。通常記事として扱う。')
    if (allMarketNames.length < 5)
      notes.push(`有効市場は ${allMarketNames.length}/5（env で ${disabledNames.join(',') || 'なし'} を除外）。`)
    notes.push('スコアは仮説軸による推定であり、確認済み事実ではない。派生・有料の最終判断はマロン。')

    return {
      ...base,
      mode: derivativeMarkets.length > 0 ? 'has_derivative' : 'normal_only',
      markets: scored,
      derivativeMarkets,
      editorialMarkets,
      excludedMarkets,
      topMarket: scored.length && scored[0].score >= thresholds.minEditorial ? scored[0].market : null,
      notes,
    }
  } catch (e) {
    // FILTER の失敗は Project 02 本体を止めない。通常処理へフォールバック。
    return {
      ...base,
      skipped: true,
      skipReason: `CROSS CULTURE FILTER 内部エラー: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

function pickAngle(market: MarketDef, matchedAxes: string[]): string {
  const axisLabel = matchedAxes.length ? matchedAxes.join(' / ') : market.compass
  // matchedAxes の数で角度を選ぶ（決定的）
  const idx = Math.min(market.paidAngles.length - 1, Math.max(0, matchedAxes.length - 1))
  return `${market.market}〔${axisLabel}〕: ${market.paidAngles[idx]}`
}
