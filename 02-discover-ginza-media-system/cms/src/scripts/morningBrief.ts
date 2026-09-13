// GINZA WHISKERS / Project 02（2026-09-11、2026-09-13改訂）— 朝刊ブリーフ（1画面・読み取り専用）。
//
//   ./p2 morning-brief [--limit=N] [--json]
//
// 本日の公開候補を「①スイーツ・和菓子 ②グルメ ③ビューティー ④文化・アート」各1本で選び、
// 候補要約・必須 ArticleFacts（12項目）・公式出典 を1画面へまとめる（優先順位・バケット
// 定義は dailySelectionSupport.ts の CORE_DAILY_BUCKETS を正とする）。
// マロンの操作は「承認／保留／却下」の1回だけ（末尾の admin URL）。
//
// **DB 書き込み・AI 呼び出し・課金・approve・note/Chrome 操作は一切しない。**
// 推測でデータを補完しない——ArticleFacts / DiscoveredContent に無い項目は「公式記載なし」。

import { getPayload } from 'payload'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import config from '../payload.config'
import { assessInboxPool } from '../lib/pipeline/assessInboxPool'
import { selectRecommendedThemes, loadSelectThemesConfigFromEnv, evaluateSafetyGate, evaluateReadiness } from '../lib/pipeline/selectRecommendedThemes'
import { buildAdminCandidateReviewUrl } from '../lib/pipeline/adminCandidateUrl'
import { resolveBusinessDate, tokyoStartOfDay } from '../lib/util/businessDate'
import { loadPublishedThemes } from '../lib/publish/loadPublishedThemes'
import { matchPublishedTheme } from '../lib/publish/publishedThemes'
import {
  buildMorningBrief,
  type BriefCandidateInput,
  type BriefFacts,
} from '../lib/pipeline/morningBriefSelect'
import { deriveProvisionalCategory } from '../lib/pipeline/provisionalCategory'
import { resolveFacilityKey } from '../lib/curation/facilityKey'
import { selectSweetsCandidates, evaluateSweetsGate, type SweetsCandidateInput } from '../lib/pipeline/sweetsCandidateSelect'
import { loadAlreadyDraftedDcIds } from '../lib/curation/alreadyDrafted'
import { checkRecurringEventYearClaim } from '../lib/curation/recurringEventYearGuard'

const argv = process.argv.slice(2)
const JSON_OUT = argv.includes('--json')
const limArg = argv.find((a) => a.startsWith('--limit='))
// 既定200→400（2026-09-12）：情報源拡張（グルメ・スイーツ本格拡張、SOURCE LEDGER
// 36→46件）に伴い、1回のcrawlで新規/更新検知される候補が数百件規模になる日が
// 出てきたため、-detectedAt上位200件だけでは新規追加ソース由来の候補が評価対象
// ウィンドウから漏れる（実データで確認：limit=200では新規ブランド由来候補が
// ウィンドウ外、limit=500では評価対象に入りSWEETS生候補19件を検出）。実行コストは
// DB読み取りのみ（AI呼び出しなし）で400件でも実測1.5秒台のため、既定値を引き上げる。
// 既定400→1000（2026-09-13、朝刊実運用開始日に発見・修正）：スウィーツ公式情報
// Discovery層の稼働でinbox/approvedプールの規模が続けて増え続けており
// （実測：2026-09-13時点で1150件、うち559件がDC#388〈9/9に最後に変化・現在も
// 開催期間内で有効〉よりlastChangedAtが新しい）、limit=400では文化・アート等の
// 有効な既存候補まで評価ウィンドウから漏れ始めていることを実データで確認した。
// assessInboxPool側の上限（1000）まで引き上げる。DB読み取りのみでAI呼び出しは
// 無いため実行コストへの影響は小さい（実測：400件で数秒、1000件でも同オーダー）。
// 1000件を超えてなお漏れが再発する場合は、件数上限ではなく状態ベース
// （承諾前プール全件評価等）への設計変更を検討する。
const LIMIT = limArg ? Math.max(20, Number(limArg.split('=')[1]) || 1000) : 1000
const DATE = resolveBusinessDate((argv.find((a) => a.startsWith('--date=')) ?? '').split('=')[1])
// 2026-09-13追加：固定要件による施設の一時除外（例：本日はGINZA SIX・銀座 蔦屋書店を除外）。
// 既定は空＝従来どおり全施設を対象とする（恒久的な偏りにしない。都度の明示指定のみ）。
const excludeFacilityArg = argv.find((a) => a.startsWith('--exclude-facility='))?.split('=')[1] ?? process.env.SWEETS_EXCLUDE_FACILITY_KEYS ?? ''
const EXCLUDE_FACILITY_KEYS = excludeFacilityArg
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

