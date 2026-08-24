import { SOURCE_LEDGER_SEED_DATA } from '../lib/sourceLedger/seedData'
import {
  SOURCE_LEDGER_CATEGORY_LABELS,
  SOURCE_LEDGER_TIER_LABELS,
  type SourceLedgerCategory,
  type SourceLedgerTier,
} from '../lib/sourceLedger/types'

// `./p2 sources` から呼ぶ読み取り専用の確認スクリプト。
//
// seedData.ts（git管理の正本）を直接読み込むだけで、Payload/DB/Dockerに一切依存しない
// ——本番相当のDB（source-ledgerコレクション）へ投入済みの運用状態（enabled切替・
// 巡回結果）を見たい場合はPayload管理画面を使うこと（v1時点ではDB版ステータス表示は
// 未実装、CLAUDE.md未決事項）。
//
// 実行例: cd cms && node --import=tsx/esm src/scripts/sourceLedgerStatus.ts

function main() {
  const entries = SOURCE_LEDGER_SEED_DATA

  const byTier = new Map<SourceLedgerTier, number>()
  const byCategory = new Map<SourceLedgerCategory, number>()
  let enabledCount = 0

  for (const entry of entries) {
    byTier.set(entry.tier, (byTier.get(entry.tier) ?? 0) + 1)
    byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + 1)
    if (entry.enabled) enabledCount += 1
  }

  console.log('=== SOURCE LEDGER v1（cms/src/lib/sourceLedger/seedData.ts） ===')
  console.log(`総件数: ${entries.length}`)
  console.log(`enabled: ${enabledCount} / disabled(TODO含む): ${entries.length - enabledCount}`)

  console.log()
  console.log('--- tier別 ---')
  for (const [tier, count] of byTier) {
    console.log(`  ${SOURCE_LEDGER_TIER_LABELS[tier]}: ${count}`)
  }

  console.log()
  console.log('--- category別 ---')
  for (const [category, count] of byCategory) {
    console.log(`  ${SOURCE_LEDGER_CATEGORY_LABELS[category]}: ${count}`)
  }

  const coreSources = entries.filter((entry) => entry.tier === 'core')
  console.log()
  console.log(`--- Core Source一覧: ${coreSources.length}件 ---`)
  for (const entry of coreSources) {
    const status = entry.enabled ? 'enabled ' : 'DISABLED'
    console.log(`  [${status}] ${entry.name} — ${entry.url ?? '(url未確定・TODO)'}`)
  }

  const todos = entries.filter((entry) => !entry.enabled)
  console.log()
  if (todos.length > 0) {
    console.log(`--- TODO（url未確定/disabled）: ${todos.length}件 ---`)
    for (const entry of todos) {
      console.log(`  ${entry.name}: ${entry.notes}`)
    }
  } else {
    console.log('TODO（url未確定/disabled）: なし')
  }
}

main()
