// SOURCE LEDGER 自動巡回：前回Snapshotとの差分判定ロジック（Payloadに依存しない純粋関数）。

export const DIFF_STATUSES = ['unchanged', 'changed', 'first_seen', 'fetch_error'] as const
export type DiffStatus = (typeof DIFF_STATUSES)[number]

export const DIFF_STATUS_LABELS: Record<DiffStatus, string> = {
  unchanged: '変化なし',
  changed: '変化あり',
  first_seen: '初回取得',
  fetch_error: '取得失敗',
}

/**
 * @param fetchOk 今回の取得が成功したか
 * @param currentHash 今回のcontentHash（取得失敗時はnull）
 * @param previousSuccessHash 直近で取得に成功した回のcontentHash（一度も成功していなければnull）
 */
export function determineDiffStatus(
  fetchOk: boolean,
  currentHash: string | null,
  previousSuccessHash: string | null,
): DiffStatus {
  if (!fetchOk || !currentHash) return 'fetch_error'
  if (previousSuccessHash === null) return 'first_seen'
  return currentHash === previousSuccessHash ? 'unchanged' : 'changed'
}
