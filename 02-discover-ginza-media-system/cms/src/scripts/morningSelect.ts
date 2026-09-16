// GINZA WHISKERS / Project 02（2026-09-16続き5、マロン指示：V1 5段階責任分離）
// — Stage 4「マロンによる3本選定」の記録スクリプト。
//
//   ./p2 morning select <date> <dc1> [dc2] [dc3] [--by=<名前>] [--force]
//
// 【安全】DB 書き込みなし・Claude API 呼び出しなし・追加課金なし。読むのは当日
// 保存済みの .devlogs/morning/<date>/report.json（Stage 3 の候補ボード）のみで、
// DiscoveredContent 等のDBへの再クエリ・再取得は行わない。書くのは
// .devlogs/morning/<date>/selection.json（Stage 4 の選定記録）のみ——
// CandidateAssessment・DiscoveredContent・A/B/C・カテゴリーは一切変更しない。
//
// 3本・SWEETS1本の条件を満たさない選定でも記録自体は保存する（警告を出すのみ・
// 自動代替はしない。selectionRecord.buildSelectionRecord 参照）。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildSelectionRecord } from '../lib/morning/selectionRecord'
import type { CandidateBoard } from '../lib/morning/candidateBoard'

function fail(msg: string): never {
  console.error(`エラー: ${msg}`)
  process.exit(1)
}

function main(): void {
  const args = process.argv.slice(2)
  const date = args[0]
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    fail('第1引数に対象日（YYYY-MM-DD）を指定してください。例: ./p2 morning select 2026-09-16 441 779 512')
  }
  const force = args.includes('--force')
  const byFlag = args.find((a) => a.startsWith('--by='))
  const selectedBy = byFlag ? byFlag.split('=')[1] : undefined

  const dcIdArgs = args.slice(1).filter((a) => !a.startsWith('--'))
  const discoveredContentIds = dcIdArgs.map(Number)
  if (discoveredContentIds.length === 0 || discoveredContentIds.some((n) => !Number.isInteger(n) || n <= 0)) {
    fail('DC番号を1つ以上、正の整数で指定してください。例: ./p2 morning select 2026-09-16 441 779 512')
  }

  const dayRoot = resolve(process.cwd(), '..', '.devlogs', 'morning', date)
  const reportPath = resolve(dayRoot, 'report.json')
  if (!existsSync(reportPath)) {
    fail(
      `本日のレポートが見つかりません: ${reportPath}\n` +
        '先に ./p2 morning を実行し、Stage 3 の候補ボードを保存してください（推測でボードを作り直しません）。',
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(reportPath, 'utf8'))
  } catch (err) {
    fail(`report.json の読み取りに失敗しました: ${err instanceof Error ? err.message : String(err)}`)
  }
  const obj = parsed as { report?: { candidateBoard?: CandidateBoard } }
  const board = obj.report?.candidateBoard
  if (!board) {
    fail(
      'report.json に candidateBoard がありません（続き5より前の旧形式の可能性）。' +
        '推測で補完せず停止します。./p2 morning を再実行してから再度お試しください。',
    )
  }

  const selectionPath = resolve(dayRoot, 'selection.json')
  if (existsSync(selectionPath) && !force) {
    fail(`既に本日の選定記録が存在します: ${selectionPath}\n上書きする場合は --force を指定してください。`)
  }

  const record = buildSelectionRecord({ date, selectedBy, board: board as CandidateBoard, discoveredContentIds })

  writeFileSync(selectionPath, JSON.stringify(record, null, 2))

  console.log(JSON.stringify(record))
  for (const w of record.warnings) console.error(`WARNING: ${w}`)
  process.exit(0)
}

main()