async function main() {
  const payload = await getPayload({ config })
  const now = tokyoStartOfDay(DATE)

  // 1. 承諾前(inbox)＋承諾済み(approved) を評価してスコアリング
  const assessed = await assessInboxPool(payload, { now, statuses: ['inbox', 'approved'], limit: LIMIT })
  const cfg = loadSelectThemesConfigFromEnv()
  const sel = selectRecommendedThemes(assessed.candidates, { now, config: cfg, enableTargetFitRanking: true })
  const pool = [...sel.recommended, ...sel.spare]

  const dcIds = pool.map((e) => e.candidate.discoveredContentId)

  // 2. 既に Article／note下書き 化済みの DC（重複除外用）
  const alreadyDrafted = await loadAlreadyDraftedDcIds(payload, dcIds)

  // 2b. 既公開テーマ（全公開履歴：DB publishHistory ＋ .devlogs ＋ 手動シード）
  const publishedThemes = await loadPublishedThemes(payload, resolve(process.cwd(), '..'))

  // 2c. スウィーツ候補の安定収集（2026-09-11）：assessed.candidates 全体（top15プールに
  //     限らない）から SWEETS 分類の候補だけを評価し、毎朝最大3件を決定的に選ぶ。
  //     既に Article 化済みの DC も除外（トップ15プール限定の alreadyDrafted とは別に、
  //     全 assessed 候補ぶんを見る）。
  const allDcIds = assessed.candidates.map((c) => c.discoveredContentId)
  const alreadyDraftedAll = await loadAlreadyDraftedDcIds(payload, allDcIds)
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
      // 安全性 gate（verdict/期限切れ/銀座関連性/出典/種別/タイトル）に落ちる候補は
      // 公式情報不完全と同様に扱い、最終候補に上げない（推測で救わない）。
      const safetyFails = evaluateSafetyGate(c, cfg)
      // 2026-09-13追加：毎年開催の定例イベント（銀茶会等）が前年情報のまま今年の
      // 候補として扱われることを防ぐ（推測で年を補完しない）。
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
        publishedReason: pub.match ? pub.reason : alreadyDraftedAll.has(c.discoveredContentId) ? '既に Article 化済み' : null,
        // 2026-09-13追加：直近7日間の同一施設からの採用件数（施設偏重を防ぐsource diversity制御）
        facilityCount7d: fk.key ? (assessed.history.facilityKeyCounts[fk.key] ?? 0) : 0,
      }
    })
    .filter((x): x is SweetsCandidateInput => x != null)
  const sweetsSelection = selectSweetsCandidates(sweetsInputs, {
    now,
    excludeFacilityKeys: EXCLUDE_FACILITY_KEYS.length ? EXCLUDE_FACILITY_KEYS : undefined,
  })
  const sweetsGate = evaluateSweetsGate(sweetsSelection)

  // 3. 既存 ArticleFacts（DB）。2026-09-12：3領域選定を top15 プールに限らず
  //    assessed.candidates 全体から行うよう拡張したため、allDcIds を対象にする。
  const factsByDc = new Map<number, Record<string, unknown>>()
  if (allDcIds.length) {
    const af = await payload.find({
      collection: 'article-facts',
      where: { discoveredContent: { in: allDcIds } },
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

  // 4. 純粋モジュール用の入力へ変換。
  // 2026-09-12：3領域（ビューティー／グルメ・スイーツ／文化・アート）の選定を、
  // selectRecommendedThemes の「推奨+予備15件」（全カテゴリー横断の相対順位で
  // 上位に来ないと入らない）に限らず、assessed.candidates 全体（安全性gate通過分）
  // から行うよう拡張した——ART が母数を占有しやすく、BEAUTY 等の少数派カテゴリーが
  // 実在するのに top15 に一件も残らないケースがあったため（例：DC#246「花西子」が
  // 安全性gate・公式完全度とも問題ないのに top15 圏外で「該当なし」表示になっていた）。
  // scoreTotal は selectRecommendedThemes 本体の複雑な相対順位づけの代わりに、
  // targetFit（コアターゲット適合）＋coverageAdjust（不足カテゴリー／終了間近／
  // 施設集中の補正、assessInboxPool 側で算出済み）を組み合わせた簡易スコアを使う
  // （3領域ピック用の並び替えにのみ使用。他の表示・推奨+予備の件数には影響しない）。
  const briefInputs: BriefCandidateInput[] = assessed.candidates
    .map((c): BriefCandidateInput | null => {
      const safetyFails = evaluateSafetyGate(c, cfg)
      if (safetyFails.length > 0) return null
      const prov = deriveProvisionalCategory({
        primaryCategory: c.primaryCategory ?? null,
        title: c.title ?? '',
        venue: c.venue ?? '',
        templateType: c.templateType ?? null,
        contentType: c.contentType ?? undefined,
        excerpt: c.excerpt ?? undefined,
      })
      const fk = resolveFacilityKey({ venue: c.venue, sourceName: c.sourceName, sourceUrl: c.sourceUrl, title: c.title })
      const rd = evaluateReadiness(c)
      const f = factsByDc.get(c.discoveredContentId)
      const pub = matchPublishedTheme(
        {
          dcId: c.discoveredContentId,
          title: c.displayTitle ?? c.title,
          eventName: (f?.eventName as string) ?? (c.displayTitle ?? c.title),
          venue: c.venue ?? (f?.areaLead as string) ?? null,
          period: (f?.eventDate as string) ?? c.eventPeriod ?? null,
        },
        publishedThemes,
      )
      const scoreTotal = (c.targetFit ?? 0) / 100 + (c.coverageAdjust ?? 0)
      return {
        dcId: c.discoveredContentId,
        title: c.title,
        displayTitle: c.displayTitle ?? null,
        scoreTotal,
        categoryKey: prov.category,
        categoryBasis: prov.basis,
        facilityKey: fk.key,
        facilityLabel: fk.store || c.venue || '(会場不明)',
        sourceName: c.sourceName,
        sourceUrl: c.sourceUrl,
        venue: c.venue ?? null,
        eventPeriod: c.eventPeriod ?? null,
        eventStartAt: (c.eventStartAt as string | null) ?? null,
        eventEndAt: (c.eventEndAt as string | null) ?? null,
        verifiedAt: c.verifiedAt ?? null,
        readiness: rd.readiness,
        targetFit: c.targetFit ?? null,
        targetFitReason: c.targetFitReason ?? null,
        targetFitCompass: c.targetFitCompass ?? null,
        alreadyDrafted: alreadyDraftedAll.has(c.discoveredContentId),
        duplicate: !!c.duplicate,
        alreadyPublished: pub.match,
        publishedReason: pub.match ? pub.reason : null,
        finalEligible: c.finalEligible,
        officialMissing: c.officialMissing ?? null,
        facts: f
        ? {
            enrichmentStatus: (f.enrichmentStatus as string) ?? null,
            primaryCategory: (f.primaryCategory as string) ?? null,
            templateType: (f.templateType as string) ?? null,
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
            excerpt: (c.excerpt as string) ?? null,
          }
        : { excerpt: (c.excerpt as string) ?? null },
      }
    })
    .filter((x): x is BriefCandidateInput => x != null)

  const brief = buildMorningBrief(briefInputs, {
    recentFacilities: assessed.history.recentFacilitySequence,
  })

  // 5. 承認用の1操作（admin URL）— pick 済み DC のうち inbox のものだけ
  const inboxPicked = brief.buckets
    .filter((b) => b.pick)
    .map((b) => b.pick!.dcId)
  const approveUrl = inboxPicked.length
    ? buildAdminCandidateReviewUrl({
        baseUrl: process.env.CMS_URL || 'http://localhost:3000',
        dcIds: inboxPicked,
        curationStatus: 'inbox',
        limit: Math.max(inboxPicked.length, 10),
      })
    : null

  // 6. 出力
  const lines: string[] = []
  const L = (s = '') => lines.push(s)
  L(`=== 朝刊ブリーフ（morning-brief）  対象日 ${DATE}  読み取り専用・DB書き込みなし ===`)
  L(`承諾前(inbox)＋承諾済み(approved) 評価 ${assessed.assessed} 件（A ${assessed.abcCounts.A} / B ${assessed.abcCounts.B} / C ${assessed.abcCounts.C}） → gate通過 ${sel.gatePassed} → 推奨+予備 ${pool.length}`)
  L(`過去7日間の採用（approved ${assessed.history.approvedCount}件）／直近施設: ${assessed.history.recentFacilitySequence.slice(0, 5).join(' → ') || '（履歴なし）'}`)
  L('────────────────────────────────────────────')

  for (const b of brief.buckets) {
    L('')
    if (!b.pick) {
      L(`■ ${b.bucketLabel}：❌ ${b.reasonIfEmpty}`)
      if (b.considered.length) {
        L('   （検討したが外した候補）')
        for (const c of b.considered.slice(0, 5)) L(`     ・DC #${c.dcId}「${c.title}」→ ${c.skipped}`)
      }
      continue
    }
    const p = b.pick
    const F: BriefFacts = p.facts12
    L(`■ ${b.bucketLabel}：DC #${p.dcId}「${p.displayTitle ?? p.title}」`)
    L(`   施設: ${p.facilityLabel}  ／  情報源: ${p.sourceName}  ／  スコア ${p.scoreTotal.toFixed(3)}  ／  ArticleFacts: ${p.readiness}${p.facts?.enrichmentStatus ? `(${p.facts.enrichmentStatus})` : ''}`)
    L('   【必須 ArticleFacts（12項目・公式に無い項目は「公式記載なし」）】')
    L(`     1. 正式名称        : ${F.正式名称}`)
    L(`     2. 概要            : ${F.概要}`)
    L(`     3. 価格            : ${F.価格}`)
    L(`     4. 開催／販売期間  : ${F['開催／販売期間']}`)
    L(`     5. 購入／参加条件  : ${F['購入／参加条件']}`)
    L(`     6. 場所            : ${F.場所}`)
    L(`     7. 公式URL         : ${F.公式URL}`)
    L(`     8. 出典名          : ${F.出典名}`)
    L(`     9. 出典確認日      : ${F.出典確認日}`)
    L(`    10. 18カテゴリー     : ${F['18カテゴリー']}`)
    L(`    11. Editorial Compass: ${F['Editorial Compass']}`)
    L(`    12. 選定理由         : ${F.選定理由}`)
    if (F.notStatedFields.length) L(`     ※「公式記載なし／未確認」項目: ${F.notStatedFields.join(' , ')}（承認後にマロンが公式で確定。推測補完しない）`)
    if (b.considered.length) L(`   （このバケットで外した候補: ${b.considered.map((c) => `#${c.dcId}(${c.skipped})`).join(' ; ')}）`)
  }

  L('')
  L('────────────────────────────────────────────')
  L(`■ スウィーツ候補（SWEETS専用・毎朝最大3件・目標達成=${!sweetsSelection.shortfall}）`)
  if (EXCLUDE_FACILITY_KEYS.length) L(`   固定要件による施設除外: ${EXCLUDE_FACILITY_KEYS.join(', ')}（除外 ${sweetsSelection.summary.excludedFixedRule} 件）`)
  if (!sweetsGate.passed) {
    L('   🛑 GATE FAILED：本日の最優先カテゴリー（スイーツ・和菓子）が候補上位を占めていません')
    L(`      ${sweetsGate.reason}`)
  }
  if (sweetsSelection.candidates.length === 0) {
    L('   ❌ 本日は公式確認できるSWEETS候補がありません（不完全な候補で埋めない）')
  }
  for (const [i, sc] of sweetsSelection.candidates.entries()) {
    L(`   ${i + 1}. DC #${sc.dcId}「${sc.title}」`)
    L(`      施設: ${sc.facilityLabel ?? '不明'}／情報源: ${sc.sourceName}／会期: ${sc.eventPeriod ?? '確認できません'}`)
    L(`      ${sc.reason}／${sc.seasonalNote}`)
  }
  if (sweetsSelection.shortfall) {
    L(`   ⚠ ${sweetsSelection.shortfallReason}`)
    if (sweetsSelection.nextSourceTypesToExplore?.length) {
      L(`   → 次回優先して探索する情報源種別: ${sweetsSelection.nextSourceTypesToExplore.join(' / ')}`)
    }
  }
  L('')
  L('────────────────────────────────────────────')
  L(`■ 本日の確定: ${brief.filledCount}／${brief.buckets.length} 領域`)
  for (const w of brief.warnings) L(`   ⚠ ${w}`)
  L('')
  L('■ マロンの操作は次の1回だけ（承認／保留／却下）')
  if (approveUrl) {
    L('   [承認] 下記URLで3候補（inbox）を開く → 内容確認 → 全選択 → 一括編集 → curationStatus = approved')
    L(`   ${approveUrl}`)
  } else {
    L('   [承認] 本日は inbox の確定候補がありません（該当なしのため承認対象なし）')
  }
  L('   [保留] 何もしない（翌日の morning-brief で再評価される）')
  L('   [却下] 該当 DC を curationStatus = rejected にする（admin で個別 or 一括）')
  L('')
  L('■ 承認後：note下書きへの自動転記')
  L('   1) ./p2 draft-today --yes        （承認済み DC → Article(reviewStatus:draft) を CORE 角度で生成。AI課金あり・人間が明示実行）')
  L('   2) ./p2 night check <articleId>  （生成された Article を note 転記前チェック＝1画面・読み取り専用）')
  L('   3) ./p2 night package <articleId>（note-body.txt / note-draft.json を生成。マロンが note へ手動転記）')
  L('   ※ approve と draft-today（課金）は人間が実行。morning-brief 自体は生成も承認もしない。')

  const outDir = resolve(process.cwd(), '..', '.devlogs', 'morning', 'brief')
  mkdirSync(outDir, { recursive: true })
  const text = lines.join('\n') + '\n'
  writeFileSync(resolve(outDir, `${DATE}.txt`), text)
  writeFileSync(
    resolve(outDir, `${DATE}.json`),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        date: DATE,
        assessed: assessed.assessed,
        abcCounts: assessed.abcCounts,
        gatePassed: sel.gatePassed,
        history7d: assessed.history,
        filledCount: brief.filledCount,
        pickedDcIds: brief.pickedDcIds,
        approveUrl,
        buckets: brief.buckets.map((b) => ({
          bucketKey: b.bucketKey,
          bucketLabel: b.bucketLabel,
          pick: b.pick
            ? {
                dcId: b.pick.dcId,
                title: b.pick.displayTitle ?? b.pick.title,
                facility: b.pick.facilityLabel,
                source: b.pick.sourceName,
                scoreTotal: Number(b.pick.scoreTotal.toFixed(4)),
                readiness: b.pick.readiness,
                facts12: b.pick.facts12,
              }
            : null,
          reasonIfEmpty: b.reasonIfEmpty,
          considered: b.considered,
        })),
        warnings: brief.warnings,
        sweetsCandidates: {
          candidates: sweetsSelection.candidates,
          shortfall: sweetsSelection.shortfall,
          shortfallReason: sweetsSelection.shortfallReason,
          nextSourceTypesToExplore: sweetsSelection.nextSourceTypesToExplore,
          summary: sweetsSelection.summary,
          excludeFacilityKeys: EXCLUDE_FACILITY_KEYS,
          gate: sweetsGate,
        },
      },
      null,
      2,
    ) + '\n',
  )

  if (JSON_OUT) {
    console.log(
      JSON.stringify({
        date: DATE,
        filledCount: brief.filledCount,
        pickedDcIds: brief.pickedDcIds,
        approveUrl,
        buckets: brief.buckets,
        sweetsCandidates: sweetsSelection,
        sweetsGate,
      }),
    )
  } else {
    console.log(text)
    console.log(`保存: .devlogs/morning/brief/${DATE}.txt / .json`)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e))
  process.exit(1)
})
