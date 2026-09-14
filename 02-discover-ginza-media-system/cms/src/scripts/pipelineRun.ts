// GINZA WHISKERS / Project 02（2026-09-03、自動制作パイプライン）
//
// `./p2 pipeline [--yes] [--fetch] [--limit=N] [--date=YYYY-MM-DD] [--force] [--json]`
//
//   ・**既定は dry-run**（DB 書き込みなし・note-draft 未生成）。`--yes` のときだけ
//     green/yellow の Article(reviewStatus:draft) を書き、note 下書きパッケージを作る。
//   ・マロンがテーマを承認したあとに手動起動する（4:00/6:00 の収集には接続しない）。
//   ・有料 API を使わない（テンプレ経路のみ・¥0。--fetch は公式ページ取得のみ）。
//   ・auto-ready しない。ready でない ArticleFacts は pending 一覧に出す。
//   ・自動公開しない。green は「公開候補」バケットへ入るだけで、公開はマロンが手動。

import { getPayload } from 'payload'

import config from '../payload.config'
import { runThemeToNoteDraft } from '../lib/pipeline/runThemeToNoteDraft'

interface Args {
  dryRun: boolean
  fetch: boolean
  limit: number
  date?: string
  force: boolean
  json: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const yes = argv.includes('--yes')
  const dryRunFlag = argv.includes('--dry-run')
  const limitFlag = argv.find((a) => a.startsWith('--limit='))
  const limit = limitFlag ? Number(limitFlag.split('=')[1]) : 10
  if (!Number.isInteger(limit) || limit < 1) {
    console.error(`--limit は 1 以上の整数で指定してください（受け取った: "${limitFlag}"）`)
    process.exit(1)
  }
  const dateFlag = argv.find((a) => a.startsWith('--date='))
  return {
    dryRun: !yes || dryRunFlag,
    fetch: argv.includes('--fetch'),
    limit,
    date: dateFlag ? dateFlag.split('=')[1] : undefined,
    force: argv.includes('--force'),
    json: argv.includes('--json'),
  }
}

async function main(): Promise<void> {
  const args = parseArgs()
  const payload = await getPayload({ config })

  console.log('=== ./p2 pipeline（テーマ承認後 → 記事化・裏取り・監査・note下書き候補） ===')
  console.log(
    args.dryRun
      ? '（dry-run：DB 書き込みなし・note-draft 未生成。--yes で green/yellow を draft 化）'
      : '（LIVE：--yes 検出。green/yellow の Article(reviewStatus:draft) を書き、note 下書きを作ります）',
  )
  console.log('有料 API なし・auto-ready なし・自動公開なし・公開は必ずマロンが手動')
  console.log('────────────────────────────────────────────')

  const res = await runThemeToNoteDraft(payload, {
    dryRun: args.dryRun,
    fetch: args.fetch,
    limit: args.limit,
    date: args.date,
    force: args.force,
  })

  console.log(`日付          : ${res.date}`)
  console.log(`処理件数      : ${res.processed}（+ ready 待ち ${res.counts.pending} 件）`)
  console.log(
    `判定          : 🟢 ${res.counts.green}（公開候補） / 🟡 ${res.counts.yellow}（保留） / 🔴 ${res.counts.red}（停止） / 例外 ${res.counts.error}`,
  )
  console.log(`インデックス  : ${res.indexPath}`)
  console.log('  index.txt に一覧、green/ yellow/ red/ に監査カードと note 下書き。')
  console.log('────────────────────────────────────────────')
  console.log(
    JSON.stringify({
      mode: args.dryRun ? 'dry-run' : 'live',
      date: res.date,
      counts: res.counts,
      items: res.items,
      pending: res.pending,
      indexPath: res.indexPath,
    }),
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
  process.exit(1)
})
