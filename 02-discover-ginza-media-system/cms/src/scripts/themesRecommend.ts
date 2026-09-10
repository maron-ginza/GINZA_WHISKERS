// GINZA WHISKERS / Project 02（2026-09-04、候補選定の自動化 — 上流接続修正）
//
// `./p2 themes recommend [--limit=N] [--include-approved] [--from-report[=date]] [--fixture=path] [--json]`
//
//   ・**候補選定は承諾前**。既定の入力は curationStatus=**inbox** の DiscoveredContent
//     （assessInboxPool による read-only 評価。DB 書き込み・fetch・AI・課金なし）。
//   ・安全性 **必須 gate**（C/終了/重複/出典なし/銀座関連なし/種別不明は必ず落とす。
//     gate を緩めて件数を水増ししない）→ 5比率ランキング → **推奨10＋予備5（合計15固定）**。
//   ・偏り（例：蔦屋書店100%）や不足があるときは finalized=false ＝ 追加収集してから再選定。
//   ・出力の admin URL は「候補確認・一括承諾」画面（inbox のまま選んで curationStatus=approved へ）。
//   ・`--from-report[=date]` は旧挙動（morning の approved-only report.json を読む・デバッグ用）。
//   ・`--fixture` は ThemeCandidate[] JSON を直接読む（テスト用・DB 非接続）。

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getPayload } from 'payload'

import config from '../payload.config'
import {
  selectRecommendedThemes,
  loadSelectThemesConfigFromEnv,
  safetyGateEvidence,
  SAFETY_GATE_CHECKS,
  type ThemeCandidate,
} from '../lib/pipeline/selectRecommendedThemes'
import { buildSelectionBalance, renderSelectionBalanceText } from '../lib/pipeline/selectionBalance'
import { assessInboxPool, type AssessInboxPoolResult } from '../lib/pipeline/assessInboxPool'
import { buildAdminCandidateReviewUrl } from '../lib/pipeline/adminCandidateUrl'
import { crossCultureSummaryLine } from '../lib/crossCulture'
import {
  assessCoreDailyFulfillment,
  detectConsecutiveFacilityWarnings,
  seasonalSignal,
  paidLanePotential,
  CORE_DAILY_BUCKETS,
} from '../lib/pipeline/dailySelectionSupport'

const EMPTY_HISTORY: AssessInboxPoolResult['history'] = {
  windowDays: 7,
  since: '',
  approvedCount: 0,
  categoryCounts: {},
  facilityCounts: {},
  recentFacilitySequence: [],
}

interface Args {
  date: string
  limit: number
  includeApproved: boolean
  fromReport?: string
  fixture?: string
  json: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const dateFlag = argv.find((a) => a.startsWith('--date='))
  const fx = argv.find((a) => a.startsWith('--fixture='))
  const fr = argv.find((a) => a === '--from-report' || a.startsWith('--from-report='))
  const lim = argv.find((a) => a.startsWith('--limit='))
  return {
    date: dateFlag ? dateFlag.split('=')[1] : new Date().toISOString().slice(0, 10),
    limit: lim ? Math.max(1, Number(lim.split('=')[1]) || 200) : 200,
    includeApproved: argv.includes('--include-approved'),
    fromReport: fr ? (fr.includes('=') ? fr.split('=')[1] : 'today') : undefined,
    fixture: fx ? fx.split('=')[1] : undefined,
    json: argv.includes('--json'),
  }
}

