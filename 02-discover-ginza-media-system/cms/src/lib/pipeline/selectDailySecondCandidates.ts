// GINZA WHISKERS / Project 02（2026-09-14、マロン指示）— 「本日N本目」の候補を
// 全18カテゴリー横断で選ぶ純粋関数（AIなし・DB非依存・決定的）。
//
// 【背景】既存の morningBriefSelect.ts（buildMorningBrief）は「①スイーツ・和菓子
// ②グルメ ③ビューティー ④文化・アート」の**固定4バケット**しか見ない設計のため、
// 本日既に4領域とも判定済み（または特定カテゴリーが既公開）のあとに「残りの
// カテゴリーから次の1本」を探す手段が無かった。本モジュールは既存のスコアリング
// 基盤（candidateCoverageScore.ts の officialCompleteness / computeCandidateCoverage /
// categoryDeficiencyBonus / facilityConcentrationPenalty、いずれも無変更で再利用）を
// そのまま使い、「候補母集団を広く取り、除外カテゴリーとexpired/重複だけを機械的に
// 落とし、7日間の偏り補正込みスコアで並べる」新しい横断セレクタを追加する。
//
// 【候補母集団の考え方（マロン指示・2026-09-14）】「当日更新された情報」中心では
// なく「今日行く価値があり、まだ記事化していない有効情報」を対象にする——
// 変更なしでも現在開催中／近日開始／終了が近い／季節限定／新商品／新店舗／
// ポップアップ／展覧会・舞台・ライブ／美容サービス・限定メニュー／過去収集済み
// でも未記事化で有効な情報、を排除しない。呼び出し元（DBを見に行くスクリプト側）
// が「当日検知」で候補プールを絞ってしまわないことが前提——本関数自体は
// 「いつ検知されたか」を一切見ない（フィールドとして受け取らない）。
//
// 【必須条件（呼び出し元が渡すデータで機械判定・推測しない）】
//   ・公式URLがある／銀座で訪問・購入・体験できる場所が確認できる／内容が確認できる／
//     出典確認日が記録できる（officialCompleteness.finalEligible が担う）
//   ・終了済みではない（daysUntilEndScore の expired、または明記語 isExplicitlyEndedByTitle）
//   ・同一商品・同一イベントを公開済みではない（duplicate/alreadyPublished/alreadyDrafted）
// 【欠けても除外しない】価格／終了日／予約条件／在庫／詳細な営業時間
//   → 呼び出し元は欠落値を「公式記載なし」のまま渡してよい（本関数はこれらの
//   欠落を理由に除外しない。officialCompleteness も同じ方針で実装済み）。
//
// 【重複判定】施設単位・ページ単位では除外しない——同一施設でも商品・イベント名が
// 異なれば別候補として扱う（呼び出し元の duplicate 判定は dedupCheck.ts の
// URL/DC参照/類似タイトル+同一開催日 基準をそのまま使うこと。施設一致だけを
// 理由に duplicate 扱いしない）。
//
// 【カテゴリー分散】1日単位ではなく直近7日間の categoryCounts7d／facilityCounts7d
// を渡すことで、categoryDeficiencyBonus・facilityConcentrationPenalty
// （いずれも既存・無変更）が自動的に「7日間で18カテゴリー最低1回」「同一施設の
// 連続投稿回避」を score へ反映する。

import {
  officialCompleteness,
  computeCandidateCoverage,
  daysUntilEndScore,
  isExplicitlyEndedByTitle,
  type OfficialCompletenessResult,
} from './candidateCoverageScore'

export interface SecondCandidateInput {
  dcId: number
  title: string
  displayTitle?: string | null
  sourceName: string
  sourceUrl: string
  venue?: string | null
  facilityKey?: string | null
  facilityLabel?: string | null
  /** 呼び出し元が確定済みのカテゴリー（deriveProvisionalCategory 等で解決済み想定） */
  category: string | null
  excerpt?: string | null
  whatHappens?: string | null
  eventStartAt?: string | null
  eventEndAt?: string | null
  verifiedAt?: string | null
  priceText?: string | null
  targetFit?: number | null
  facilityResolved?: boolean
  /** dedupCheck.ts 等、呼び出し元が別途判定した重複フラグ（施設一致だけでtrueにしないこと） */
  duplicate?: boolean
  alreadyPublished?: boolean
  alreadyDrafted?: boolean
}

export interface SelectDailySecondCandidatesOptions {
  /** 本日既に確定・公開済みのカテゴリー（例：本日グルメ/スイーツを公開済みなら ['SWEETS','FOOD']） */
  excludeCategories?: string[]
  /** 直近7日間のカテゴリー別採用件数（無ければ全カテゴリー0＝categoryDeficiencyBonus が中立に働く） */
  categoryCounts7d?: Record<string, number>
  /** 直近7日間の施設別採用件数 */
  facilityCounts7d?: Record<string, number>
  /** 本日すでに使った施設キー（同一施設の連続投稿回避、facilityKey一致で除外ではなく減点に留める） */
  now?: Date
  limit?: number
}

