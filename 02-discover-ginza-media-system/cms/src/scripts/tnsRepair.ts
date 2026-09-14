import { getPayload } from 'payload'

import config from '../payload.config'
import {
  applyRepair,
  diagnose,
  loadSnapshot,
  parseArgs,
  planRepair,
  printPlan,
  printReport,
  resolveTargets,
  summarize,
} from '../lib/tns/maintenance'

// 🌈TNS 週次エディションの自動修復（2026-08-30）。
//
//   npm run tns:repair                 # dry-run（差分を表示するだけ・DB書き込みなし）
//   npm run tns:repair -- --yes        # 実適用（更新前 JSON バックアップを _backups/ に作成）
//   npm run tns:repair -- --dry-run    # 明示 dry-run
//
// 方針:
//   - OLD_* の固定値に依存しない。常に現在DBを正として読み、あるべき不変条件
//     との差分だけを更新する（＝ #36 のように既に健全なら「差分なし」で終了）。
//   - reviewStatus != draft の場合は停止（安全条件）。
//   - 修復は機械的整形のみ:
//       本文の内部コード露出除去 / note向けハッシュタグ行追加 /
//       translationStatus.ja -> complete（本文が十分ある場合）/
//       visualStatus の実態反映（挿絵7点なら attached）
//   - 選曲差し替え・見出しムードの創作・本文プローズ書き換えは行わない
//     （自動修復できない項目は skipped として報告し、--yes でも適用しない）。

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const targets = resolveTargets(args)
  const apply = args.has('yes') && !args.has('dry-run')
  const payload = await getPayload({ config })

  const snap = await loadSnapshot(payload, targets)
  const findings = diagnose(snap)
  const sum = summarize(findings)
  printReport('TNS REPAIR · diagnose', targets, findings, sum)

  if (sum.hasBlocker) {
    console.error('\n[abort] BLOCKER があるため修復しません（現在DBを正として安全に更新できません）。')
    process.exit(2)
  }

  const plan = planRepair(snap, findings)
  printPlan(plan)

  const nothingToDo =
    plan.actions.length === 0 && !plan.nextBody && !plan.nextTranslationJa && !plan.nextVisualStatus

  if (plan.skipped.length) {
    console.log('\n[stop] 自動修復できない項目があります。人間の編集判断で対応してください（--yes でも適用しません）。')
    process.exit(3)
  }

  if (nothingToDo) {
    console.log('\n修復すべき差分はありません。現在のDBは健全です。')
    process.exit(0)
  }

  if (!apply) {
    console.log('\n[dry-run] 上記の差分は未適用です。実適用するには: npm run tns:repair -- --yes')
    console.log('（実適用時は _backups/ に更新前 JSON バックアップを作成します）')
    process.exit(0)
  }

  const { backupPath } = await applyRepair(payload, snap, plan)
  console.log(`\n[done] 修復を適用しました。バックアップ: ${backupPath}`)

  const after = await loadSnapshot(payload, targets)
  const afterFindings = diagnose(after)
  printReport('TNS REPAIR · after', targets, afterFindings, summarize(afterFindings))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
