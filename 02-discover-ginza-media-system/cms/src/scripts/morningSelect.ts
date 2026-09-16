// GINZA WHISKERS / Project 02（2026-09-16続き5〜6、マロン指示：V1 5段階責任分離）
// — Stage 4「マロンによる3本選定」の記録スクリプト。
//
//   ./p2 morning-select <date> <dc1> <dc2> <dc3> [--by=<名前>] [--force]
//
// 【安全】DB 書き込みなし・Claude API 呼び出しなし・追加課金なし。読むのは当日
// 保存済みの .devlogs/morning/<date>/report.json（Stage 3 の候補ボード）のみで、
// DiscoveredContent 等のDBへの再クエリ・再取得は行わない。書くのは
// .devlogs/morning/<date>/selection.json（Stage 4 の選定記録）のみ——
// CandidateAssessment・DiscoveredContent・A/B/C・カテゴリーは一切変更しない。
//
// 【2026-09-16続き6改訂：厳格ゲート】3本・SWEETS1本の条件、または候補ボードに
// 存在しない（未分類・B/C・使用済み・存在しない等）DC番号の指定を1つでも満たさない
// 場合は、警告を表示して**停止し、selection.json を一切書き込まない**（自動代替も
// しない）。条件をすべて満たした場合のみ atomic write で保存する。

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { validateSelectionForCommit } from '../lib/morning/selectionRecord'
import { atomicWriteFileSync } from '../lib/util/atomicWrite'
import type { CandidateBoard } from '../lib/morning/candidateBoard'

function fail(msg: string): never {
  console.error(`エラー: ${msg}`)
  process.exit(1)
}

function main(): void {
  const args = process.argv.slice(2)
  const date = args[0]
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    fail('第1引数に対象日（YYYY-MM-DD）を指定してください。例: ./p2 morning-select 2026-09-16 441 779 512')
  }
  const force = args.includes('--force')
  const byFlag = args.find((a) => a.startsWith('--by='))
  const selectedBy = byFlag ? byFlag.split('=')[1] : undefined

  const dcIdArgs = args.slice(1).filter((a) => !a.startsWith('--'))
  const discoveredContentIds = dcIdArgs.map(Number)
  if (discoveredContentIds.length === 0 || discoveredContentIds.some((n) => !Number.isInteger(n) || n <= 0)) {
    fail('DC番号を正の整数で指定してください。例: ./p2 morning-select 2026-09-16 441 779 512')
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

  const validation = validateSelectionForCommit({
    date,
    selectedBy,
    board: board as CandidateBoard,
    discoveredContentIds,
  })

  if (!validation.ok) {
    console.error('選定を保存しませんでした（条件を満たしていません）:')
    for (const e of validation.errors) console.error(`  - ${e}`)
    console.log(JSON.stringify({ saved: false, errors: validation.errors, attempted: validation.record }))
    process.exit(1)
  }

  const selectionPath = resolve(dayRoot, 'selection.json')
  const result = atomicWriteFileSync(selectionPath, JSON.stringify(validation.record, null, 2), { force })
  if (!result.written) {
    fail(`${result.reason}\n上書きする場合は --force を指定してください。`)
  }

  console.log(JSON.stringify({ saved: true, path: selectionPath, record: validation.record }))
  process.exit(0)
}

main()
