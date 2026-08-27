import { getPayload } from 'payload'

import { createMultiAngleDraftsFromDiscoveredContent } from '../lib/ai/createMultiAngleDraftsFromDiscoveredContent'
import config from '../payload.config'

// 手動テスト用CLIエントリ（2026-08-27、Project 02-1「核情報→最大5記事」拡張）。
// 実行例：
//   node --env-file=.env --import=tsx/esm src/scripts/generateMultiAngleDraft.ts <discoveredContentId>
//
// 既存の`./p2 ...`ラッパー（scripts/project02）への統合は今回未実施——
// Project 02-1単体の動作確認用スクリプトとして独立させている。
async function main() {
  const discoveredContentId = process.argv[2]
  if (!discoveredContentId) {
    console.error('Usage: generateMultiAngleDraft.ts <discoveredContentId>')
    process.exit(1)
  }

  const payload = await getPayload({ config })
  const result = await createMultiAngleDraftsFromDiscoveredContent(payload, discoveredContentId)

  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
