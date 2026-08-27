import { getPayload } from 'payload'

import { computeInterestScore } from '../lib/interestDiscovery/computeInterestScore'
import config from '../payload.config'

// `./p2 interest score` のCLI実装（2026-08-27）。
// Project 02-2 Phase A統合ロジック——既存のInterestThemes（note_rising/
// note_official_topic/note_hashtag_popular）を読み取り、Interest Scoreを
// 計算して降順表示する。**読み取り専用**：DB書き込み・Claude API・外部APIの
// いずれも呼び出さない。InterestClusterの永続化・Phase B収益性評価・銀座変換・
// 記事生成のいずれも行わない（今回のスコープ外）。
async function main() {
  const payload = await getPayload({ config })
  const rows = await computeInterestScore(payload)

  // scripts/project02の既存コマンド群と同じ規約：最終出力は1行JSON。
  console.log(JSON.stringify({ rows }))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
