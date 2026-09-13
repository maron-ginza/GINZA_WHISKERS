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
  /** 2026-09-14続き5：本文・タイトル・下書き保存は成功したが、ハッシュタグ・
   * カテゴリーアイコンの付与が未完了のまま記録された成功（実機検証で発生した
   * 実際のケース）。true の間は selectNextPendingArticleId が「completion-only」
   * ジョブとして再選出できる——タイトル・本文の再入力はせず、ハッシュタグ・
   * アイコンの追加試行と再保存だけを行う想定。 */
  needsCompletion?: boolean
  completionAttempts?: number
}

export type TransferState = Record<string, TransferStateEntry>

export const MAX_TRANSFER_ATTEMPTS = 3

/**
 * 候補articleId一覧（新しい順等、呼び出し側が決めた優先順）から、次に転記対象と
 * すべき1件を選ぶ。既に success（needsCompletionでない）／failed（3回失敗確定）／
 * in_progress のいずれかのものはスキップする——同一記事の二重転記防止の中核
 * ロジック。ただし success かつ needsCompletion=true かつ completionAttempts が
 * 上限未満のものは「completion-only」候補として再度選出できる
 * （呼び出し側が entry.status==='success' を見て completion-only モードと判断する）。
 */
export function selectNextPendingArticleId(state: TransferState, candidateIds: number[]): number | null {
  for (const id of candidateIds) {
    const entry = state[String(id)]
    if (!entry) return id
    if (entry.status === 'in_progress') continue
    if (entry.status === 'failed') continue
    if (entry.status === 'success') {
      const needsCompletion = entry.needsCompletion === true
      const completionAttempts = entry.completionAttempts ?? 0
      if (needsCompletion && completionAttempts < MAX_TRANSFER_ATTEMPTS) return id
      continue
    }
    return id
  }
  return null
}

/** 選ばれたarticleIdを in_progress としてマークした新しいstateを返す（不変更新）。
 * これにより、この直後に同じarticleIdへ再度 pending 取得が来ても
 * selectNextPendingArticleId が弾く（多重タブ・多重取得の防止）。completion-only
 * ジョブを in_progress 化する場合も、既存の needsCompletion/completionAttempts は
 * 保持する（成功記録は上書きしない——タイトル/本文が既に確定済みという事実を失わない）。 */
export function claimInProgress(state: TransferState, articleId: number): TransferState {
  const key = String(articleId)
  const prev = state[key]
  return {
    ...state,
    [key]: {
      articleId,
      status: 'in_progress',
      attempts: prev?.attempts ?? 0,
      needsCompletion: prev?.needsCompletion,
      completionAttempts: prev?.completionAttempts,
      draftUrl: prev?.draftUrl,
    },
  }
}

/** 転記成功を記録する。needsCompletion=true の場合（ハッシュタグ・アイコンが
 * 未完了のまま保存された場合）は selectNextPendingArticleId が
 * completion-only ジョブとして再選出できる状態のまま success を記録する
 * （success 自体は恒久——タイトル・本文・保存の成功という事実は変更しない）。 */
export function recordSuccess(
  state: TransferState,
  articleId: number,
  draftUrl: string | undefined,
  nowIso: string,
  needsCompletion = false,
): TransferState {
  const key = String(articleId)
  const prev = state[key] ?? { articleId, status: 'pending' as const, attempts: 0 }
  return {
    ...state,
    [key]: {
      articleId,
      status: 'success',
      attempts: prev.attempts,
      draftUrl,
      transferredAt: nowIso,
      needsCompletion,
      completionAttempts: prev.completionAttempts ?? 0,
    },
  }
}

/** completion-onlyジョブの試行を記録する（成功時はneedsCompletion=falseへ、
 * 失敗時はcompletionAttemptsを加算し上限で以後再試行しない）。success状態・
 * draftUrl・transferredAt（タイトル/本文/初回保存の成功記録）は変更しない。 */
export function recordCompletionAttempt(
  state: TransferState,
  articleId: number,
  succeeded: boolean,
): TransferState {
  const key = String(articleId)
  const prev = state[key]
  if (!prev) return state
  const completionAttempts = (prev.completionAttempts ?? 0) + 1
  return {
    ...state,
    [key]: {
      ...prev,
      // 2026-09-14続き5で発見したバグの修正：completion-onlyジョブはclaimInProgress
      // により一旦status='in_progress'化される。ここでstatusを明示的に'success'へ
      // 戻さないと、以後selectNextPendingArticleIdが「in_progress」判定で永久に
      // 除外し続け（前回のinFlight永久ブロックと同種のバグ）、completionAttemptsが
      // 上限未満でも二度と再試行されなくなる。
      status: 'success',
      needsCompletion: succeeded ? false : completionAttempts < MAX_TRANSFER_ATTEMPTS,
      completionAttempts,
    },
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
