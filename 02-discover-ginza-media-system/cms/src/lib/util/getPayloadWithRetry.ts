// getPayload() 呼び出し時に稀に発生する、Payload/drizzle-kitのdev-push
// （開発モードのスキーマ自動同期。マイグレーションファイルではない）の
// 一時的な競合を吸収するための薄いリトライラッパー（2026-09-22新設）。
//
// 実例（2026-09-22 6:00の自動巡回 `./p2 crawl` で実際に発生）：
//   DrizzleQueryError: Failed query: ALTER TABLE "_article_editorial_provenance_v"
//   DROP CONSTRAINT "..._discovered_content_source_id_di";
//   cause: constraint "..." of relation "_article_editorial_provenance_v" does not exist
//
// 原因は、本プロジェクトで長時間起動し続ける別プロセス（CMS管理画面の
// `next dev`、`noteTransferServer.ts`等）が同時にgetPayload()の
// dev-pushを行い、同一の制約に対するDROP/再作成が競合したものと推定される
// （2026-09-22調査時点：payload_migrationsテーブルに滞留中のマイグレーション
// はなく、該当制約は現在のDBスキーマ上に正しく存在することを確認済み——
// 恒久的なスキーマ破損ではなく一過性の競合と判断）。
//
// drizzle-kitが生成するDROP CONSTRAINT文自体（IF EXISTS化等）はこの
// プロジェクトのコードではなく変更できないため、「同じ処理を繰り返しても
// 失敗しないようにする」対策として、呼び出し側（getPayload()の呼び出し）を
// 短い待機を挟んで1回だけ再試行する。対象はこの競合パターン
// （DROP CONSTRAINT ... does not exist）のみに限定し、それ以外のエラーは
// 即座に再throwする（推測で他のエラーまで握りつぶさない）。
export interface GetPayloadWithRetryOptions {
  retries?: number
  delayMs?: number
  sleep?: (ms: number) => Promise<void>
}

const DEFAULT_RETRIES = 1
const DEFAULT_DELAY_MS = 3000

function isTransientDropConstraintRace(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  // DROP CONSTRAINT の失敗かつ「既に存在しない」が同時に成立する場合のみ、
  // dev-push競合として扱う（他のDDLエラー・接続エラー等は対象外）。
  return /DROP CONSTRAINT/i.test(msg) && /does not exist/i.test(msg)
}

/**
 * loadFn（通常は `() => getPayload({ config })`）を実行し、dev-pushの
 * 一過性のDROP CONSTRAINT競合を検知した場合のみ、短い待機を挟んで
 * 最大 `retries` 回まで再試行する。
 */
export async function getPayloadWithRetry<T>(
  loadFn: () => Promise<T>,
  options: GetPayloadWithRetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? DEFAULT_RETRIES
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await loadFn()
    } catch (err) {
      lastErr = err
      const isLastAttempt = attempt === retries
      if (!isTransientDropConstraintRace(err) || isLastAttempt) {
        throw err
      }
      await sleep(delayMs)
    }
  }
  // ここには到達しない（ループ内で必ずreturnかthrow）が、型を満たすため。
  throw lastErr
}
