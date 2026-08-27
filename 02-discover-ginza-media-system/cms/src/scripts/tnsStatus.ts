import { getPayload } from 'payload'

import { getTnsStatus } from '../lib/tns/getTnsStatus'
import config from '../payload.config'

// `./p2 tns status` のCLI実装（2026-08-27）。読み取り専用。
async function main() {
  const payload = await getPayload({ config })
  const status = await getTnsStatus(payload)
  // scripts/project02の既存コマンド群と同じ規約：最終出力は1行JSON
  console.log(JSON.stringify(status))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
