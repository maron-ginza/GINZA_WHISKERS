import { getPayload } from 'payload'

import { runSourceLedgerCrawl } from '../lib/crawler/runCrawl'
import { getDiscoveredContentSummary } from '../lib/curation/discoveredContentSummary'
import { generateSourceCandidatesFromSnapshots } from '../lib/sourceLedger/generateSourceCandidates'
import config from '../payload.config'

// `./p2 crawl` から呼び出すCLIエントリ。SOURCE LEDGERのenabledな情報源を巡回し、
// Snapshot保存・差分検知を行ったうえで、差分あり(changed)・初回取得(first_seen)の
// Snapshotから既存SourcesコレクションへeditorialStatus:inboxの候補を生成する
// （2026-08-17、巡回結果とSourcesの接続。冪等——既存候補は再作成しない）。
// Local API + overrideAccess:true で実行するため管理画面ログインは不要
// （editorialStatus.ts/socialStatus.tsと同じ方式）。
//
// 実行例:
//   cd cms && node --env-file=.env --import=tsx/esm src/scripts/crawlSources.ts
//   cd cms && node --env-file=.env --import=tsx/esm src/scripts/crawlSources.ts --dry-run
//   cd cms && node --env-file=.env --import=tsx/esm src/scripts/crawlSources.ts --budget=100
//
// --dry-run を付けると実際のHTTP取得・diff判定・Source候補生成は行うが
// DBへの書き込みは一切行わない（Snapshot作成・SourceLedger更新・Source作成いずれも無し）。
// --budget=N は1巡回あたりのStage 2（個別ページ実取得）予算の既定値（20）を
// 上書きする（2026-08-17、Source Coverage拡張の検証用。日次cron
// ——sourceLedgerCrawlTask.ts——はこのCLIを経由しないため既定値のまま変わらない）。

function parseBudgetArg(): number | undefined {
  const arg = process.argv.find((a) => a.startsWith('--budget='))
  if (!arg) return undefined
  const n = Number(arg.split('=')[1])
  return Number.isFinite(n) && n > 0 ? n : undefined
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const articleStage2Budget = parseBudgetArg()

  const payload = await getPayload({ config })
  const crawl = await runSourceLedgerCrawl(payload, { persist: !dryRun, articleStage2Budget })
  const candidates = await generateSourceCandidatesFromSnapshots(payload, { persist: !dryRun })
  // --dry-run時もDB全体の現状サマリー自体は読み取り専用のため取得できる
  // （実行前後で値は変わらない＝クロール自体が書き込みを行っていない証拠にもなる）。
  const articlesSummary = await getDiscoveredContentSummary(payload)

  console.log(JSON.stringify({ crawl, candidates, articlesSummary }))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
