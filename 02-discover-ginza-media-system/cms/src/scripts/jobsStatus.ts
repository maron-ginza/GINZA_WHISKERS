import { getPayload } from 'payload'

import config from '../payload.config'

// `./p2 jobs` から呼び出す、Payload Jobs Queue（cron機能）の状態確認スクリプト
// （editorialStatus.ts/socialStatus.tsと同じ方式：Local API + overrideAccess:true、
// 読み取り専用）。
//
// 設計意図（2026-08-17、定期実行のCLAUDE.md議論参照）：SOURCE LEDGER自動巡回
// （source-ledger-crawlタスク、cms/src/lib/jobs/sourceLedgerCrawlTask.ts）の
// 実行自体はPayload標準のJobs Queue cron機能が担う——CMSサーバープロセスが
// 起動して最初のリクエストを処理した時点で自動的に有効化されるため、
// `./p2 morning`から明示的にトリガーする必要がない。
// このスクリプトは「巡回が正しく動いているか」を可視化するだけの読み取り専用
// レポートであり、これを実行しても新規のHTTP巡回・DB書き込みは一切発生しない
// （2026-08-16までの`./p2 crawl`が持っていた「毎朝の起動シーケンスへ実ネットワーク
// アクセスを無条件に追加してしまう」という問題を、`./p2 morning`へ統合しても
// 再現しない設計）。

const TASK_SLUG = 'source-ledger-crawl'
const QUEUE = 'source-ledger'
const RECENT_LIMIT = 5

async function main() {
  const payload = await getPayload({ config })

  // 次回実行予定（未完了・エラーなし＝スケジュール済み or 実行待ちのジョブのうち、最も近いもの）
  const { docs: pendingDocs } = await payload.find({
    collection: 'payload-jobs',
    where: {
      and: [
        { taskSlug: { equals: TASK_SLUG } },
        { completedAt: { exists: false } },
        { hasError: { equals: false } },
      ],
    },
    sort: 'waitUntil',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  // 直近の実行履歴（完了済み、成功・失敗いずれも）
  const { docs: recentDocs, totalDocs: totalCompleted } = await payload.find({
    collection: 'payload-jobs',
    where: {
      and: [{ taskSlug: { equals: TASK_SLUG } }, { completedAt: { exists: true } }],
    },
    sort: '-completedAt',
    limit: RECENT_LIMIT,
    depth: 0,
    overrideAccess: true,
  })

  const lastLogEntry = (doc: (typeof recentDocs)[number]) => {
    const log = Array.isArray(doc.log) ? doc.log : []
    return log.length > 0 ? log[log.length - 1] : null
  }

  const recentRuns = recentDocs.map((doc) => {
    const log = lastLogEntry(doc)
    return {
      jobId: doc.id,
      completedAt: doc.completedAt,
      hasError: doc.hasError,
      error: doc.hasError ? doc.error : undefined,
      output: log && log.state === 'succeeded' ? log.output : undefined,
    }
  })

  const result = {
    taskRegistered: true,
    queue: QUEUE,
    nextScheduled:
      pendingDocs.length > 0
        ? { waitUntil: pendingDocs[0].waitUntil, jobId: pendingDocs[0].id }
        : null,
    totalCompletedRuns: totalCompleted,
    recentRuns,
    lastSuccessfulRun: recentRuns.find((run) => !run.hasError) ?? null,
  }

  console.log(JSON.stringify(result))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
