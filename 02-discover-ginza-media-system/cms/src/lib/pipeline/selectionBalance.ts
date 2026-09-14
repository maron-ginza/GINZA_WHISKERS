// GINZA WHISKERS / Project 02（2026-09-04、候補選定の自動化）
//
// selectRecommendedThemes の結果（推奨10＋予備5）から、
//   ・18カテゴリー分散
//   ・旬（temporalRelevance tier）分散
//   ・会場／エリア分散
//   ・記事種別（templateType）分散
// のバランス表を作る純粋関数と、整形テキスト。判定はしない（数えて表示するだけ）。

import type { EvaluatedCandidate, SelectThemesResult } from './selectRecommendedThemes'
import { TEMPORAL_RELEVANCE_TIERS, type TemporalRelevanceTier } from '../curation/temporalRelevance'

// 18カテゴリー（VISUAL_ASSET_LIBRARY §3.3 / ArticleFacts.primaryCategory）
export const PRIMARY_CATEGORIES_18 = [
  'FOOD',
  'CAFE',
  'SHOPPING',
  'ARCHITECTURE',
  'ART',
  'EVENT',
  'NIGHT',
  'MUSIC',
  'BEAUTY',
  'HOTEL',
  'WELLNESS',
  'EXPERIENCE',
  'GIFT',
  'WORKSHOP',
  'PHOTO',
  'FAMILY',
  'NIGHT_VIEW',
  'RAINY_DAY',
] as const

export interface CountRow {
  key: string
  label: string
  recommended: number
  spare: number
}

export interface SelectionBalance {
  scope: { recommended: number; spare: number }
  categories: CountRow[]
  /** 暫定カテゴリーを明記から確定できた推奨件数／割合 */
  categoryResolved: { count: number; ratio: number }
  missingCategories: string[]
  overRepresentedCategories: string[]
  temporal: CountRow[]
  facilities: CountRow[]
  sources: CountRow[]
  templateTypes: CountRow[]
  /** 同一施設2件の理由（推奨内） */
  sameFacilityExceptions: { discoveredContentId: number; facility: string; reason: string }[]
  biasFlags: string[]
}

