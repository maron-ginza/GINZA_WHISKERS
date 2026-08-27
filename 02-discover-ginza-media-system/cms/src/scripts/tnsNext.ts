import { getPayload } from 'payload'

import { createWeeklySoundtrackEdition } from '../lib/tns/createWeeklySoundtrackEdition'
import { findExistingEditionForWeek } from '../lib/tns/findExistingEditionForWeek'
import { testWeeklySoundtrackSelection } from '../lib/tns/testWeeklySoundtrackSelection'
import { computeNextTnsWeek, formatDateISO } from '../lib/tns/weekDates'
import config from '../payload.config'

// `./p2 tns next [--dry-run] ["観察テキスト"]` のCLI実装（2026-08-27）。
//
// マロンが毎週長い指示を書かなくても1コマンドで進められるようにするため、
// maronWeeklyObservation（TNS_SPEC.md §6.2「週次唯一の必須手入力」）を
// 省略可能にし、省略時は既定の汎用テキストを使う。実際の観察を渡したい
// 場合は引数として渡せる（従来どおりの精度を維持したい場合向け）。
//
// --dry-run は既存のtestWeeklySoundtrackSelection.ts（Project 02-1の
// 「選曲テスト」実装セッションで新設、DB書き込み一切なし）をそのまま
// 再利用する——新しい別システムは作らない。実行フローの重複判定・天気・
// 選曲・記事生成ロジックは、通常実行（createWeeklySoundtrackEdition.ts）
// と完全に同じコードパスを通る。
const DEFAULT_OBSERVATION =
  '（自動生成・既定値）今週の銀座を、天気とその週らしい生活のリズムから汲み取る'

function parseForWeekFlag(args: string[]): Date | undefined {
  // テスト・バックフィル用の非公開オプション（マロンの通常運用では使わない
  // 想定）。「翌週」判定の基準日を上書きする——computeNextTnsWeek()と同じ
  // 意味（この日付が属する週の次の月曜〜日曜が対象週になる）。
  const flag = args.find((a) => a.startsWith('--for-week-after='))
  if (!flag) return undefined
  const value = flag.split('=')[1]
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`--for-week-after の日付を解釈できません: "${value}"（YYYY-MM-DD形式で指定してください）`)
  }
  return date
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const baseDate = parseForWeekFlag(args)
  const observationArg = args.find((a) => !a.startsWith('--'))
  const maronWeeklyObservation = observationArg || DEFAULT_OBSERVATION

  if (!observationArg) {
    console.error(
      `[tnsNext] maronWeeklyObservationが指定されなかったため既定値を使用します: "${DEFAULT_OBSERVATION}"`,
    )
  }

  const payload = await getPayload({ config })

  if (dryRun) {
    // dry-runは重複週があってもブロックしない（確認用のため）が、注意喚起は表示する。
    const week = computeNextTnsWeek(baseDate)
    const existing = await findExistingEditionForWeek(payload, formatDateISO(week.weekStart))
    if (existing) {
      console.error(
        `[tnsNext] 注意：対象週${formatDateISO(week.weekStart)}は既に#${existing.editionNumber}として` +
          '生成済みです（dry-runのため続行、DB保存は行いません）。',
      )
    }

    const result = await testWeeklySoundtrackSelection(payload, { maronWeeklyObservation, baseDate, callAi: true })
    // scripts/project02の既存コマンド群と同じ規約：最終出力は1行JSON
    // （spinner/警告ログ等の他出力と混ざっても`grep '^{' | tail -1`で確実に分離できるようにする）。
    console.log(JSON.stringify({ mode: 'dry-run', ...result }))
    process.exit(0)
  }

  const result = await createWeeklySoundtrackEdition(payload, { maronWeeklyObservation, baseDate })
  console.log(JSON.stringify({ mode: 'live', ...result }))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