// --- 旧挙動：morning の approved-only report.json を読む（デバッグ用） ---
async function loadFromMorningReport(payload: Awaited<ReturnType<typeof getPayload>>, date: string): Promise<ThemeCandidate[]> {
  const reportPath = resolve(process.cwd(), '..', '.devlogs', 'morning', date, 'report.json')
  if (!existsSync(reportPath)) throw new Error(`morning レポートが見つかりません: ${reportPath}`)
  const j = JSON.parse(readFileSync(reportPath, 'utf8')) as {
    report?: { topA?: Record<string, unknown>[]; b?: Record<string, unknown>[] }
  }
  const pool = [...(j.report?.topA ?? []), ...(j.report?.b ?? [])] as Record<string, unknown>[]
  const ids = pool.map((a) => Number(a.discoveredContentId))
  const dcRes = await payload.find({ collection: 'discovered-content', where: { id: { in: ids } }, limit: 500, depth: 0, overrideAccess: true })
  const dcById = new Map<number, Record<string, unknown>>()
  for (const d of dcRes.docs as unknown as Record<string, unknown>[]) dcById.set(Number(d.id), d)
  const afRes = await payload.find({ collection: 'article-facts', where: { discoveredContent: { in: ids } }, limit: 500, depth: 0, overrideAccess: true })
  const afByDc = new Map<number, Record<string, unknown>>()
  for (const f of afRes.docs as unknown as Record<string, unknown>[]) {
    const ref = f.discoveredContent
    const dcId = typeof ref === 'object' && ref !== null ? Number((ref as { id?: number }).id) : Number(ref)
    if (Number.isFinite(dcId)) afByDc.set(dcId, f)
  }
  return pool.map((a) => {
    const dc = dcById.get(Number(a.discoveredContentId)) ?? {}
    const af = afByDc.get(Number(a.discoveredContentId))
    const pc = a.templatePrecheck as { templateType?: string; templateTypeConfidence?: string; decision?: string } | undefined
    return {
      discoveredContentId: Number(a.discoveredContentId),
      title: String(a.title ?? ''),
      displayTitle: a.displayTitle as string | undefined,
      sourceName: String(a.sourceName ?? ''),
      sourceUrl: String(a.sourceUrl ?? ''),
      verifiedAt: (a.verifiedAt as string) ?? null,
      verdict: a.verdict as 'A' | 'B' | 'C',
      expired: !!a.expired,
      ginzaRelevant: !!a.ginzaRelevant,
      hasTraceableSource: !!a.hasTraceableSource,
      duplicate: !!(a.dedup as { duplicate?: boolean })?.duplicate,
      factKind: (a.factKind as ThemeCandidate['factKind']) ?? null,
      templateType: String(a.templateType ?? pc?.templateType ?? af?.templateType ?? '') || null,
      templateTypeConfidence: (pc?.templateTypeConfidence as ThemeCandidate['templateTypeConfidence']) ?? null,
      templateEligible: !!a.templateEligible,
      factsSource: (a.factsSource as ThemeCandidate['factsSource']) ?? (af ? (String(af.enrichmentStatus) as ThemeCandidate['factsSource']) : 'none'),
      bAdditionalMinutes: (a.bAdditionalMinutes as number) ?? null,
      precheckDecision: (pc?.decision as ThemeCandidate['precheckDecision']) ?? null,
      missingForTemplate: (a.templatePrecheck as { missingForTemplate?: string[] })?.missingForTemplate ?? [],
      primaryCategory: (af?.primaryCategory as string | null) ?? null,
      uxType: (dc.uxType as string | null) ?? null,
      eventStartAt: (dc.eventStartAt as string | null) ?? null,
      eventEndAt: (dc.eventEndAt as string | null) ?? null,
      venue: (dc.venue as string | null) ?? null,
      contentType: (dc.contentType as string | null) ?? null,
      eventPeriod: a.eventPeriod as string | undefined,
    }
  })
}

function adminCandidateReviewUrl(dcIds: number[]): string {
  // 候補確認・一括承諾：inbox のまま該当 DC を絞り込んで表示 → 全選択 → 一括編集 → curationStatus=approved
  // Payload 3 admin は id の "is in" を配列（インデックス付き）で復元する。カンマ区切り1文字列だと空欄になる。
  return buildAdminCandidateReviewUrl({
    baseUrl: process.env.CMS_URL || 'http://localhost:3000',
    dcIds,
    curationStatus: 'inbox',
  })
}

