// GINZA WHISKERS / Project 02（2026-09-13 新設）— 本日のSWEETS候補 再抽出（1画面・読み取り専用）。
//
//   ./p2 sweets-today [--exclude-facility=key1,key2] [--limit=5] [--json]
//
// マロン指示の固定要件に基づき、SWEETS専用の候補選定を独立コマンドとして実行する
// （既存 ./p2 morning-brief のSWEETS節と同じ土台〈selectSweetsCandidates〉を使うが、
// 本コマンドは「今日の優先カテゴリー候補上位が0件なら処理を自動失敗させる」ことを
// 主目的とし、非0の終了コードで停止する点が morning-brief〈4領域を毎日通す運用〉とは
// 異なる）。
//
// 固定要件（2026-09-13、マロン指示）：
//   1. 本日の最優先カテゴリー＝スイーツ・和菓子（CORE_DAILY_BUCKETSで既に最優先）
//   2. 除外施設は --exclude-facility で指定（既定は空＝除外なし。恒久的な偏りにしない）
//   3. 既投稿・既承認・既下書き・過去に提示済みの候補は除外（既存 alreadyDrafted /
//      publishedThemes の仕組みをそのまま利用）
//   4/5. デパ地下出店ブランド・独立店・専門店の横断収集は SOURCE_LEDGER 登録内容に依存
//        （銀座三越・松屋銀座・資生堂パーラー等は既に登録済み。収集自体は ./p2 crawl が担う）
//   6. 同一施設は最大1件（selectSweetsCandidatesの施設キャップ）
//   7/8/9. 公式情報の完全度チェック（finalEligible）・「公式記載なし」表記は既存ロジックのまま
//   10. 銀茶会等の定例イベントの前年情報流用を防ぐ（recurringEventYearGuard）
//
// **DB 書き込み・AI 呼び出し・課金・approve・記事生成・note/Chrome 操作は一切しない。**

import { getPayload } from 'payload'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import config from '../payload.config'
import { assessInboxPool } from '../lib/pipeline/assessInboxPool'
import { selectRecommendedThemes, loadSelectThemesConfigFromEnv, evaluateSafetyGate } from '../lib/pipeline/selectRecommendedThemes'
import { resolveBusinessDate, tokyoStartOfDay } from '../lib/util/businessDate'
import { loadPublishedThemes } from '../lib/publish/loadPublishedThemes'
import { matchPublishedTheme } from '../lib/publish/publishedThemes'
import { deriveProvisionalCategory } from '../lib/pipeline/provisionalCategory'
import { resolveFacilityKey } from '../lib/curation/facilityKey'
import { loadAlreadyDraftedDcIds } from '../lib/curation/alreadyDrafted'
import { checkRecurringEventYearClaim } from '../lib/curation/recurringEventYearGuard'
import { selectSweetsCandidates, evaluateSweetsGate, type SweetsCandidateInput } from '../lib/pipeline/sweetsCandidateSelect'
import { assembleBriefFacts, type BriefCandidateInput } from '../lib/pipeline/morningBriefSelect'

const argv = process.argv.slice(2)
const JSON_OUT = argv.includes('--json')
const excludeArg = argv.find((a) => a.startsWith('--exclude-facility='))?.split('=')[1] ?? ''
const EXCLUDE_FACILITY_KEYS = excludeArg.split(',').map((s) => s.trim()).filter(Boolean)
const limArg = argv.find((a) => a.startsWith('--limit='))
const MAX_CANDIDATES = limArg ? Math.max(1, Number(limArg.split('=')[1]) || 5) : 5
const DATE = resolveBusinessDate((argv.find((a) => a.startsWith('--date=')) ?? '').split('=')[1])