export interface SecondCandidateResult {
  dcId: number
  title: string
  category: string | null
  facilityLabel: string | null
  sourceName: string
  sourceUrl: string
  venue: string | null
  eventPeriodText: string
  priceText: string
  verifiedAt: string | null
  score: number
  scoreReason: string
  official: OfficialCompletenessResult
}

export interface SelectDailySecondCandidatesResult {
  picked: SecondCandidateResult[]
  /** 除外された件数と理由の内訳（水増ししていないことの監査用） */
  excludedReasons: Record<string, number>
  evaluatedCount: number
}

function periodText(c: SecondCandidateInput): string {
  const s = c.eventStartAt ? c.eventStartAt.slice(0, 10) : null
  const e = c.eventEndAt ? c.eventEndAt.slice(0, 10) : null
  if (s && e) return `${s} 〜 ${e}`
  if (s) return `${s} 〜 公式記載なし`
  if (e) return `公式記載なし 〜 ${e}`
  return '公式記載なし'
}

/**
 * 候補プール → 除外カテゴリー・expired・重複を機械的に落とし、7日間偏り補正込みの
 * スコアで並べて上位 limit 件を返す（既定3件）。基準を満たす候補が limit 未満なら
 * その実数のみを返す（水増ししない）。
 */
export function selectDailySecondCandidates(
  candidates: SecondCandidateInput[],
  opts: SelectDailySecondCandidatesOptions = {},
): SelectDailySecondCandidatesResult {
  const excludeCats = new Set((opts.excludeCategories ?? []).map((c) => c.toUpperCase()))
  const categoryCounts7d = opts.categoryCounts7d ?? {}
  const facilityCounts7d = opts.facilityCounts7d ?? {}
  const now = opts.now ?? new Date()
  const limit = opts.limit ?? 3

  const excludedReasons: Record<string, number> = {}
  const bump = (reason: string) => {
    excludedReasons[reason] = (excludedReasons[reason] ?? 0) + 1
  }

  const scored: SecondCandidateResult[] = []

  for (const c of candidates) {
    const cat = (c.category ?? '').toUpperCase() || null
    if (cat && excludeCats.has(cat)) {
      bump('本日既に公開/確定済みのカテゴリー')
      continue
    }
    if (c.alreadyPublished) {
      bump('既公開テーマとの重複')
      continue
    }
    if (c.alreadyDrafted) {
      bump('既に下書き化済み')
      continue
    }
    if (c.duplicate) {
      bump('同一商品・同一イベントの重複')
      continue
    }
    if (isExplicitlyEndedByTitle(c.title) || isExplicitlyEndedByTitle(c.displayTitle)) {
      bump('タイトルに終了の明記語あり')
      continue
    }
    const due = daysUntilEndScore(c.eventEndAt, now)
    if (due.expired) {
      bump('開催・販売終了済み（構造化日付）')
      continue
    }

    const official = officialCompleteness({
      sourceUrl: c.sourceUrl,
      eventStartAt: c.eventStartAt,
      eventEndAt: c.eventEndAt,
      eventPeriod: periodText(c) === '公式記載なし' ? null : periodText(c),
      venue: c.venue,
      facilityResolved: c.facilityResolved ?? !!c.facilityKey,
      whatHappens: c.whatHappens,
      excerpt: c.excerpt,
      productOrCampaignName: c.displayTitle ?? c.title,
      verifiedAt: c.verifiedAt,
    })
    if (!official.finalEligible) {
      bump(`公式情報の必須項目が未確認（${official.requiredMissing.join('・')}）`)
      continue
    }

    const coverage = computeCandidateCoverage({
      category: cat,
      facilityKey: c.facilityKey ?? null,
      categoryCounts7d,
      facilityCounts7d,
      official: {
        sourceUrl: c.sourceUrl,
        eventStartAt: c.eventStartAt,
        eventEndAt: c.eventEndAt,
        venue: c.venue,
        facilityResolved: c.facilityResolved ?? !!c.facilityKey,
        whatHappens: c.whatHappens,
        excerpt: c.excerpt,
        productOrCampaignName: c.displayTitle ?? c.title,
        verifiedAt: c.verifiedAt,
      },
      targetFit: c.targetFit,
      eventEndAt: c.eventEndAt,
      now,
    })

    scored.push({
      dcId: c.dcId,
      title: c.displayTitle ?? c.title,
      category: cat,
      facilityLabel: c.facilityLabel ?? null,
      sourceName: c.sourceName,
      sourceUrl: c.sourceUrl,
      venue: c.venue ?? null,
      eventPeriodText: periodText(c),
      priceText: c.priceText && c.priceText.trim() ? c.priceText : '公式記載なし',
      verifiedAt: c.verifiedAt ?? null,
      score: 0.5 + coverage.adjust,
      scoreReason: coverage.reason,
      official,
    })
  }

  scored.sort((a, b) => b.score - a.score)

  return {
    picked: scored.slice(0, limit),
    excludedReasons,
    evaluatedCount: candidates.length,
  }
}
