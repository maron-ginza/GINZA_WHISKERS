import { getPayload } from 'payload'

import { refreshDiscoveredContentDates } from '../lib/curation/refreshDiscoveredContentDates'
import config from '../payload.config'

// `./p2 refresh-dates [--dry-run] [--limit=N] [--all]` から呼び出すCLI
// エントリ（2026-08-17、日付取得率改善セッション）。既定では既存
// DiscoveredContentのうち日付未取得の行だけを対象に、個別ページを安全に
// 再確認する（新規行は作成しない、discoveryStatus/lastChangedAt/
// curationStatusは変更しない）。--allを付けると全件を対象にし、新しい
// 抽出結果を（nullへの補正も含め）そのまま採用する——抽出ロジック自体を
// 修正した際、既に（誤って）値が入っている行を訂正するために使う
// （2026-08-17、Event Date Extraction誤判定修正セッションで追加）。
//
// 実行例:
//   node --env-file=.env --import=tsx/esm src/scripts/refreshDates.ts
//   node --env-file=.env --import=tsx/esm src/scripts/refreshDates.ts --dry-run
//   node --env-file=.env --import=tsx/esm src/scripts/refreshDates.ts --limit=50
//   node --env-file=.env --import=tsx/esm src/scripts/refreshDates.ts --all --limit=300

function parseLimitArg(args: string[]): number | undefined {
  const arg = args.find((a) => a.startsWith('--limit='))
  if (!arg) return undefined
  const n = Number(arg.split('=')[1])
  return Number.isFinite(n) && n > 0 ? n : undefined
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const all = args.includes('--all')
  const limit = parseLimitArg(args)

  const payload = await getPayload({ config })
  const result = await refreshDiscoveredContentDates(payload, { limit, persist: !dryRun, all })

  console.log(JSON.stringify(result))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
