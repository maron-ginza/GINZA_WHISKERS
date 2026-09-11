// GINZA WHISKERS / Project 02（2026-09-11）— 収集カバレッジ診断（読み取り専用・AI/課金なし）。
//
// `./p2 sources coverage` から呼ぶ。以下を1画面にまとめる：
//   1. 登録済み情報源（SOURCE LEDGER seedData）を SOURCE LEDGER カテゴリー・tier・enabled 別に集計
//   2. 収集済み DiscoveredContent（inbox＋approved）を 18カテゴリー・施設・エリア別に集計
//   3. 収集が不足している 18カテゴリー（週次目標があるのに 0 件／目標の半分未満）と過集中の施設
//   4. 過去7日間の採用（approved）の施設・カテゴリー分布
//
// DB へは一切書き込まない。DB 未起動時は SOURCE LEDGER 側だけ表示する。

import { getPayload } from 'payload'

import config from '../payload.config'
import { SOURCE_LEDGER_SEED_DATA } from '../lib/sourceLedger/seedData'
import { SOURCE_LEDGER_CATEGORY_LABELS } from '../lib/sourceLedger/types'
import { assessInboxPool } from '../lib/pipeline/assessInboxPool'
import { deriveProvisionalCategory } from '../lib/pipeline/provisionalCategory'
import { resolveFacilityKey } from '../lib/curation/facilityKey'
import { aggregateCoverage, CATEGORY_WEEKLY_TARGET } from '../lib/pipeline/candidateCoverageScore'
import { toTokyoDateString } from '../lib/util/businessDate'

function bar(n: number, max: number, width = 24): string {
  if (max <= 0) return ''
  return '█'.repeat(Math.max(0, Math.round((n / max) * width)))
}

async function main() {
  console.log('=== ./p2 sources coverage（収集カバレッジ診断・読み取り専用・DB書き込みなし） ===')
  console.log(`対象日: ${toTokyoDateString(new Date())}（Asia/Tokyo）`)
  console.log('────────────────────────────────────────────')

  // ---------- 1. 登録済み情報源（SOURCE LEDGER seedData） ----------
  const byCat = new Map<string, { enabled: number; disabled: number }>()
  const byTier = new Map<string, number>()
  for (const s of SOURCE_LEDGER_SEED_DATA) {
    const label = SOURCE_LEDGER_CATEGORY_LABELS[s.category] ?? s.category
    const cur = byCat.get(label) ?? { enabled: 0, disabled: 0 }
    if (s.enabled) cur.enabled++
    else cur.disabled++
    byCat.set(label, cur)
    byTier.set(s.tier, (byTier.get(s.tier) ?? 0) + 1)
  }
  const enabledTotal = SOURCE_LEDGER_SEED_DATA.filter((s) => s.enabled).length
  console.log(`■ 1. 登録済み情報源（SOURCE LEDGER）: ${SOURCE_LEDGER_SEED_DATA.length} 件（enabled ${enabledTotal} / disabled ${SOURCE_LEDGER_SEED_DATA.length - enabledTotal}）`)
  for (const [label, v] of [...byCat.entries()].sort((a, b) => b[1].enabled + b[1].disabled - (a[1].enabled + a[1].disabled))) {
    console.log(`  ${label.padEnd(10, '　')} enabled ${v.enabled} ／ disabled ${v.disabled}`)
  }
  console.log(`  tier: ${[...byTier.entries()].map(([k, v]) => `${k}×${v}`).join(' / ')}`)
  console.log('  ※ SOURCE LEDGER のカテゴリーは施設種別（百貨店／商業施設／ブランド／飲食…）。記事の18カテゴリーとは別軸。')
  console.log('────────────────────────────────────────────')

  // ---------- 2〜4. 収集済み DiscoveredContent（DB） ----------
  let payload
  try {
    payload = await getPayload({ config })
  } catch (e) {
    console.log('■ 2. 収集済み候補の集計: DB へ接続できませんでした（./p2 start でローカル DB を起動してから再実行してください）')
    console.log(`   ${e instanceof Error ? e.message : String(e)}`)
    process.exit(0)
  }

  const assessed = await assessInboxPool(payload, { statuses: ['inbox', 'approved'], limit: 1000 })
  const rows = assessed.candidates.map((c) => {
    const cat = deriveProvisionalCategory({
      primaryCategory: c.primaryCategory ?? null,
      title: c.title ?? '',
      venue: c.venue ?? '',
      templateType: c.templateType ?? null,
      contentType: c.contentType ?? undefined,
      excerpt: c.excerpt ?? undefined,
    }).category
    const fk = resolveFacilityKey({ venue: c.venue, sourceName: c.sourceName, sourceUrl: c.sourceUrl, title: c.title })
    return {
      category: cat,
      facilityKey: fk.key,
      facilityLabel: fk.store || c.venue || null,
      areaKey: fk.areaKey || fk.key,
      sourceName: c.sourceName,
    }
  })
  const agg = aggregateCoverage(rows)
  const officialOk = assessed.candidates.filter((c) => c.finalEligible === true).length
  const maxCat = Math.max(1, ...Object.values(agg.byCategory))

  console.log(`■ 2. 収集済み候補（inbox＋approved）: ${agg.total} 件`)
  console.log('  18カテゴリー別（週次目標との比較。█ は相対量）:')
  for (const cat of Object.keys(CATEGORY_WEEKLY_TARGET)) {
    const n = agg.byCategory[cat] ?? 0
    const t = CATEGORY_WEEKLY_TARGET[cat]
    const mark = t > 0 && n === 0 ? ' ← 収集0件（不足）' : t > 0 && n < t / 2 ? ' ← 目標の半分未満（薄い）' : ''
    console.log(`    ${cat.padEnd(13)} ${String(n).padStart(3)}  週次目標 ${t}  ${bar(n, maxCat)}${mark}`)
  }
  console.log('')
  console.log('  施設別 上位15:')
  for (const [k, v] of Object.entries(agg.byFacility).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`    ${String(v).padStart(3)}  ${k}  ${bar(v, agg.total, 30)}`)
  }
  console.log('────────────────────────────────────────────')

  console.log('■ 3. 不足カテゴリー・過集中施設')
  console.log(`  収集0件のカテゴリー（週次目標あり）: ${agg.missingCategories.join('・') || 'なし'}`)
  console.log(`  目標の半分未満のカテゴリー: ${agg.thinCategories.map((t) => `${t.category}(${t.count}/${t.target})`).join('・') || 'なし'}`)
  console.log(`  過集中の施設（収集全体の3割以上）: ${agg.overweightFacilities.map((f) => `${f.facility}(${f.count}件/${Math.round(f.ratio * 100)}%)`).join('・') || 'なし'}`)
  console.log(`  公式情報が4項目そろう候補（公式URL・期間・場所・内容）: ${officialOk} / ${agg.total} 件`)
  console.log('────────────────────────────────────────────')

  console.log(`■ 4. 過去7日間の採用（approved）: ${assessed.history.approvedCount} 件`)
  console.log(`  カテゴリー: ${Object.entries(assessed.history.categoryCounts).map(([k, v]) => `${k}×${v}`).join(' / ') || 'なし'}`)
  console.log(`  施設: ${Object.entries(assessed.history.facilityCounts).map(([k, v]) => `${k}×${v}`).join(' / ') || 'なし'}`)
  console.log('────────────────────────────────────────────')
  console.log('この画面は読み取り専用です。DB・情報源台帳・記事は一切変更していません。')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
