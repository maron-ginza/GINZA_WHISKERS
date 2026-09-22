// GINZA WHISKERS / Project 02（2026-09-22）— 候補不足時の自動フォールバック判定（純粋関数）。
//
// 【背景】2026-09-22の手動運用で実際にたどった手順（①本日の新規A候補を確認
// →不足→②既存台帳〈carryoverのA候補〉を確認→なお不足→③SWEETS・グルメに
// 限定した登録済み公式情報源への補完取得→それでも0件なら「候補不足」として
// 記事を作らず停止）を、恒久的な自動判定ロジックとして実装したもの。
//
// 【設計方針】
//   ・本関数はDB・ネットワークに一切触れない（数値を受け取って計画を返すだけ）。
//   ・実際の「既存台帳の再検索」「SWEETS限定の補完取得」の実行（副作用）は
//     呼び出し元（CLIスクリプト）の責務——本関数は「今どの段階に進むべきか」
//     だけを決定する。
//   ・候補が本当に無いときは記事を捏造せず insufficient_stop を返す
//     （呼び出し元はこの結果を受けて記事生成・note転記へ絶対に進んではならない）。

export type CandidateFallbackStage =
  | 'sufficient_today'
  | 'sufficient_via_existing_board'
  | 'needs_supplementary_fetch'
  | 'insufficient_stop'

export interface CandidateFallbackInput {
  /** 本日新規に発見されたA候補のうちSWEETS分類の件数 */
  newSweetsCount: number
  /** 本日新規に発見されたA候補のうちSWEETS以外（多様性フィルタ適用後）の件数 */
  newOtherCount: number
  /** 現行の全A候補ボード（本日新規＋持ち越し、多様性フィルタ適用後）のSWEETS件数 */
  boardSweetsCount: number
  /** 現行の全A候補ボード（本日新規＋持ち越し、多様性フィルタ適用後）のSWEETS以外の件数 */
  boardOtherCount: number
  /** 今回のサイクルで既にSWEETS限定の補完取得を試行済みか（二重取得防止） */
  supplementaryFetchAttempted: boolean
  /** 補完取得後の再判定であれば、取得後の全ボードSWEETS件数（未実施ならundefined） */
  boardSweetsCountAfterSupplementary?: number
  /** 補完取得後の再判定であれば、取得後の全ボードその他件数（未実施ならundefined） */
  boardOtherCountAfterSupplementary?: number
}

export interface CandidateFallbackPlan {
  stage: CandidateFallbackStage
  reasons: string[]
  /** stage:'needs_supplementary_fetch' のときのみ、呼び出し元が実行すべきコマンド列挙 */
  recommendedCommands?: string[]
}

/**
 * 充足条件（マロン指示・2026-09-22確定：「新規A候補が3件未満、またはSWEETSが0件なら
 * 既存台帳を自動検索」）。「3件」は合計件数の下限——`./p2 morning-brief`の既存パターン
 * （①ビューティー②グルメ・スイーツ③文化・アート、計3本・うち1本は必ずSWEETS/グルメ）
 * と揃え、SWEETSはこの3件の内数として扱う（SWEETS 1件＋その他2件で3件＝充足）。
 */
const MIN_TOTAL = 3

function isSufficient(sweets: number, other: number): boolean {
  return sweets >= 1 && sweets + other >= MIN_TOTAL
}

/**
 * 候補不足時のフォールバック計画を決定する（純粋関数）。
 * 呼び出し元は stage に応じて以下の順で処理する：
 *   sufficient_today               → そのまま本日の新規候補で確定してよい
 *   sufficient_via_existing_board  → 既存A候補ボード（持ち越し含む）から選定してよい
 *   needs_supplementary_fetch      → recommendedCommands を実行し、再度本関数を呼ぶ
 *   insufficient_stop              → 記事化を一切せず「候補不足」として停止する
 */
export function planCandidateFallback(input: CandidateFallbackInput): CandidateFallbackPlan {
  const reasons: string[] = []

  // ① 本日の新規A候補で充足しているか
  if (isSufficient(input.newSweetsCount, input.newOtherCount)) {
    return {
      stage: 'sufficient_today',
      reasons: [`本日新規A候補で充足（SWEETS ${input.newSweetsCount}件・その他 ${input.newOtherCount}件）`],
    }
  }
  reasons.push(
    `本日新規A候補が不足（SWEETS ${input.newSweetsCount}件・その他 ${input.newOtherCount}件・合計${input.newSweetsCount + input.newOtherCount}件／必要：SWEETS≥1・合計≥${MIN_TOTAL}）`,
  )

  // ② 既存台帳（本日新規＋持ち越し）全体で充足しているか
  const boardSweets = input.boardSweetsCountAfterSupplementary ?? input.boardSweetsCount
  const boardOther = input.boardOtherCountAfterSupplementary ?? input.boardOtherCount
  if (isSufficient(boardSweets, boardOther)) {
    return {
      stage: 'sufficient_via_existing_board',
      reasons: [...reasons, `既存A候補ボード（持ち越し含む）で充足（SWEETS ${boardSweets}件・その他 ${boardOther}件）`],
    }
  }
  reasons.push(`既存A候補ボード（持ち越し含む）でも不足（SWEETS ${boardSweets}件・その他 ${boardOther}件）`)

  // ③ まだSWEETS限定補完取得を試みていなければ、それを提案する
  if (!input.supplementaryFetchAttempted) {
    return {
      stage: 'needs_supplementary_fetch',
      reasons: [...reasons, 'SWEETS・グルメに限定した登録済み公式情報源への補完取得が未実施のため実行を提案する'],
      recommendedCommands: [
        './p2 matsuya-sweets-fetch',
        './p2 matsuya-gourmet-fetch',
        './p2 mitsukoshi-health-check',
        './p2 mitsukoshi-food-events-fetch',
        './p2 sweets-detail-fetch',
      ],
    }
  }

  // ④ 補完取得後もなお不足 → 記事を捏造せず停止
  return {
    stage: 'insufficient_stop',
    reasons: [
      ...reasons,
      'SWEETS限定補完取得を実施済みだが、なお候補が不足している。記事を捏造せず「候補不足」として停止する。',
    ],
  }
}
