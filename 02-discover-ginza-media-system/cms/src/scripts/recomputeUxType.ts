import { getPayload } from 'payload'

import { recomputeUxType } from '../lib/curation/recomputeUxType'
import config from '../payload.config'

// `./p2 recompute-ux-type [--dry-run]` から呼び出すCLIエントリ（2026-08-18）。
// 既存DiscoveredContentへ参加／体験型UXタイプを遡及的に反映する。新規のAI
// 呼び出しは一切行わない（既存のtitle/excerpt/contentType/
// contentRichnessTierだけを使う決定的な再計算、課金なし）。
//
// 実行例:
//   node --env-file=.env --import=tsx/esm src/scripts/recomputeUxType.ts
//   node --env-file=.env --import=tsx/esm src/scripts/recomputeUxType.ts --dry-run

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const payload = await getPayload({ config })
  const result = await recomputeUxType(payload, { persist: !dryRun })

  console.log(JSON.stringify(result))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
