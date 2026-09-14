// GINZA WHISKERS / Project 02 — CROSS CULTURE 派生記事プランの決定的ビルダー（2026-09-04）
//
// CROSS CULTURE FILTER の結果（market score / matchedAxes / suggestedAngle /
// articlePotential）を、**記事生成へ安全に渡せる形**へ変換する純粋関数。
//
// 【マロン確定ルール（2026-09-04）】
//   ・score >= 70 の市場だけを「派生記事生成候補」にする
//   ・50-69 は「編集候補として保持」するが自動派生させない
//   ・49 以下は本文生成に使わない
//   ・複数市場が 70 以上でも、無理に5カ国記事にしない（既定 maxMarkets=1）
//   ・最も記事価値の高い市場・角度を優先（score→confidence→paid→深い軸数）
//   ・通常記事本文を CROSS CULTURE 視点で上書きしない → 別候補（別記事）として生成
//   ・suggestedAngle を「断定禁止・仮説明示・事実と仮説の分離」を含む注入テキストに包む
//   ・FILTER 失敗（skipped）時は mode='none'（＝派生しない・通常生成を継続）
//
// この関数は AI を呼ばない・I/O をしない・例外時は mode='none' を返す。

import type { CrossCultureFilterResult, MarketScore } from './crossCultureFilter'
import { MARKET_AXES } from './marketAxes'

export interface DerivativeConfirmedFact {
  fact: string
  factType?: string | null
  sourceUrl?: string | null
  verifiedAt?: string | null
}

export interface BuildDerivativePlanInput {
  discoveredContentId: number | string
  title: string
  ccResult: CrossCultureFilterResult | null | undefined
  /** editorialProvenance / ArticleFacts 由来の confirmed fact（本文で事実として書ける） */
  confirmedFacts?: DerivativeConfirmedFact[]
  /** 既定は FILTER のしきい値。呼び出し側が上書き可 */
  minDerivative?: number
  minEditorial?: number
  /** 複数市場 >=70 でも取るのはこの数まで（既定 1） */
  maxMarkets?: number
  /** 特定市場に限定（--market=France）。指定時はその市場が >=70 のときのみ採用 */
  onlyMarket?: string
}

export interface DerivativeMarketPlan {
  market: string
  score: number
  matchedAxes: string[]
  confidence: MarketScore['confidence']
  suggestedAngle: string
  articlePotential: 'paid' | 'free'
  /** paid のときは成立根拠、free のときは「なぜ無料か」 */
  potentialReason: string
  paidBasis: string[]
  /** 生成プロンプトへ渡す注入テキスト（断定禁止・仮説明示・別記事・事実/仮説の分離を含む） */
  promptInjection: string
  /** テスト・監査カード用に構造化したガードレール */
  guardrails: string[]
  /** 本文で「事実」として書ける確認済み情報（無ければ空＝断定させない） */
  confirmedForBody: string[]
  /** 本文で「文化的仮説（断定しない）」として扱う内容 */
  culturalHypotheses: string[]
}