function tally(list: EvaluatedCandidate[], keyOf: (e: EvaluatedCandidate) => string): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of list) {
    const k = keyOf(e) || '(不明)'
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

export function buildSelectionBalance(res: SelectThemesResult): SelectionBalance {
  const rec = res.recommended
  const sp = res.spare
  const recCat = tally(rec, (e) => e.categoryKey)
  const spCat = tally(sp, (e) => e.categoryKey)

  const catRows: CountRow[] = PRIMARY_CATEGORIES_18.map((c) => ({
    key: c,
    label: c,
    recommended: recCat.get(c) ?? 0,
    spare: spCat.get(c) ?? 0,
  }))
  // 未確定（primaryCategory 未設定）は 18 の外に別行で
  const undRec = recCat.get('未確定') ?? 0
  const undSp = spCat.get('未確定') ?? 0
  if (undRec || undSp) catRows.push({ key: '未確定', label: '未確定（ready 化時に確定）', recommended: undRec, spare: undSp })

  const missingCategories = PRIMARY_CATEGORIES_18.filter((c) => (recCat.get(c) ?? 0) === 0)
  const overRepresentedCategories = catRows.filter((r) => r.key !== '未確定' && r.recommended >= 3).map((r) => r.key)
  const categoryResolved = {
    count: res.provisionalCategories.resolvedCount,
    ratio: res.provisionalCategories.resolvedRatio,
  }

  const recTmp = tally(rec, (e) => e.temporalTier)
  const spTmp = tally(sp, (e) => e.temporalTier)
  const temporal: CountRow[] = (TEMPORAL_RELEVANCE_TIERS as readonly TemporalRelevanceTier[])
    .filter((t) => (recTmp.get(t) ?? 0) + (spTmp.get(t) ?? 0) > 0)
    .map((t) => ({ key: t, label: t.toUpperCase(), recommended: recTmp.get(t) ?? 0, spare: spTmp.get(t) ?? 0 }))

  const recFac = tally(rec, (e) => e.facilityLabel || e.facilityBucket)
  const spFac = tally(sp, (e) => e.facilityLabel || e.facilityBucket)
  const facilities: CountRow[] = [...new Set([...recFac.keys(), ...spFac.keys()])]
    .map((k) => ({ key: k, label: k, recommended: recFac.get(k) ?? 0, spare: spFac.get(k) ?? 0 }))
    .sort((a, b) => b.recommended - a.recommended || b.spare - a.spare || a.label.localeCompare(b.label))

  const recSrc = tally(rec, (e) => e.sourceName)
  const spSrc = tally(sp, (e) => e.sourceName)
  const sources: CountRow[] = [...new Set([...recSrc.keys(), ...spSrc.keys()])]
    .map((k) => ({ key: k, label: k, recommended: recSrc.get(k) ?? 0, spare: spSrc.get(k) ?? 0 }))
    .sort((a, b) => b.recommended - a.recommended || b.spare - a.spare || a.label.localeCompare(b.label))

  const recTt = tally(rec, (e) => e.templateTypeKey)
  const spTt = tally(sp, (e) => e.templateTypeKey)
  const templateTypes: CountRow[] = [...new Set([...recTt.keys(), ...spTt.keys()])]
    .map((k) => ({ key: k, label: k, recommended: recTt.get(k) ?? 0, spare: spTt.get(k) ?? 0 }))
    .sort((a, b) => b.recommended - a.recommended || a.label.localeCompare(b.label))

  const sameFacilityExceptions = rec
    .filter((e) => e.sameFacilityException)
    .map((e) => ({
      discoveredContentId: e.candidate.discoveredContentId,
      facility: e.facilityLabel,
      reason: e.sameFacilityException as string,
    }))

  return {
    scope: { recommended: rec.length, spare: sp.length },
    categories: catRows,
    categoryResolved,
    missingCategories,
    overRepresentedCategories,
    temporal,
    facilities,
    sources,
    templateTypes,
    sameFacilityExceptions,
    biasFlags: res.bias.flags,
  }
}

// ---------------------------------------------------------------------------
function line(s = ''): string {
  return s + '\n'
}
function bar(n: number): string {
  return '■'.repeat(Math.min(n, 10))
}

export function renderSelectionBalanceText(b: SelectionBalance): string {
  let s = ''
  s += line('──────── バランス表（推奨10 / 予備5）────────')
  s += line(`  対象: 推奨 ${b.scope.recommended} 件 / 予備 ${b.scope.spare} 件`)
  s += line('')
  s += line('  ■ 18カテゴリー分散（暫定・明記から。推奨｜予備）')
  for (const r of b.categories) {
    if (r.recommended === 0 && r.spare === 0) continue
    s += line(`    ${r.label.padEnd(12)} ${String(r.recommended).padStart(2)} ${bar(r.recommended)}  ｜ 予備 ${r.spare}`)
  }
  s += line(`    明記からカテゴリー確定: 推奨 ${b.categoryResolved.count} 件（${Math.round(b.categoryResolved.ratio * 100)}%）`)
  s += line(`    未使用カテゴリー: ${b.missingCategories.join(', ') || 'なし'}`)
  if (b.overRepresentedCategories.length) s += line(`    偏り（推奨で3件以上）: ${b.overRepresentedCategories.join(', ')}`)
  s += line('')
  s += line('  ■ 旬（temporalRelevance）分散')
  for (const r of b.temporal) s += line(`    ${r.label.padEnd(8)} 推奨 ${r.recommended} / 予備 ${r.spare}`)
  s += line('')
  s += line('  ■ 会場／施設分散')
  for (const r of b.facilities) s += line(`    ${r.label.padEnd(24)} 推奨 ${r.recommended} / 予備 ${r.spare}`)
  s += line('')
  s += line('  ■ 情報源分散')
  for (const r of b.sources) s += line(`    ${r.label.padEnd(20)} 推奨 ${r.recommended}（${b.scope.recommended ? Math.round((r.recommended / b.scope.recommended) * 100) : 0}%）/ 予備 ${r.spare}`)
  s += line('')
  s += line('  ■ 記事種別分散')
  for (const r of b.templateTypes) s += line(`    ${r.label.padEnd(16)} 推奨 ${r.recommended} / 予備 ${r.spare}`)
  s += line('')
  if (b.sameFacilityExceptions.length) {
    s += line('  ■ 同一施設2件の採用理由')
    for (const e of b.sameFacilityExceptions) s += line(`    DC #${e.discoveredContentId}（${e.facility}）: ${e.reason}`)
    s += line('')
  }
  s += line('  ■ 偏り検出')
  if (b.biasFlags.length === 0) s += line('    フラグなし')
  for (const f of b.biasFlags) s += line(`    ⚠ ${f}`)
  return s
}
