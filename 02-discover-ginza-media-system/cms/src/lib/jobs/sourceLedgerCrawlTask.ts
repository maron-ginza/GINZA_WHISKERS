import type { TaskConfig } from 'payload'

import { runSourceLedgerCrawl } from '../crawler/runCrawl'
import { generateSourceCandidatesFromSnapshots } from '../sourceLedger/generateSourceCandidates'

// SOURCE LEDGER 定期実行（2026-08-17）。
//
// OSレベルのcron/launchdではなく、Payload純正のJobs Queue（cron機能）を使う設計にした。
// 理由：
// ①ローカル開発機（`next dev`）とRailway本番（常駐Next.jsサーバー）のどちらでも
//   同じコードパスで動く——OS依存のスケジューラを別途用意する必要がない。
// ②Payloadは`getPayload()`が`cron:true`付きで呼ばれるとcronを初期化するが、
//   管理画面・REST APIの各リクエストを処理する`createPayloadRequest`/`initReq`
//   （@payloadcms/next、initReq.js/createPayloadRequest.js）が常にこれを渡すため、
//   CMSサーバープロセスが起動して最初のリクエストを1件でも処理すれば自動的に
//   cronが有効化される（`./p2 start`等の既存起動シーケンスは変更不要）。
// ③Payloadの公式ドキュメントは「autoRunはVercel等のサーバーレス環境では使うべきで
//   ない」と明記しているが、Railwayは常駐コンテナでありサーバーレスではないため
//   この制約に抵触しない（付録F参照）。
//
// スケジュール：毎朝6:00（Payload/Croner内部はcron文字列をサーバープロセスの
// ローカルタイムゾーンで評価する。ローカル開発機はAsia/Tokyo基準であることを
// 確認済み。Railway本番展開時はコンテナの`TZ`環境変数をAsia/Tokyoに設定すること
// ——未設定だとUTC基準になり6時間ずれる。CLAUDE.md未決事項に記録）。
//
// 冪等性・安全性：`runSourceLedgerCrawl`/`generateSourceCandidatesFromSnapshots`は
// いずれも既存のPayload Local API（overrideAccess:true）をそのまま呼ぶだけで、
// `./p2 crawl`のCLI実行や手動でのAPI呼び出しと完全に同じ処理・同じ冪等性を持つ
// （1サイトの取得失敗は個別にtry/catchされ全体を止めない、Source候補生成は
// crawlOrigin.sourceSnapshotの重複チェックで二重生成しない）。またPayload標準の
// 「同一queue・同一taskのジョブが実行中/未来に実行予定であれば新規スケジュール
// しない」というデフォルトガード（defaultBeforeSchedule）により、前回の巡回が
// 長引いていても二重実行にはならない。
export const sourceLedgerCrawlTask: TaskConfig<'source-ledger-crawl'> = {
  slug: 'source-ledger-crawl',
  label: 'SOURCE LEDGER 自動巡回（Fetch→Snapshot→Diff→Sources候補生成）',
  schedule: [{ cron: '0 6 * * *', queue: 'source-ledger' }],
  inputSchema: [],
  outputSchema: [
    { name: 'scannedSources', type: 'number' },
    { name: 'changedCount', type: 'number' },
    { name: 'firstSeenCount', type: 'number' },
    { name: 'unchangedCount', type: 'number' },
    { name: 'fetchErrorCount', type: 'number' },
    { name: 'candidatesCreated', type: 'number' },
  ],
  handler: async ({ req }) => {
    const crawl = await runSourceLedgerCrawl(req.payload, { persist: true })
    const candidates = await generateSourceCandidatesFromSnapshots(req.payload, { persist: true })

    return {
      output: {
        scannedSources: crawl.scannedSources,
        changedCount: crawl.summary.changed,
        firstSeenCount: crawl.summary.first_seen,
        unchangedCount: crawl.summary.unchanged,
        fetchErrorCount: crawl.summary.fetch_error,
        candidatesCreated: candidates.createdCount,
      },
    }
  },
}
