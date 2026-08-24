import { getPayload } from 'payload'

import { getDiscoveredContentSummary } from '../lib/curation/discoveredContentSummary'
import config from '../payload.config'

// `./p2 articles` から呼び出すCLIエントリ（2026-08-17）。DiscoveredContent
// （個別記事・イベント）の現在状態サマリーを表示する、読み取り専用コマンド
// （新規のHTTP巡回・AI呼び出し・DB書き込みは一切行わない）。

async function main() {
  const payload = await getPayload({ config })
  const summary = await getDiscoveredContentSummary(payload)

  console.log(JSON.stringify(summary))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
