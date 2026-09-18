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
  /** 2026-09-14続き22：claimInProgressでin_progress化された時刻（ISO8601、
   * 呼び出し側がnowIsoを渡した場合のみ記録）。ブラウザ側の処理が結果報告なしに
   * 消滅した場合（Service Worker停止・タブの想定外遷移等、実機で発見）でも
   * サーバー側のin_progressクレームには従来タイムアウトが無く永久に残って
   * しまっていた——staleInProgressMsを超えて経過していれば再選出可能にする
   * ための基準時刻。 */
  claimedAt?: string
  /** 2026-09-14続き32（マロン指示：「runIdまたはattemptToken単位でサーバー
   * 側を原子的に1回だけclaimし、同じcompletion-onlyジョブを再取得できない
   * ようにする」）：completion-onlyジョブがclaimInProgressで最初にクレーム
   * された時点で恒久的にtrueへセットされ、以後selectNextPendingArticleId
   * から二度と選出されなくなる「一度きりのラッチ」。completionAttempts等の
   * カウンタ値に依存しないため、カウンタの不整合（古いサーバープロセスが
   * 更新前のロジックのまま動いていた等）があっても再取得を構造的に防げる。 */
  completionClaimStarted?: boolean
  /** claimInProgressが払い出す、このクレームだけに紐づく一意なトークン。
   * /result（recordCompletionAttempt）が同じトークンを伴わない結果報告
   * （古い/重複した報告等）を受け取った場合はstateを変更せず無視する。 */
  activeRunToken?: string
}

export type TransferState = Record<string, TransferStateEntry>

export const MAX_TRANSFER_ATTEMPTS = 3

/** 2026-09-14続き31（マロン指示：「実機検証時の自動試行上限を1回にする。
 * 3回の自動再試行は禁止」）：completion-onlyジョブ（既にタイトル・本文・
 * 初回保存は成功済み、ハッシュタグ・カテゴリー画像のみ再試行するジョブ）
 * の自動再試行回数の上限。full モード（新規記事の初回転記、
 * recordFailure・MAX_TRANSFER_ATTEMPTS）とは意図的に別の定数とする——
 * 実機検証を繰り返す中で3回の自動再試行が同じ原因で連続発生し検証の
 * ノイズになっていたため、completion-onlyジョブに限り1回で打ち切る。 */
export const MAX_COMPLETION_ATTEMPTS = 1

/** ブラウザ側 inFlightArticleId のタイムアウト（120000ms）より余裕を持たせた
 * サーバー側 in_progress のstale判定しきい値（2026-09-14続き22）。 */
export const STALE_IN_PROGRESS_MS = 150000

/**
 * 候補articleId一覧（新しい順等、呼び出し側が決めた優先順）から、次に転記対象と
 * すべき1件を選ぶ。既に success（needsCompletionでない）／failed（3回失敗確定）／
 * in_progress のいずれかのものはスキップする——同一記事の二重転記防止の中核
 * ロジック。ただし success かつ needsCompletion=true かつ completionAttempts が
 * 上限未満のものは「completion-only」候補として再度選出できる
 * （呼び出し側が entry.status==='success' を見て completion-only モードと判断する）。
 *
 * 2026-09-14続き22：nowMs（＋staleInProgressMs）を渡した場合、claimedAtから
 * 十分な時間が経過したin_progress候補は「ブラウザ側が結果報告なしに消滅した
 * （＝以後永久にブロックされ続ける）」とみなし再選出可能にする。nowMsを渡さない
 * 呼び出し（既存テスト等）は従来どおりin_progressを常にスキップする。
 */
