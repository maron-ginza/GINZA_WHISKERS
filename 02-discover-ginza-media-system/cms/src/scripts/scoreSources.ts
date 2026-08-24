import { getPayload } from 'payload'

import { heuristicScore } from '../lib/curation/heuristicScore'
import { scoreInboxSources } from '../lib/curation/scoreInboxSources'
import config from '../payload.config'

// `./p2 score [--heuristic] [--force] [--limit N]` から呼び出すCLIエントリ。
// Inbox候補（editorial.editorialStatus === 'inbox'）にEditorial Score・
// Audience Tagsを付与する（2026-08-17、「旬の銀座」編集判断レイヤー）。
//
// --heuristic を付けると、ANTHROPIC_API_KEYを使わずローカル検証用の
// ヒューリスティック仮採点（heuristicScore.ts）で採点する。付けない場合は
// 実際のAnthropic API（scoreSource.ts）を呼ぶ——鍵が無効な場合はエラーに
// なる（CLAUDE.md記録の既知の状態。呼び出し元の`./p2 score`は鍵の形式を
// 事前チェックし、無効そうな場合は自動で--heuristicへフォールバックする）。
// --force を付けると採点済みのSourceも再採点する。
//
// 実行例:
//   node --env-file=.env --import=tsx/esm src/scripts/scoreSources.ts --heuristic
//   node --env-file=.env --import=tsx/esm src/scripts/scoreSources.ts --limit 10

async function main() {
  const args = process.argv.slice(2)
  const heuristic = args.includes('--heuristic')
  const force = args.includes('--force')
  const limitArg = args.findIndex((a) => a === '--limit')
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined

  const payload = await getPayload({ config })

  const result = await scoreInboxSources(payload, {
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