export interface DerivativePlan {
  discoveredContentId: number | string
  /** derivative: 生成候補あり ／ none: 生成しない（通常記事のみ） */
  mode: 'derivative' | 'none'
  /** FILTER が skipped だった等で FILTER を使わずに終えた場合 true */
  filterUnavailable: boolean
  reason: string
  /** 実際に派生記事生成の候補にする市場（length <= maxMarkets） */
  selectedMarkets: DerivativeMarketPlan[]
  /** 50-69：保持するが自動派生しない */
  editorialOnlyMarkets: { market: string; score: number; suggestedAngle: string }[]
  /** 49 以下 or 無効化：本文生成に使わない */
  excludedMarkets: { market: string; score: number }[]
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

function marketCompass(market: string): string {
  return MARKET_AXES.find((m) => m.market === market)?.compass ?? market
}

/** 記事価値の高い順（決定的）：score → confidence → paid → 深い軸数 → 市場名 */
function rankMarkets(a: DerivativeMarketPlan, b: DerivativeMarketPlan): number {
  if (b.score !== a.score) return b.score - a.score
  const conf = { high: 2, medium: 1, low: 0 } as const
  if (conf[b.confidence] !== conf[a.confidence]) return conf[b.confidence] - conf[a.confidence]
  const paidRank = (p: DerivativeMarketPlan) => (p.articlePotential === 'paid' ? 1 : 0)
  if (paidRank(b) !== paidRank(a)) return paidRank(b) - paidRank(a)
  const deep = (p: DerivativeMarketPlan) => p.matchedAxes.filter((x) => DEEP_AXES.has(x)).length
  if (deep(b) !== deep(a)) return deep(b) - deep(a)
  return a.market.localeCompare(b.market)
}

function buildPromptInjection(
  market: string,
  ms: MarketScore,
  confirmedForBody: string[],
  culturalHypotheses: string[],
): string {
  const lines: string[] = []
  lines.push(`【CROSS CULTURE 派生記事の指示（${market} 視点）】`)
  lines.push(
    'この記事は通常記事とは別の「CROSS CULTURE 派生記事」です。通常記事の本文を書き換えず、' +
      `${market} 視点に絞った独立記事として構成すること。`,
  )
  lines.push(`編集角度（そのまま使わず、記事の芯として展開する）: ${ms.suggestedAngle || marketCompass(market)}`)
  lines.push(`対象読者の視点: ${market}（${marketCompass(market)}）／扱う軸: ${ms.matchedAxes.join('・') || '—'}`)
  lines.push(
    '【事実】として断定してよいのは、次の確認済み情報だけ:' +
      (confirmedForBody.length
        ? '\n  - ' + confirmedForBody.join('\n  - ')
        : '\n  （確認済み事実が未取得。日時・会場・料金などを事実として断定せず、' +
          '「公式情報でご確認ください」と促す表現に留めること）'),
  )
  lines.push(
    '【文化的仮説（断定禁止）】次は GINZA WHISKERS 編集部の見立て（仮説）であり、事実ではない:' +
      '\n  - ' +
      culturalHypotheses.join('\n  - '),
  )
  lines.push(
    '仮説を書くときは「〜と考えられる」「〜という視点で見ることもできる」等の推定表現を使い、' +
      `「${market} の人はこう感じる」と一般化・断定しないこと。`,
  )
  lines.push('複数国の視点を1記事に詰め込まないこと。この記事は上記1市場の視点に限定する。')
  lines.push(
    ms.articlePotential === 'paid'
      ? `想定: 有料候補（成立根拠: ${ms.paidBasis.join(' ／ ')}）。ただし有料化の最終判断はマロン。`
      : '想定: 無料記事（単なるイベント紹介の域を出ないため）。',
  )
  return lines.join('\n')
}

/** 純粋・決定的。例外時は mode='none'（通常生成を止めない）。 */
export function buildCrossCultureDerivativePlan(input: BuildDerivativePlanInput): DerivativePlan {
  const base: DerivativePlan = {
    discoveredContentId: input.discoveredContentId,
    mode: 'none',
    filterUnavailable: false,
    reason: '',
    selectedMarkets: [],
    editorialOnlyMarkets: [],
    excludedMarkets: [],
  }

  try {
    const cc = input.ccResult
    if (!cc || cc.skipped) {
      return {
        ...base,
        filterUnavailable: true,
        reason: cc?.skipReason
          ? `CROSS CULTURE FILTER が利用不可（${cc.skipReason}）→ 通常記事のみ`
          : 'CROSS CULTURE FILTER の結果が無い → 通常記事のみ',
      }
    }

    const minDerivative = input.minDerivative ?? 70
    const minEditorial = input.minEditorial ?? 50
    const maxMarkets = Math.max(1, input.maxMarkets ?? 1)
    const confirmedForBody = (input.confirmedFacts ?? [])
      .map((f) => (f.fact ?? '').trim())
      .filter(Boolean)
      .slice(0, 12)

    const eligible = cc.markets
      .filter((m) => m.score >= minDerivative)
      .filter((m) => !input.onlyMarket || m.market.toLowerCase() === input.onlyMarket.toLowerCase())
      .map((m): DerivativeMarketPlan => {
        const culturalHypotheses = [
          `${m.market}（${marketCompass(m.market)}）の視点との親和性（score ${m.score}／confidence ${m.confidence}）`,
          `扱う軸「${m.matchedAxes.join('・') || '—'}」に基づく文化的な読み替え`,
          ...(m.sourceBoostedAxes && m.sourceBoostedAxes.length
            ? [`情報源の性格（${m.sourceBoostedAxes.join('・')}）による補強も仮説の一部`]
            : []),
        ]
        const guardrails = [
          '通常記事の本文を上書きしない（別記事として生成）',
          '複数国の視点を1記事に混ぜない（この記事は1市場のみ）',
          '文化的仮説は断定しない（「〜と考えられる」等の推定表現）',
          `「${m.market} の人はこう感じる」と一般化・断定しない`,
          '確認済み事実（confirmedForBody）以外を事実として書かない',
          'FILTER 由来のスコアや軸を、確認済み事実と混同して本文に書かない',
        ]
        const potentialReason =
          m.articlePotential === 'paid'
            ? `文化差の解説 / 比較 / 具体的な歩き方 / 現地検証 のいずれか成立: ${m.paidBasis.join(' ／ ')}`
            : '単なるイベント紹介の域を出ないため無料記事のまま（有料成立条件を満たさない）'
        return {
          market: m.market,
          score: m.score,
          matchedAxes: m.matchedAxes,
          confidence: m.confidence,
          suggestedAngle: m.suggestedAngle,
          articlePotential: m.articlePotential === 'paid' ? 'paid' : 'free',
          potentialReason,
          paidBasis: m.paidBasis,
          promptInjection: buildPromptInjection(m.market, m, confirmedForBody, culturalHypotheses),
          guardrails,
          confirmedForBody,
          culturalHypotheses,
        }
      })
      .sort(rankMarkets)

    const selectedMarkets = eligible.slice(0, maxMarkets)
    const editorialOnlyMarkets = cc.markets
      .filter((m) => m.score >= minEditorial && m.score < minDerivative)
      .map((m) => ({ market: m.market, score: m.score, suggestedAngle: m.suggestedAngle }))
    const excludedMarkets = cc.markets
      .filter((m) => m.score < minEditorial)
      .map((m) => ({ market: m.market, score: m.score }))

    if (selectedMarkets.length === 0) {
      return {
        ...base,
        editorialOnlyMarkets,
        excludedMarkets,
        reason:
          eligible.length === 0
            ? input.onlyMarket
              ? `指定市場 ${input.onlyMarket} は score < ${minDerivative} → 派生しない`
              : `score >= ${minDerivative} の市場なし → 派生しない（通常記事のみ）`
            : `派生候補はあるが maxMarkets=${maxMarkets} で 0 件に絞られた`,
      }
    }

    return {
      ...base,
      mode: 'derivative',
      reason:
        `派生記事候補 ${selectedMarkets.length} 件（${selectedMarkets.map((s) => `${s.market} ${s.score}`).join(' / ')}）。` +
        (eligible.length > selectedMarkets.length
          ? `他に ${eligible.length - selectedMarkets.length} 市場が >=${minDerivative} だが、無理に増やさず記事価値順で上位のみ採用。`
          : ''),
      selectedMarkets,
      editorialOnlyMarkets,
      excludedMarkets,
    }
  } catch (e) {
    return {
      ...base,
      filterUnavailable: true,
      reason: `派生プラン生成で例外（${e instanceof Error ? e.message : String(e)}）→ 通常記事のみ`,
    }
  }
}

/** 監査カード・CLI 用の1行サマリ */
export function derivativePlanSummaryLine(plan: DerivativePlan | null | undefined): string {
  if (!plan) return 'CROSS CULTURE 派生: —'
  if (plan.mode === 'none') return `CROSS CULTURE 派生: なし（${plan.reason}）`
  return `CROSS CULTURE 派生: ${plan.selectedMarkets
    .map((s) => `${s.market} ${s.score}〔${s.articlePotential}〕`)
    .join(' / ')}`
}
