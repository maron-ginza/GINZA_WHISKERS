import { getPayload } from 'payload'

import { recomputeContentRichness } from '../lib/curation/recomputeContentRichness'
import config from '../payload.config'

// `./p2 recompute-richness [--dry-run]` から呼び出すCLIエントリ（2026-08-18）。
// 既存の採点済みSources/DiscoveredContentへ、本文情報量ペナルティを遡及的に
// 反映する。新規のAI呼び出しは一切行わない（既存のcontentRef/excerptと
// 既存のEditorial Scoreだけを使う決定的な再計算、課金なし）。
//
// 実行例:
//   node --env-file=.env --import=tsx/esm src/scripts/recomputeContentRichness.ts
//   node --env-file=.env --import=tsx/esm src/scripts/recomputeContentRichness.ts --dry-run

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const payload = await getPayload({ config })
  const result = await recomputeContentRichness(payload, { persist: !dryRun })

  console.log(JSON.stringify(result))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
