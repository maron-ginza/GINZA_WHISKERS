// GINZA WHISKERS / Project 02（2026-09-14新設）— note下書き自動転記の状態遷移
// （純粋・決定的・AIなし・ファイルI/OもPayloadも持たない）。
//
// noteTransferServer.ts（HTTP・ファイルI/O・Payloadアクセスを担う薄いラッパー）から
// 呼び出される中核ロジックをここへ切り出し、回帰テストで実際のサーバー起動・DB接続
// なしに「重複防止」「3回リトライ上限」「成功記録後は再転記されない」を検証できる
// ようにする。

export interface TransferStateEntry {
  articleId: number
  status: 'pending' | 'in_progress' | 'success' | 'failed'
  attempts: number
  lastError?: string
  lastErrorAt?: string
  draftUrl?: string
  transferredAt?: string
}

export type TransferState = Record<string, TransferStateEntry>

export const MAX_TRANSFER_ATTEMPTS = 3

/**
 * 候補articleId一覧（新しい順等、呼び出し側が決めた優先順）から、次に転記対象と
 * すべき1件を選ぶ。既に success / failed（3回失敗確定）/ in_progress のいずれかの
 * ものはスキップする——同一記事の二重転記防止の中核ロジック。
 */
export function selectNextPendingArticleId(state: TransferState, candidateIds: number[]): number | null {
  for (const id of candidateIds) {
    const entry = state[String(id)]
    if (entry && (entry.status === 'success' || entry.status === 'failed' || entry.status === 'in_progress')) {
      continue
    }
    return id
  }
  return null
}

/** 選ばれたarticleIdを in_progress としてマークした新しいstateを返す（不変更新）。
 * これにより、この直後に同じarticleIdへ再度 pending 取得が来ても
 * selectNextPendingArticleId が弾く（多重タブ・多重取得の防止）。 */
export function claimInProgress(state: TransferState, articleId: number): TransferState {
  const key = String(articleId)
  const prevAttempts = state[key]?.attempts ?? 0
  return { ...state, [key]: { articleId, status: 'in_progress', attempts: prevAttempts } }
}

/** 転記成功を記録する。以後 selectNextPendingArticleId は同じarticleIdを
 * 二度と返さない（success は恒久的に除外される）。 */
export function recordSuccess(
  state: TransferState,
  articleId: number,
  draftUrl: string | undefined,
  nowIso: string,
): TransferState {
  const key = String(articleId)
  const prev = state[key] ?? { articleId, status: 'pending' as const, attempts: 0 }
  return {
    ...state,
    [key]: { articleId, status: 'success', attempts: prev.attempts, draftUrl, transferredAt: nowIso },
  }
}

export interface RecordFailureResult {
  state: TransferState
  exhausted: boolean
  attempts: number
}

/** 転記失敗を記録する。attempts が maxAttempts に達したら status='failed' へ固定し
 * （以後 selectNextPendingArticleId から除外＝「同じ操作を3回より多く繰り返さない」）、
 * 未達なら status='pending' に戻して次回のポーリングで再試行対象にする。 */
export function recordFailure(
  state: TransferState,
  articleId: number,
  error: string,
  nowIso: string,
  maxAttempts: number = MAX_TRANSFER_ATTEMPTS,
): RecordFailureResult {
  const key = String(articleId)
  const prev = state[key] ?? { articleId, status: 'pending' as const, attempts: 0 }
  const attempts = (prev.attempts ?? 0) + 1
  const exhausted = attempts >= maxAttempts
  const nextEntry: TransferStateEntry = {
    articleId,
    status: exhausted ? 'failed' : 'pending',
    attempts,
    lastError: error,
    lastErrorAt: nowIso,
  }
  return { state: { ...state, [key]: nextEntry }, exhausted, attempts }
}
