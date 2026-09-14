import { getPayload } from 'payload'

import config from '../payload.config'
import {
  applyRepair,
  diagnose,
  loadSnapshot,
  parseArgs,
  planRepair,
  printChecks,
  printPlan,
  printReport,
  readiness,
  resolveTargets,
  summarize,
} from '../lib/tns/maintenance'

// 🌈TNS 週次エディションの統合フロー（2026-08-30）:
//   doctor -> repair(dry-run) -> repair(apply) -> verify
//
//   npm run tns:prepare                # doctor + repair 差分表示まで（apply しない）
//   npm run tns:prepare -- --yes       # 安全な差分のみ apply し、verify まで実行
//   npm run tns:prepare -- --dry-run   # apply を明示的に抑止
//
// 安全ガード:
//   - BLOCKER があれば即中断（repair も apply もしない）。
//   - 「危険な変更」（＝自動修復できず人間判断が必要な skipped 項目）があれば
//     apply しない。
//   - reviewStatus != draft は BLOCKER 扱いで中断。
//   - apply 前に _backups/ へ更新前 JSON バックアップを作成。

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const targets = resolveTargets(args)
  const doApply = args.has('yes') && !args.has('dry-run')
  const payload = await getPayload({ config })

  // ── STEP 1/4 · DOCTOR ─────────────────────────────────────
  const snap0 = await loadSnapshot(payload, targets)
  const f0 = diagnose(snap0)
  const s0 = summarize(f0)
  printReport('STEP 1/4 · DOCTOR', targets, f0, s0)

  if (s0.hasBlocker) {
    console.error('\n[中断] BLOCKER があります。repair / apply は行いません。')
    process.exit(2)
  }

  // ── STEP 2/4 · REPAIR (dry-run / plan) ────────────────────
  const plan = planRepair(snap0, f0)
  console.log('\n=== STEP 2/4 · REPAIR (dry-run) ===')
  printPlan(plan)

  if (plan.skipped.length) {
    console.error('\n[中断] 危険な変更（自動修復できず人間判断が必要な項目）があるため apply しません:')
    for (const s of plan.skipped) console.error(`  ! [${s.code}] ${s.reason}`)
    process.exit(3)
  }

  const nothingToDo =
    plan.actions.length === 0 && !plan.nextBody && !plan.nextTranslationJa && !plan.nextVisualStatus

  // ── STEP 3/4 · APPLY ─────────────────────────────────────
  console.log('\n=== STEP 3/4 · APPLY ===')
  if (nothingToDo) {
    console.log('  差分なし（現在のDBは健全）。apply をスキップします。')
  } else if (!doApply) {
    console.log('  --yes 未指定のため未適用。実適用するには: npm run tns:prepare -- --yes')
    console.log('  （安全な差分のみ apply し、_backups/ に更新前バックアップを作成します）')
    process.exit(0)
  } else {
    const { backupPath } = await applyRepair(payload, snap0, plan)
    console.log(`  適用完了。バックアップ: ${backupPath}`)
  }

  // ── STEP 4/4 · VERIFY ────────────────────────────────────
  const snap1 = await loadSnapshot(payload, targets)
  const f1 = diagnose(snap1)
  const s1 = summarize(f1)
  printReport('STEP 4/4 · VERIFY', targets, f1, s1)

  const { ready, checks } = readiness(snap1, f1)
  printChecks(checks)

  if (ready) {
    console.log(`\n✅ READY FOR NOTE — #${targets.editionNumber} は note 転記可能な状態です。`)
    process.exit(0)
  }
  console.log('\n⛔ NOT READY — 未達項目を解消してください。')
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