export function selectNextPendingArticleId(
  state: TransferState,
  candidateIds: number[],
  nowMs?: number,
  staleInProgressMs: number = STALE_IN_PROGRESS_MS,
): number | null {
  for (const id of candidateIds) {
    const entry = state[String(id)]
    if (!entry) return id
    if (entry.status === 'in_progress') {
      if (nowMs != null && entry.claimedAt) {
        const age = nowMs - Date.parse(entry.claimedAt)
        if (Number.isFinite(age) && age >= staleInProgressMs) return id
      }
      continue
    }
    if (entry.status === 'failed') continue
    if (entry.status === 'success') {
      const needsCompletion = entry.needsCompletion === true
      // 2026-09-14続き32（マロン指示）：completionAttemptsのカウンタ判定
      // だけに頼らず、completionClaimStarted（一度クレームしたら恒久的に
      // true）を主たるゲートとする——「原子的に1回だけclaim」を、カウンタの
      // 不整合（古いサーバープロセスが更新前ロジックのまま動作していた等）
      // に依存せず構造的に保証する。
      const alreadyClaimed = entry.completionClaimStarted === true
      const completionAttempts = entry.completionAttempts ?? 0
      if (needsCompletion && !alreadyClaimed && completionAttempts < MAX_COMPLETION_ATTEMPTS) return id
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
 * 保持する（成功記録は上書きしない——タイトル/本文が既に確定済みという事実を失わない）。
 * nowIsoを渡すとclaimedAtとして記録し、staleな放置クレームの再選出判定に使われる。
 *
 * 2026-09-14続き32（マロン指示：「runIdまたはattemptToken単位でサーバー側を
 * 原子的に1回だけclaimする」）：runTokenを渡すとactiveRunTokenとして記録し、
 * このクレームがcompletion-onlyジョブ（draftUrlが既にある＝determineTransferMode
 * が'completion'）である場合はcompletionClaimStartedを恒久的にtrueへセットする
 * ——以後selectNextPendingArticleIdは（completionAttemptsの値に関わらず）二度と
 * このarticleIdをcompletion候補として選出しない。 */
export function claimInProgress(state: TransferState, articleId: number, nowIso?: string, runToken?: string): TransferState {
  const key = String(articleId)
  const prev = state[key]
  const isCompletionClaim = determineTransferMode(prev) === 'completion'
  return {
    ...state,
    [key]: {
      articleId,
      status: 'in_progress',
      attempts: prev?.attempts ?? 0,
      needsCompletion: prev?.needsCompletion,
      completionAttempts: prev?.completionAttempts,
      claimedAt: nowIso,
      draftUrl: prev?.draftUrl,
      activeRunToken: runToken,
      completionClaimStarted: isCompletionClaim ? true : prev?.completionClaimStarted,
    },
  }
}

/** 選出されたarticleIdについて、既存のstate entry（in_progress化される前の
 * 値、またはstale再選出時点でのin_progress値）から full／completion のどちら
 * のジョブとして扱うべきかを決める（2026-09-14続き22で status==='success' 判定
 * から独立させた純粋関数）。draftUrlが記録されている＝タイトル・本文・初回
 * 保存は過去に成功済みという事実であり、entry.statusが現在'in_progress'
 * （stale再選出）であろうと'success'であろうと変わらない——draftUrlの有無だけで
 * 判定することで、stale in_progressを誤ってfullモード（タイトル・本文の
 * 再入力）へ後退させない。 */
export function determineTransferMode(entry: TransferStateEntry | undefined): 'full' | 'completion' {
  return entry?.draftUrl ? 'completion' : 'full'
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
 * draftUrl・transferredAt（タイトル/本文/初回保存の成功記録）は変更しない。
 *
 * 2026-09-14続き32（マロン指示：「原子的に1回だけclaim」）：runTokenを渡した
 * 場合、現在のactiveRunTokenと一致しない結果報告（古い/重複した報告、複数の
 * サーバープロセスが同時に動いていた等）は無視し、stateを一切変更しない
 * ——「同じcompletion-onlyジョブの結果報告で二重にstateを進めてしまう」こと
 * を構造的に防ぐ。一致した場合はactiveRunTokenをクリアする（クレーム消費済み）。 */
export function recordCompletionAttempt(
  state: TransferState,
  articleId: number,
  succeeded: boolean,
  runToken?: string,
): TransferState {
  const key = String(articleId)
  const prev = state[key]
  if (!prev) return state
  if (runToken != null && prev.activeRunToken != null && runToken !== prev.activeRunToken) {
    return state
  }
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
      needsCompletion: succeeded ? false : completionAttempts < MAX_COMPLETION_ATTEMPTS,
      completionAttempts,
      activeRunToken: undefined,
      // completionClaimStartedは既にtrueのまま維持される（prevをspread
      // しているため）——一度クレームしたら恒久的に選出対象から外れ続ける。
    },
  }
}

/**
 * 2026-09-18新設（マロン指示・根本修正）：拡張から報告されたdraftUrlが、
 * 既に**別の**articleIdの記録として使われていないかを確認する。
 *
 * 【背景】#73（新規記事）の転記が、直前に#72が使用したnote編集タブを誤って
 * 再利用し、#72のdraftUrlと完全に同一のURLをそのまま「成功」として記録して
 * しまった事故が発生した（実際には#73の内容が#72の下書きへ上書きされていた）。
 * この関数は success を記録する**前**に呼び出し、衝突があれば
 * recordSuccess を呼ばず recordFailure へ回す（success として確定させない）。
 *
 * 同一articleId自身の既存エントリ（completion再試行等で同じdraftUrlを
 * 引き続き参照するケース）との一致は衝突とみなさない——別記事の下書きを
 * 誤って再利用・上書きしていないかだけを見る。
 */
export function findConflictingArticleForDraftUrl(
  state: TransferState,
  articleId: number,
  draftUrl: string | undefined,
): number | null {
  if (!draftUrl) return null
  for (const [key, entry] of Object.entries(state)) {
    const otherId = Number(key)
    if (otherId === articleId) continue
    if (entry.draftUrl === draftUrl) return otherId
  }
  return null
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
