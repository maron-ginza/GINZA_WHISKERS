// GINZA WHISKERS / Project 02（2026-09-24続き2）— 候補ボード上のカテゴリーが0件のとき、
// 「なぜ0件か」を既存の判定結果（CandidateAssessment）だけから機械的に要約する。
//
// 【背景】マロン指示：「SWEETSは毎朝優先して探し、条件を満たす候補が0件なら
// 『SWEETS 0件』と理由を表示したうえで、他の18カテゴリーから旬の候補を提示する」。
// 従来は candidateBoard.sweets.length===0 のとき単に「該当候補なし」とだけ表示し、
// B/C判定に落ちた実際の理由（既投稿重複・施設14日間隔・掲載期間未確認・出典URLなし・
// 銀座関連性不明・開催終了等）が見えなかった。
//
// 【設計】決定的・DB/ネットワーク非依存の純粋関数。既にassessCandidateが計算済みの
// dedup/facilityNotice/reasons/hasTraceableSource/ginzaRelevant/expiredをそのまま
// 集計するだけで、新たな判定ロジック・新たな除外条件は一切追加しない
// （＝安全条件を緩める余地がない）。1候補が複数の理由に該当する場合は該当する
// 全ての理由カウントへ加算する（「主因1つに絞らない」——実際に落ちた理由を
// 網羅的に示す方が、条件緩和の要否をマロンが判断する材料として有用なため）。

import type { CandidateAssessment } from './types'

export interface ShortfallReasonCount {
  label: string
  count: number
}

export interface ShortfallSummary {
  /** 対象母数（verdict!=='A'の候補数） */
  totalNonA: number
  reasons: ShortfallReasonCount[]
}

/**
 * 既に verdict!=='A' な候補群（呼び出し側がカテゴリー等で絞り込み済み）を受け取り、
 * 「実際に落ちた理由」の内訳を集計する。1件が複数理由に該当する場合は両方へ加算。
 */
export function summarizeShortfallReasons(items: CandidateAssessment[]): ShortfallSummary {
  const nonA = items.filter((it) => it.verdict !== 'A')
  const counts = new Map<string, number>()
  const bump = (label: string): void => {
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  for (const it of nonA) {
    if (it.dedup?.duplicate) bump('既投稿と重複')
    if (it.facilityNotice?.recentlyUsed) bump('施設14日間隔（直近使用）')
    if (!it.hasTraceableSource) bump('追跡可能な公式出典URLが無い')
    if (!it.ginzaRelevant) bump('銀座関連性を確認できない')
    if (it.expired) bump('開催終了済み')
    if (it.reasons.some((r) => r.includes('articleFactsNotReady'))) bump('期間・必須事実が公式情報で未確認')
    if (it.reasons.some((r) => r.startsWith('明確に古い情報'))) bump('明確に古い情報')
    if (it.reasons.some((r) => r.startsWith('候補対象外'))) bump('候補対象外（一覧・ナビ等のページ）')
    // 上記いずれにも該当しない場合のみ「その他」（推測で細分化しない）
    const matchedAny =
      it.dedup?.duplicate ||
      it.facilityNotice?.recentlyUsed ||
      !it.hasTraceableSource ||
      !it.ginzaRelevant ||
      it.expired ||
      it.reasons.some(
        (r) =>
          r.includes('articleFactsNotReady') ||
          r.startsWith('明確に古い情報') ||
          r.startsWith('候補対象外'),
      )
    if (!matchedAny) bump('その他')
  }

  const reasons = Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)

  return { totalNonA: nonA.length, reasons }
}

/** digestMeta.category === category の候補だけに絞り込むヘルパー（呼び出し側の重複記述を避ける）。 */
export function filterByCategory(items: CandidateAssessment[], category: string): CandidateAssessment[] {
  return items.filter((it) => it.digestMeta?.category === category)
}

/** SWEETS以外の分類済み候補（未分類含まない）を対象にする——「他の18カテゴリー全体」の要約用。 */
export function filterNonSweetsClassified(items: CandidateAssessment[]): CandidateAssessment[] {
  return items.filter((it) => it.digestMeta?.category != null && it.digestMeta.category !== 'SWEETS')
}
