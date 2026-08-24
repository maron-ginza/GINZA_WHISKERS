import type { Endpoint } from 'payload'

import { runSourceLedgerCrawl } from '../lib/crawler/runCrawl'
import { generateSourceCandidatesFromSnapshots } from '../lib/sourceLedger/generateSourceCandidates'

// generateDraft.ts/evaluateSource.ts/socialQueue.tsと同じ考え方——自動化の起点は
// 必ず認証済みの人間（または人間が信任したジョブ実行者）が与える。書き込み先の
// Snapshot作成・SourceLedger.lastCheckedAt/lastChangedAt更新自体は人間ゲート対象外
// （承認・却下のような不可逆な意思決定ではなく、機械的な巡回ログのため）。
//
// これらはSourceLedgerコレクションの`endpoints`として登録する（collections/
// SourceLedger.ts）。payload.config.tsのルート`endpoints`には登録しない——
// Payloadのルーティング（handleEndpoints.js）は、パスの第一セグメントが
// 既存コレクションのslugと一致する場合、ルート直下のconfig.endpointsではなく
// そのコレクション自身のconfig.endpointsだけを検索する。`source-ledger`は
// コレクションslugでもあるため、ルート登録のままでは`/api/source-ledger/crawl`が
// 常に404になる（2026-08-17、Sources接続の実装検証中に発見・修正）。
// パスはコレクションのslugを除いた相対パス（`/crawl`等）で書く。

// POST /api/source-ledger/crawl { dryRun?: boolean }
// enabledなSourceLedgerを巡回しSnapshot保存・差分検知を行う。dryRun:trueの場合は
// 実際のHTTP取得・diff判定は行うがDBへの書き込みは一切行わない。
export const crawlSourceLedgerEndpoint: Endpoint = {
  path: '/crawl',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: '認証が必要です' }, { status: 401 })
    }

    const body = (await req.json?.().catch(() => undefined)) as { dryRun?: boolean } | undefined

    try {
      const result = await runSourceLedgerCrawl(req.payload, { persist: !body?.dryRun })
      return Response.json(result, { status: 200 })
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  },
}

// SOURCE LEDGER 巡回結果 → Sources接続（2026-08-17）。
// generateSourceCandidatesFromSnapshotsと同じ考え方——自動化の起点は必ず
// 認証済みの人間（または人間が信任したジョブ実行者）が与える。書き込み先は
// editorialStatus:inboxのSource新規作成のみで、承認・公開のような不可逆な
// 意思決定ではないため人間ゲート対象外（Sources.tsのeditorialグループの
// 人間ゲートは維持されたまま：AI評価がapproved/publishedへ動かすことはない）。

// POST /api/source-ledger/generate-candidates { dryRun? }
// success:trueかつdiffStatusがchanged/first_seenのsource-snapshotsから、
// editorialStatus:inboxのSourceを冪等に生成する。dryRun:trueの場合は
// 走査・重複判定のみ行いDBへの書き込みは一切行わない。
export const generateSourceCandidatesEndpoint: Endpoint = {
  path: '/generate-candidates',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: '認証が必要です' }, { status: 401 })
    }

    const body = (await req.json?.().catch(() => undefined)) as { dryRun?: boolean } | undefined

    try {
      const result = await generateSourceCandidatesFromSnapshots(req.payload, {
        persist: !body?.dryRun,
      })
      return Response.json(result, { status: 200 })
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  },
}