async function main(): Promise<void> {
  const args = parseArgs()
  const cfg = loadSelectThemesConfigFromEnv()
  const now = new Date(`${args.date}T00:00:00.000Z`)

  let candidates: ThemeCandidate[]
  let collectedTotal = 0
  let assessed = 0
  let abcCounts = { A: 0, B: 0, C: 0 }
  let history: AssessInboxPoolResult['history'] = EMPTY_HISTORY
  let inputMode = 'inbox'

  if (args.fixture) {
    inputMode = 'fixture'
    candidates = JSON.parse(readFileSync(resolve(args.fixture), 'utf8')) as ThemeCandidate[]
    collectedTotal = candidates.length
    assessed = candidates.length
  } else {
    const payload = await getPayload({ config })
    if (args.fromReport) {
      inputMode = 'morning-report(approved-only・旧挙動)'
      const d = args.fromReport === 'today' ? args.date : args.fromReport
      candidates = await loadFromMorningReport(payload, d)
      assessed = candidates.length
      collectedTotal = candidates.length
    } else {
      const statuses = args.includeApproved ? ['inbox', 'approved'] : ['inbox']
      inputMode = statuses.join('+')
      const res = await assessInboxPool(payload, { now, statuses, limit: args.limit })
      candidates = res.candidates
      collectedTotal = res.collectedTotal
      assessed = res.assessed
      abcCounts = res.abcCounts
      history = res.history
    }
  }

  // 実データ経路は偏り補正＋コアターゲット適合ランキングを有効化（fixture/テストは無効のまま）
  const res = selectRecommendedThemes(candidates, { now, config: cfg, enableTargetFitRanking: true })
  const balance = buildSelectionBalance(res)

  console.log('=== ./p2 themes recommend（候補選定・承諾前・読み取り専用・DB書き込みなし）===')
  console.log(`対象日: ${args.date}   入力: ${inputMode}`)
  console.log(`1. 収集件数: 対象 status の DC 総数 ${collectedTotal} ／ 評価した件数 ${assessed}（A ${abcCounts.A} / B ${abcCounts.B} / C ${abcCounts.C}）`)
  console.log(`2. gate 通過件数: ${res.gatePassed} ／ gate 落ち: ${res.rejected.length} ／ 選定: 推奨 ${res.recommended.length} ＋ 予備 ${res.spare.length}`)
  console.log('────────────────────────────────────────────')

  // --- 選定前：gate 通過候補の暫定カテゴリー（明記から。推測なし）---
  {
    const passed = res.candidates.length
      ? [...res.recommended, ...res.spare] // 選ばれた15件は categoryKey を持つ
      : []
    // gate 通過プール全体の暫定カテゴリーは rejected を除いた入力から再計算できないため、
    // 選定結果（推奨＋予備）＋ notFinalized のカテゴリー根拠比率で表示する。
    const catAgg = new Map<string, number>()
    for (const e of passed) catAgg.set(`${e.categoryKey}${e.categoryBasis ? `(${e.categoryBasis})` : ''}`, (catAgg.get(`${e.categoryKey}${e.categoryBasis ? `(${e.categoryBasis})` : ''}`) ?? 0) + 1)
    console.log('■ 選定前チェック: 暫定カテゴリー（明記＝primaryCategory/title のみ確定・templateType は推定・無ければ未確定）')
    console.log(`  推奨＋予備15件の暫定カテゴリー: ${[...catAgg.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' / ') || 'なし'}`)
    console.log(`  推奨内で明記からカテゴリー確定: ${res.provisionalCategories.resolvedCount}/${res.recommended.length}（${Math.round(res.provisionalCategories.resolvedRatio * 100)}%）`)
    console.log('────────────────────────────────────────────')
  }

  const showList = (title: string, list: typeof res.recommended, checked: boolean) => {
    console.log(`\n■ ${title}`)
    for (const e of list) {
      const c = e.candidate
      const catTag = `${e.categoryKey}${e.categoryBasis ? `〔${e.categoryBasis === 'templateType' ? '暫定:種別' : e.categoryBasis === 'title' ? '明記:タイトル' : '確定'}〕` : '〔未確定〕'}`
      console.log(
        `  ${checked ? '☑' : '☐'} DC #${c.discoveredContentId}  [${c.verdict}/${e.readiness}]  ${catTag} / ${e.templateTypeKey} / ${e.temporalTier}  「${c.displayTitle ?? c.title}」`,
      )
      console.log(`      施設: ${e.facilityLabel}（bucket=${e.facilityBucket} / key=${e.facilityKey ?? '-'}）／ 情報源: ${e.sourceName}／ 会期: ${c.eventPeriod ?? '確認できません'}`)
      console.log(`      一次情報URL: ${c.sourceUrl || '確認できません'}`)
      console.log(
        `      評価: 旬 ${e.scores.freshness.toFixed(2)} / カテゴリ分散 ${e.scores.categorySpread.toFixed(2)} / 情報源施設 ${e.scores.sourceFacilitySpread.toFixed(2)} / 会場エリア ${e.scores.venueAreaSpread.toFixed(2)} / 種別 ${e.scores.templateTypeSpread.toFixed(2)} → total ${e.scores.total.toFixed(3)}`,
      )
      console.log(
        `      target_fit ${c.targetFit ?? '-'}／100  editorial_score ${c.editorialScoreTotal ?? '-'}／100  最終score ${e.scores.total.toFixed(3)}` +
          `（内訳: targetFit ${e.scores.targetFit.toFixed(2)} / editorial ${e.scores.editorial.toFixed(2)} / sourceBalance ${e.scores.sourceBalance.toFixed(2)} / 偏り補正 ${e.scores.biasAdjust.toFixed(2)}）` +
          (c.targetFitCompass
            ? `  compass〔かわいい${c.targetFitCompass.kawaii.toFixed(1)}/上質${c.targetFitCompass.joshitsu.toFixed(1)}/整${c.targetFitCompass.totonoeru.toFixed(1)}/発見${c.targetFitCompass.hakken.toFixed(1)}/背伸${c.targetFitCompass.senobi.toFixed(1)}〕`
            : ''),
      )
      console.log(`      ソース種別: ${c.sourceTypeKey ?? '-'}／ 直近偏りペナルティ: カテゴリ -${(c.categoryHistoryPenalty ?? 0).toFixed(2)} / 施設 -${(c.venueHistoryPenalty ?? 0).toFixed(2)}`)
      const ev = safetyGateEvidence(c)
      console.log(`      安全性 gate 根拠: 全${SAFETY_GATE_CHECKS.length}条件中${ev.passed.length}条件充足${ev.failed.length ? ` ／ 未充足: ${ev.failed.join(',')}` : ''}`)
      if (Array.isArray(c.classificationBasis) && c.classificationBasis.length)
        for (const b of c.classificationBasis) console.log(`      分類根拠: ${b}`)
      if (e.readiness !== 'ready' && e.missingForGeneration.length)
        console.log(`      未確認事項（承諾後にマロンが埋める・件数確保のため green にしない）: ${e.missingForGeneration.join(' ／ ')}`)
      if (e.sameFacilityException) console.log(`      ⚠ 同一施設2件の理由: ${e.sameFacilityException}`)
      console.log(`      ${crossCultureSummaryLine(c.crossCulture)}`)
    }
  }
  showList(`3-4. 推奨 ${res.recommended.length} 件（最初から選択済みで表示）`, res.recommended, true)
  showList(`予備 ${res.spare.length} 件`, res.spare, false)

  // --- 偏り補正サマリー（推奨 ${res.recommended.length} 件） ---
  {
    const rec = res.recommended
    const catSet = new Set(rec.filter((e) => e.categoryKey !== '未確定').map((e) => e.categoryKey))
    const isGsix = (e: (typeof rec)[number]) => /ginza[ _-]?six|gsix|ギンザ ?シックス|銀座シックス/i.test(e.facilityLabel + ' ' + e.sourceName + ' ' + (e.candidate.venue ?? ''))
    const isTsutaya = (e: (typeof rec)[number]) => /蔦屋/.test(e.facilityLabel + ' ' + e.sourceName + ' ' + (e.candidate.venue ?? ''))
    const gsix = rec.filter(isGsix).length
    const tsutaya = rec.filter(isTsutaya).length
    const artCulture = rec.filter((e) => e.categoryKey === 'ART' || e.categoryKey === 'CULTURE').length
    const tfList = rec.map((e) => e.candidate.targetFit ?? 0)
    const tfAvg = tfList.length ? Math.round(tfList.reduce((a, b) => a + b, 0) / tfList.length) : 0
    console.log('')
    console.log('■ 偏り補正サマリー（推奨内）')
    console.log(`  含まれたカテゴリー数: ${catSet.size} / 18（${[...catSet].join('・') || 'なし'}）`)
    console.log(`  GINZA SIX: ${gsix} 件 ／ 銀座 蔦屋書店: ${tsutaya} 件 ／ ART+CULTURE 合計: ${artCulture} 件`)
    console.log(`  ソース種別分散: ${[...new Set(rec.map((e) => e.candidate.sourceTypeKey ?? '-'))].join(' / ')}`)
    console.log(`  target_fit 平均: ${tfAvg} / 100`)
    console.log(`  目安チェック: 同一施設≤2 ／ 同一カテゴリー≤3 ／ ART+CULTURE≤3（原則。旬度が極端に高い場合のみ例外）`)
  }

  if (res.rejected.length) {
    console.log(`\n■ 6. 除外理由（安全性 gate 落ち ${res.rejected.length} 件・加点で救わない）`)
    // gate 落ちコード別の集計（unknown_type / unknown_factkind の内訳確認用）
    const failByCode: Record<string, number> = {}
    for (const r of res.rejected) for (const f of r.gateFails) failByCode[f] = (failByCode[f] ?? 0) + 1
    console.log(`  コード別: ${Object.entries(failByCode).map(([k, v]) => `${k}=${v}`).join(' / ')}（1件が複数コードで落ちうる）`)
    for (const r of res.rejected.slice(0, 40)) {
      console.log(`  ・DC #${r.candidate.discoveredContentId}  ${r.gateFails.join(', ')}  「${r.candidate.title.slice(0, 50)}」`)
      if (Array.isArray(r.candidate.classificationBasis) && r.candidate.classificationBasis.length)
        console.log(`      分類根拠: ${r.candidate.classificationBasis.join(' ／ ')}`)
    }
    if (res.rejected.length > 40) console.log(`  …ほか ${res.rejected.length - 40} 件`)
  }

  // --- gate 緩和なしの検証：推奨・予備の全件が安全性 gate 通過であることを確認 ---
  const notSafe = [...res.recommended, ...res.spare].filter((e) => safetyGateEvidence(e.candidate).failed.length > 0)
  console.log('')
  console.log('■ 安全性 gate 緩和なしの検証')
  console.log(`  安全性 gate の${SAFETY_GATE_CHECKS.length}条件: ${SAFETY_GATE_CHECKS.map((c, i) => `${i + 1}.${c}`).join(' / ')}`)
  console.log(
    notSafe.length === 0
      ? `  ✅ 推奨${res.recommended.length}＋予備${res.spare.length}＝${res.recommended.length + res.spare.length}件すべてが${SAFETY_GATE_CHECKS.length}条件を充足。件数確保のための緩和・水増しは無し。`
      : `  ❌ 安全性未確認の候補が ${notSafe.length} 件混入: ${notSafe.map((e) => `#${e.candidate.discoveredContentId}`).join(',')}`,
  )
  console.log(`  ※ no_path_to_green は「承諾前の記事化準備」であり安全性ではないため gate から除外。安全性${SAFETY_GATE_CHECKS.length}条件は不変。`)

  // ── 候補選定サポート（2026-10 初期トライアル：通常3本＋100円2〜3本） ──
  const recForSupport = res.recommended.map((e) => ({
    dcId: e.candidate.discoveredContentId,
    title: e.candidate.displayTitle ?? e.candidate.title,
    categoryKey: e.categoryKey === '未確定' ? null : e.categoryKey,
    facilityKey: e.facilityKey ?? null,
    facilityLabel: e.facilityLabel,
  }))
  const coreDaily = assessCoreDailyFulfillment(
    recForSupport.map((r) => ({ dcId: r.dcId, title: r.title, categoryKey: r.categoryKey })),
  )
  const consecWarnings = detectConsecutiveFacilityWarnings({
    recentFacilitySequence: history.recentFacilitySequence,
    recommended: recForSupport.map((r) => ({ dcId: r.dcId, facilityKey: r.facilityKey, facilityLabel: r.facilityLabel })),
  })
  const perCandidateSupport = res.recommended.map((e) => {
    const c = e.candidate
    const season = seasonalSignal(c.displayTitle ?? c.title, now)
    const paid = paidLanePotential({
      title: c.displayTitle ?? c.title,
      venue: c.venue ?? null,
      categoryKey: e.categoryKey === '未確定' ? null : e.categoryKey,
      uxType: c.uxType ?? null,
      contentType: c.contentType ?? null,
      eventPeriod: c.eventPeriod ?? null,
      templateType: c.templateType ?? null,
    })
    return { dcId: c.discoveredContentId, title: c.displayTitle ?? c.title, targetFitReason: c.targetFitReason ?? null, season, paid }
  })

  console.log('')
  console.log('■ 候補選定サポート（2026-10 初期トライアル：通常記事3本＋100円記事2〜3本＝1日5〜6本 → 段階的に10本）')
  console.log('  ── 本日の3カテゴリー充足状況（通常記事3本の基本構成）──')
  for (const b of coreDaily.buckets) {
    console.log(
      `   ${b.filled ? '✅' : '❌'} ${b.label}: ${b.have}/${b.need}` +
        (b.matched.length ? `  → ${b.matched.map((m) => `#${m.dcId}(${m.categoryKey})`).join(' , ')}` : '  → 候補なし（追加収集）'),
    )
  }
  if (coreDaily.uncategorized.length)
    console.log(`   ・3カテゴリー外の推奨: ${coreDaily.uncategorized.map((m) => `#${m.dcId}`).join(' , ')}（週次で18カテゴリーを循環）`)
  console.log(`   → 3カテゴリー充足: ${coreDaily.allFilled ? 'OK' : '未充足（不足カテゴリーを追加収集）'}`)

  console.log(`  ── 過去${history.windowDays}日間の18カテゴリー別 採用件数（approved ${history.approvedCount}件）──`)
  {
    const ent = Object.entries(history.categoryCounts).sort((a, b) => b[1] - a[1])
    console.log(`   ${ent.length ? ent.map(([k, v]) => `${k}×${v}`).join(' / ') : '（履歴なし）'}`)
    const zero = CORE_DAILY_BUCKETS.flatMap((b) => b.cats).filter((c) => !history.categoryCounts[c])
    if (zero.length) console.log(`   コア3系統で直近ゼロ: ${[...new Set(zero)].join(' / ')}（週次・月次で循環）`)
  }
  console.log(`  ── 過去${history.windowDays}日間の施設別 採用件数 ──`)
  {
    const ent = Object.entries(history.facilityCounts).sort((a, b) => b[1] - a[1])
    console.log(`   ${ent.length ? ent.map(([k, v]) => `${k}×${v}`).join(' / ') : '（履歴なし）'}`)
    const over = ent.filter(([, v]) => v >= 2)
    if (over.length) console.log(`   ⚠ 2件以上: ${over.map(([k, v]) => `${k}(${v})`).join(' / ')}（GINZA SIX 等の特定施設へ偏らせない）`)
  }
  console.log('  ── 同一施設の連続採用警告 ──')
  if (consecWarnings.length === 0) console.log('   なし')
  else for (const w of consecWarnings) console.log(`   ⚠ [${w.code}] ${w.message}`)

  console.log('  ── 推奨候補ごと：コアターゲット適合理由 / 季節性 / 100円展開可能性 ──')
  for (const s of perCandidateSupport) {
    console.log(`   DC #${s.dcId}「${s.title}」`)
    console.log(`      コアターゲット適合: ${s.targetFitReason ?? '（理由未算出）'}`)
    console.log(
      `      季節性: ${s.season.note}` +
        (s.season.keywords.length ? `（語: ${s.season.keywords.join('・')}）` : '') +
        (s.season.cityWide ? '  ★季節横断型（重視）' : ''),
    )
    console.log(
      `      100円展開可能性: ${s.paid.level.toUpperCase()} — ${s.paid.reasons.join(' ／ ')}` +
        `\n         必須How-to価値: ${s.paid.requiredValue.join(' / ')}`,
    )
  }

  console.log('')
  process.stdout.write(renderSelectionBalanceText(balance))

  console.log('')
  console.log('■ 偏りハードキャップ（マロン指示・2026-09-04）')
  console.log(`  推奨: 同一施設 ≤ ${cfg.recFacilityMax}（原則1）／ 同一情報源 ≤ ${cfg.recSourceMax}（20%）`)
  console.log(`  予備: 予備内 同一施設 ≤ ${cfg.spareFacilityMax}／ 推奨＋予備 同一施設 ≤ ${cfg.allFacilityMax}・同一情報源 ≤ ${cfg.allSourceMax}`)
  console.log(`  不足時は GINZA SIX 等で穴埋めせず shortfall（finalized=false）。`)
  if (res.spareShortfall) console.log(`  ⚠ 予備が ${cfg.spareCount} 件に不足（実際 ${res.spare.length} 件）`)
  console.log('')
  if (!res.finalized) {
    console.log('⚠ 9. この推奨は「確定」にできません（不足／偏り／カテゴリー根拠不足）:')
    for (const r of res.notFinalizedReasons) console.log(`   ・${r}`)
    console.log('   → 非 GINZA SIX の公式情報源を追加し、次の軸を広げて再収集・再選定してください:')
    if (res.broadenAxes.categories.length) console.log(`     カテゴリー: ${res.broadenAxes.categories.join(', ')}`)
    if (res.broadenAxes.temporal.length) console.log(`     旬: ${res.broadenAxes.temporal.join(' / ')}`)
    if (res.broadenAxes.facilities.length) console.log(`     施設: ${res.broadenAxes.facilities.join(' / ')}`)
    if (res.broadenAxes.sources.length) console.log(`     情報源: ${res.broadenAxes.sources.join(' / ')}`)
  } else {
    console.log('✅ 9. 不足・偏り・カテゴリー根拠不足なし。推奨10件を確定できます。')
  }

  console.log('────────────────────────────────────────────')
  console.log('7. マロンが開く「候補確認・一括承諾」画面（承諾前＝inbox のまま絞り込み表示）:')
  console.log(`   ${adminCandidateReviewUrl(res.recommendedDcIds)}`)
  console.log('   → 内容を確認 → 全選択 → 一括編集 → curationStatus = approved（承諾後に初めて approved になる）')
  console.log('   ※ このコマンドは approved にしない。承諾はログイン中マロンの操作。')

  console.log('────────────────────────────────────────────')
  console.log(
    JSON.stringify({
      date: args.date,
      inputMode,
      collectedTotal,
      assessed,
      abcCounts,
      gatePassed: res.gatePassed,
      recommendedDcIds: res.recommendedDcIds,
      spareDcIds: res.spare.map((e) => e.candidate.discoveredContentId),
      rejected: res.rejected.map((r) => ({ dcId: r.candidate.discoveredContentId, fails: r.gateFails })),
      shortfall: res.shortfall,
      shortfallBy: res.shortfallBy,
      spareShortfall: res.spareShortfall,
      finalized: res.finalized,
      notFinalizedReasons: res.notFinalizedReasons,
      broadenAxes: res.broadenAxes,
      biasFlags: res.bias.flags,
      facilityCounts: res.bias.facilityCounts,
      sourceCounts: res.bias.sourceCounts,
      provisionalCategories: res.provisionalCategories,
      recommended: res.recommended.map((e) => ({
        dcId: e.candidate.discoveredContentId,
        title: e.candidate.displayTitle ?? e.candidate.title,
        eventPeriod: e.candidate.eventPeriod ?? '確認できません',
        sourceUrl: e.candidate.sourceUrl || '確認できません',
        source: e.sourceName,
        sourceType: e.candidate.sourceTypeKey ?? null,
        facility: e.facilityBucket,
        category: e.categoryKey,
        categoryBasis: e.categoryBasis,
        templateType: e.templateTypeKey,
        temporal: e.temporalTier,
        targetFit: e.candidate.targetFit ?? null,
        editorialScore: e.candidate.editorialScoreTotal ?? null,
        finalScore: Number(e.scores.total.toFixed(4)),
        scoreParts: {
          freshness: Number(e.scores.freshness.toFixed(3)),
          targetFit: Number(e.scores.targetFit.toFixed(3)),
          editorial: Number(e.scores.editorial.toFixed(3)),
          sourceBalance: Number(e.scores.sourceBalance.toFixed(3)),
          biasAdjust: Number(e.scores.biasAdjust.toFixed(3)),
        },
        crossCulture: e.candidate.crossCulture
          ? {
              mode: e.candidate.crossCulture.mode,
              derivativeMarkets: e.candidate.crossCulture.derivativeMarkets,
              editorialMarkets: e.candidate.crossCulture.editorialMarkets,
              topMarket: e.candidate.crossCulture.topMarket,
            }
          : null,
      })),
      spare: res.spare.map((e) => ({
        dcId: e.candidate.discoveredContentId,
        title: e.candidate.displayTitle ?? e.candidate.title,
        eventPeriod: e.candidate.eventPeriod ?? '確認できません',
        sourceUrl: e.candidate.sourceUrl || '確認できません',
        source: e.sourceName,
        facility: e.facilityBucket,
        category: e.categoryKey,
        templateType: e.templateTypeKey,
      })),
      readiness: res.recommended.map((e) => ({ dcId: e.candidate.discoveredContentId, state: e.readiness, missing: e.missingForGeneration })),
      sameFacilityExceptions: balance.sameFacilityExceptions,
      selectionSupport: {
        initialTrial: { normalPerDay: 3, paidPerDay: '2〜3', totalPerDay: '5〜6', scaleUpTo: 10 },
        coreDailyCategories: coreDaily.buckets.map((b) => ({ key: b.key, label: b.label, have: b.have, filled: b.filled, dcIds: b.matched.map((m) => m.dcId) })),
        coreDailyAllFilled: coreDaily.allFilled,
        history7d: {
          windowDays: history.windowDays,
          approvedCount: history.approvedCount,
          categoryCounts: history.categoryCounts,
          facilityCounts: history.facilityCounts,
          recentFacilitySequence: history.recentFacilitySequence,
        },
        consecutiveFacilityWarnings: consecWarnings,
        perCandidate: perCandidateSupport.map((s) => ({
          dcId: s.dcId,
          targetFitReason: s.targetFitReason,
          seasonal: { season: s.season.season, inSeason: s.season.inSeason, cityWide: s.season.cityWide, keywords: s.season.keywords, note: s.season.note },
          paidLane: { level: s.paid.level, reasons: s.paid.reasons, requiredValue: s.paid.requiredValue },
        })),
      },
    }),
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
  process.exit(1)
})