async function main() {
  const payload = await getPayload({ config })
  const now = tokyoStartOfDay(DATE)

  const assessed = await assessInboxPool(payload, { now, statuses: ['inbox', 'approved'], limit: 1000 })
  const cfg = loadSelectThemesConfigFromEnv()
  // selectRecommendedThemes 自体は使わない（SWEETSは assessed.candidates 全体から
  // 独立して評価する、既存 morningBrief.ts と同じ設計）。安全性gate関数のみ再利用。
  void selectRecommendedThemes

  const allDcIds = assessed.candidates.map((c) => c.discoveredContentId)
  const alreadyDraftedAll = await loadAlreadyDraftedDcIds(payload, allDcIds)
  const publishedThemes = await loadPublishedThemes(payload, resolve(process.cwd(), '..'))

  const sweetsInputs: SweetsCandidateInput[] = assessed.candidates
    .map((c): SweetsCandidateInput | null => {
      const prov = deriveProvisionalCategory({
        primaryCategory: c.primaryCategory ?? null,
        title: c.title ?? '',
        venue: c.venue ?? '',
        templateType: c.templateType ?? null,
        contentType: c.contentType ?? undefined,
        excerpt: c.excerpt ?? undefined,
      })
      if (prov.category !== 'SWEETS') return null
      const fk = resolveFacilityKey({ venue: c.venue, sourceName: c.sourceName, sourceUrl: c.sourceUrl, title: c.title })
      const pub = matchPublishedTheme(
        { dcId: c.discoveredContentId, title: c.displayTitle ?? c.title, eventName: c.displayTitle ?? c.title, venue: c.venue, period: c.eventPeriod },
        publishedThemes,
      )
      const alreadyPublished = pub.match || c.duplicate === true || alreadyDraftedAll.has(c.discoveredContentId)
      const safetyFails = evaluateSafetyGate(c, cfg)
      const yearCheck = checkRecurringEventYearClaim(
        { sourceName: c.sourceName, sourceUrl: c.sourceUrl, title: c.displayTitle ?? c.title, eventPeriod: c.eventPeriod },
        { now },
      )
      const yearFails = yearCheck.ok ? [] : [yearCheck.reason!]
      const gateOk = safetyFails.length === 0 && yearCheck.ok
      return {
        dcId: c.discoveredContentId,
        title: c.title,
        displayTitle: c.displayTitle ?? null,
        category: 'SWEETS',
        facilityKey: fk.key,
        facilityLabel: fk.store || c.venue || null,
        sourceName: c.sourceName,
        sourceUrl: c.sourceUrl,
        venue: c.venue ?? null,
        eventPeriod: c.eventPeriod ?? null,
        eventStartAt: (c.eventStartAt as string | null) ?? null,
        eventEndAt: (c.eventEndAt as string | null) ?? null,
        officialCompletenessScore: c.officialCompletenessScore ?? null,
        officialMissing: gateOk ? (c.officialMissing ?? null) : [...(c.officialMissing ?? []), ...safetyFails, ...yearFails],
        finalEligible: gateOk && c.finalEligible !== false,
        daysUntilEnd: c.daysUntilEnd ?? null,
        targetFit: c.targetFit ?? null,
        alreadyPublished,
        publishedReason: pub.match ? pub.reason : alreadyDraftedAll.has(c.discoveredContentId) ? '既に Article／note下書き 化済み（重複）' : null,
        facilityCount7d: fk.key ? (assessed.history.facilityKeyCounts[fk.key] ?? 0) : 0,
      }
    })
    .filter((x): x is SweetsCandidateInput => x != null)

  const selection = selectSweetsCandidates(sweetsInputs, {
    now,
    maxCandidates: MAX_CANDIDATES,
    excludeFacilityKeys: EXCLUDE_FACILITY_KEYS.length ? EXCLUDE_FACILITY_KEYS : undefined,
    excludeReasonLabel: '本日の固定要件により除外',
  })
  const gate = evaluateSweetsGate(selection)

  // ArticleFacts（価格・購入条件・出典確認日等）
  const factsByDc = new Map<number, Record<string, unknown>>()
  const pickedDcIds = selection.candidates.map((c) => c.dcId)
  if (pickedDcIds.length) {
    const af = await payload.find({
      collection: 'article-facts',
      where: { discoveredContent: { in: pickedDcIds } },
      limit: 2000,
      depth: 0,
      overrideAccess: true,
    })
    for (const f of af.docs as unknown as Record<string, unknown>[]) {
      const ref = f.discoveredContent
      const id = typeof ref === 'object' && ref ? Number((ref as { id?: number }).id) : Number(ref)
      if (Number.isFinite(id)) factsByDc.set(id, f)
    }
  }

  // 本日新規収集か既存DB候補か（DiscoveredContent.detectedAt が本日の業務日付と一致するか）
  const detectedAtByDc = new Map<number, string | null>()
  if (pickedDcIds.length) {
    const dcDocs = await payload.find({
      collection: 'discovered-content',
      where: { id: { in: pickedDcIds } },
      limit: pickedDcIds.length,
      depth: 0,
      overrideAccess: true,
    })
    for (const d of dcDocs.docs as unknown as Record<string, unknown>[]) {
      detectedAtByDc.set(Number(d.id), (d.detectedAt as string | null) ?? null)
    }
  }
  const businessDatePrefix = DATE // 'YYYY-MM-DD'

  type DisplayRow = {
    dcId: number
    isNewToday: boolean
    store: string
    facility: string
    productName: string
    price: string
    period: string
    conditions: string
    sourceUrl: string
    verifiedAt: string
  }

  const rows: DisplayRow[] = selection.candidates.map((sc) => {
    const input = sweetsInputs.find((s) => s.dcId === sc.dcId)!
    const fk = resolveFacilityKey({ venue: input.venue, sourceName: input.sourceName, sourceUrl: input.sourceUrl, title: input.title })
    const f = factsByDc.get(sc.dcId)
    const briefInput: BriefCandidateInput = {
      dcId: sc.dcId,
      title: input.title,
      displayTitle: input.displayTitle,
      scoreTotal: sc.score,
      categoryKey: 'SWEETS',
      facilityKey: fk.key,
      facilityLabel: fk.store || input.venue || '(会場不明)',
      sourceName: sc.sourceName,
      sourceUrl: sc.sourceUrl,
      venue: input.venue,
      eventPeriod: sc.eventPeriod,
      eventStartAt: input.eventStartAt,
      eventEndAt: input.eventEndAt,
      verifiedAt: null,
      readiness: f ? 'ready' : 'missing',
      facts: f
        ? {
            eventName: (f.eventName as string) ?? null,
            whatHappens: (f.whatHappens as string) ?? null,
            priceText: (f.priceText as string) ?? null,
            eventDate: (f.eventDate as string) ?? null,
            areaLead: (f.areaLead as string) ?? null,
            applyRequired: (f.applyRequired as boolean) ?? null,
            applyDeadline: (f.applyDeadline as string) ?? null,
            saleAvailability: (f.saleAvailability as string) ?? null,
            officialInfoNote: (f.officialInfoNote as string) ?? null,
            humanReviewedAt: (f.humanReviewedAt as string) ?? null,
          }
        : undefined,
    }
    const facts12 = assembleBriefFacts(briefInput)
    const detectedAt = detectedAtByDc.get(sc.dcId) ?? null
    const isNewToday = !!detectedAt && detectedAt.slice(0, 10) === businessDatePrefix

    return {
      dcId: sc.dcId,
      isNewToday,
      store: fk.store || sc.facilityLabel || '公式記載なし',
      facility: fk.area || fk.store || sc.facilityLabel || '公式記載なし',
      productName: facts12.正式名称,
      price: facts12.価格,
      period: facts12['開催／販売期間'],
      conditions: facts12['購入／参加条件'],
      sourceUrl: sc.sourceUrl,
      verifiedAt: facts12.出典確認日,
    }
  })

  // ─────────────── 出力 ───────────────
  const lines: string[] = []
  const L = (s = '') => lines.push(s)
  L(`=== 本日のSWEETS候補 再抽出（sweets-today）  対象日 ${DATE}  読み取り専用・DB書き込みなし ===`)
  L(`承諾前(inbox)＋承諾済み(approved) 評価 ${assessed.assessed} 件 → SWEETS分類の生候補 ${selection.summary.rawSweetsCount} 件`)
  if (EXCLUDE_FACILITY_KEYS.length) L(`固定要件による施設除外: ${EXCLUDE_FACILITY_KEYS.join(', ')}（除外 ${selection.summary.excludedFixedRule} 件）`)
  L(
    `除外内訳: 既公開・既下書き重複 ${selection.summary.excludedPublished} 件 ／ 公式情報不完全 ${selection.summary.excludedIncomplete} 件 ／ ` +
      `施設分散（同一施設2件目以降）${selection.summary.excludedFacilityCap} 件`,
  )
  L('────────────────────────────────────────────')

  if (!gate.passed) {
    L('')
    L('🛑 GATE FAILED：本日の最優先カテゴリー（スイーツ・和菓子）が候補上位を占めていません')
    L(`   ${gate.reason}`)
    L('')
    if (selection.excluded.length) {
      L('（除外された候補の内訳）')
      for (const e of selection.excluded.slice(0, 20)) L(`  ・DC #${e.dcId}「${e.title}」→ ${e.reason}`)
    }
    L('')
    L('本日は記事生成・承認対象となるSWEETS候補を提示できません。追加収集または固定要件の見直しが必要です。')
  } else {
    for (const [i, r] of rows.entries()) {
      L('')
      L(`${i + 1}. DC #${r.dcId}　${r.isNewToday ? '🆕 本日新規収集' : '📋 既存DB候補'}`)
      L(`   店舗名        : ${r.store}`)
      L(`   施設名        : ${r.facility}`)
      L(`   商品・企画名  : ${r.productName}`)
      L(`   価格          : ${r.price}`)
      L(`   販売期間      : ${r.period}`)
      L(`   購入条件      : ${r.conditions}`)
      L(`   公式URL       : ${r.sourceUrl}`)
      L(`   出典確認日    : ${r.verifiedAt}`)
    }
    if (selection.shortfall) {
      L('')
      L(`⚠ ${selection.shortfallReason}`)
      if (selection.nextSourceTypesToExplore?.length) {
        L(`  → 次回優先して探索する情報源種別: ${selection.nextSourceTypesToExplore.join(' / ')}`)
      }
    }
  }

  L('')
  L('────────────────────────────────────────────')
  L('■ マロンの操作：各候補について「承認／保留／却下」のいずれかを判断してください')
  L('   本コマンドは候補の提示のみを行います。記事生成・承認・note転記・外部公開は行いません。')
  L('   承認する場合は、対象DCをadmin画面で curationStatus=approved にしたうえで')
  L('   ./p2 draft-today --yes （AI課金あり・人間が明示実行）へ進んでください。')

  const outDir = resolve(process.cwd(), '..', '.devlogs', 'morning', 'sweets-today')
  mkdirSync(outDir, { recursive: true })
  const text = lines.join('\n') + '\n'
  writeFileSync(resolve(outDir, `${DATE}.txt`), text)
  writeFileSync(
    resolve(outDir, `${DATE}.json`),
    JSON.stringify({ date: DATE, excludeFacilityKeys: EXCLUDE_FACILITY_KEYS, gate, selection, rows }, null, 2) + '\n',
  )

  if (JSON_OUT) {
    console.log(JSON.stringify({ date: DATE, gate, rows, excludeFacilityKeys: EXCLUDE_FACILITY_KEYS, summary: selection.summary }))
  } else {
    console.log(text)
    console.log(`保存: .devlogs/morning/sweets-today/${DATE}.txt / .json`)
  }
  process.exit(gate.passed ? 0 : 1)
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e))
  process.exit(1)
})
