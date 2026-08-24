import { getPayload } from 'payload'

import { heuristicScore } from '../lib/curation/heuristicScore'
import { scoreDiscoveredContentBatch } from '../lib/curation/scoreDiscoveredContentBatch'
import config from '../payload.config'

// `./p2 score-articles [--heuristic] [--force] [--limit N]` から呼び出すCLI
// エントリ（2026-08-17）。DiscoveredContent（個別記事・イベント）候補に
// Editorial Score・Audience Tagsを付与する。scoreSources.tsと同じ設計——
// --heuristicを付けるとANTHROPIC_API_KEYを使わずローカル検証用の
// ヒューリスティック仮採点で採点する。

async function main() {
  const args = process.argv.slice(2)
  const heuristic = args.includes('--heuristic')
  const force = args.includes('--force')
  const limitArg = args.findIndex((a) => a === '--limit')
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined

  const payload = await getPayload({ config })

  const result = await scoreDiscoveredContentBatch(payload, {
    limit,
    force,
    scoringMethod: heuristic ? 'heuristic-placeholder' : 'claude',
    score: heuristic ? heuristicScore : undefined,
  })

  console.log(JSON.stringify(result))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
