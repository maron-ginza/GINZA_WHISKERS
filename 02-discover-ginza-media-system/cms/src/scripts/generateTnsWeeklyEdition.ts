import { getPayload } from 'payload'

import { createWeeklySoundtrackEdition } from '../lib/tns/createWeeklySoundtrackEdition'
import config from '../payload.config'

// 手動テスト用CLIエントリ（2026-08-27、🌈Tokyo Nostalgic Soundtrack自動化）。
// 実行例：
//   node --env-file=.env --import=tsx/esm src/scripts/generateTnsWeeklyEdition.ts \
//     "今週の銀座は残暑の中に秋の気配が混じり始めている"
//
// 既存の`./p2 ...`ラッパーへの統合は今回未実施——単体の動作確認用スクリプト。
async function main() {
  const maronWeeklyObservation = process.argv[2]
  if (!maronWeeklyObservation) {
    console.error('Usage: generateTnsWeeklyEdition.ts "<maronWeeklyObservation>"')
    process.exit(1)
  }

  const payload = await getPayload({ config })
  const result = await createWeeklySoundtrackEdition(payload, { maronWeeklyObservation })

  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
