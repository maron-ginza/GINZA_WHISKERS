import { getPayload } from 'payload'

import { runDailyDraftsFromApproved } from '../lib/ai/createDailyDraftsFromApproved'
import config from '../payload.config'

// `./p2 draft-today [--dry-run] [--limit=N] [--since=YYYY-MM-DD]` のCLI実装
// （2026-08-28、Project 02-1「旬の銀座 最大5本/日」日次オーケストレーション）。
//
// 当日 Maron Editor's Choice で承認された DiscoveredContent から、類似テーマを
// 束ねたうえで上位トピックを1本ずつ記事ドラフト（reviewStatus: draft）にする。
// --dry-run は選定計画のみ（AI呼び出し・DB書き込みなし）。live 実行は選ばれた
// トピック数だけ Claude API を呼ぶため、ラッパー（scripts/project02）側で
// --yes を必須にしている。

function parseSince(args: string[]): Date | undefined {
  const flag = args.find((a) => a.startsWith('--since='))
  if (!flag) return undefined
  const value = flag.split('=')[1]
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`--since の日付を解釈できません: "${value}"（YYYY-MM-DD形式で指定してください）`)
  }
  return date
}

function parseLimit(args: string[]): number | undefined {
  const flag = args.find((a) => a.startsWith('--limit='))
  if (!flag) return undefined
  const n = Number(flag.split('=')[1])
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`--limit は 1 以上の整数で指定してください（受け取った値: "${flag.split('=')[1]}"）`)
  }
  return n
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const since = parseSince(args)
  const maxDrafts = parseLimit(args)

  const payload = await getPayload({ config })

  const result = await runDailyDraftsFromApproved(payload, { dryRun, since, maxDrafts })

  // scripts/project02の既存コマンド群と同じ規約：最終出力は1行JSON
  // （警告ログ等と混ざっても `grep '^{' | tail -1` で分離できるようにする）。
  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'live', ...result }))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
