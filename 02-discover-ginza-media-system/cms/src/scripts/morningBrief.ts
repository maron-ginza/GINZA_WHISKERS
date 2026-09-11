// GINZA WHISKERS / Project 02（2026-09-11）— 朝刊ブリーフ（1画面・読み取り専用）。
//
//   ./p2 morning-brief [--limit=N] [--json]
//
// 本日の公開候補を「①ビューティー ②グルメ（スイーツ含む）③文化・アート」各1本で選び、
// 候補要約・必須 ArticleFacts（12項目）・公式出典 を1画面へまとめる。
// マロンの操作は「承認／保留／却下」の1回だけ（末尾の admin URL）。
//
// **DB 書き込み・AI 呼び出し・課金・approve・note/Chrome 操作は一切しない。**
// 推測でデータを補完しない——ArticleFacts / DiscoveredContent に無い項目は「公式記載なし」。

import { getPayload } from 'payload'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import config from '../payload.config'
import { assessInboxPool } from '../lib/pipeline/assessInboxPool'
import { selectRecommendedThemes, loadSelectThemesConfigFromEnv } from '../lib/pipeline/selectRecommendedThemes'
import { buildAdminCandidateReviewUrl } from '../lib/pipeline/adminCandidateUrl'
import { resolveBusinessDate, tokyoStartOfDay } from '../lib/util/businessDate'
import {
  buildMorningBrief,
  type BriefCandidateInput,
  type BriefFacts,
} from '../lib/pipeline/morningBriefSelect'

const argv = process.argv.slice(2)
const JSON_OUT = argv.includes('--json')
const limArg = argv.find((a) => a.startsWith('--limit='))
const LIMIT = limArg ? Math.max(20, Number(limArg.split('=')[1]) || 200) : 200
const DATE = resolveBusinessDate((argv.find((a) => a.startsWith('--date=')) ?? '').split('=')[1])

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
  const alreadyDrafted = new Set<number>()
  if (dcIds.length) {
    const prov = await payload.find({
      collection: 'articles',
      where: { 'editorialProvenance.discoveredContentSource': { in: dcIds } },
      limit: 500,
      depth: 1,
      overrideAccess: true,
    })
    for (const a of prov.docs as unknown as Record<string, unknown>[]) {
      for (const p of (Array.isArray(a.editorialProvenance) ? a.editorialProvenance : []) as Record<string, unknown>[]) {
        const ref = p.discoveredContentSource
        const id = typeof ref === 'object' && ref ? Number((ref as { id?: number }).id) : Number(ref)
        if (Number.isFinite(id)) alreadyDrafted.add(id)
      }
    }
  }

  // 3. 既存 ArticleFacts（DB）
  const factsByDc = new Map<number, Record<string, unknown>>()
  if (dcIds.length) {
    const af = await payload.find({
      collection: 'article-facts',
      where: { discoveredContent: { in: dcIds } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })
    for (const f of af.docs as unknown as Record<string, unknown>[]) {
      const ref = f.discoveredContent
      const id = typeof ref === 'object' && ref ? Number((ref as { id?: number }).id) : Number(ref)
      if (Number.isFinite(id)) factsByDc.set(id, f)
    }
  }

  // 4. 純粋モジュール用の入力へ変換
  const briefInputs: BriefCandidateInput[] = pool.map((e) => {
    const c = e.candidate
    const f = factsByDc.get(c.discoveredContentId)
    return {
      dcId: c.discoveredContentId,
      title: c.title,
      displayTitle: c.displayTitle ?? null,
      scoreTotal: e.scores.total,
      categoryKey: e.categoryKey ?? null,
      categoryBasis: e.categoryBasis ?? null,
      facilityKey: e.facilityKey ?? null,
      facilityLabel: e.facilityLabel,
      sourceName: c.sourceName,
      sourceUrl: c.sourceUrl,
      venue: c.venue ?? null,
      eventPeriod: c.eventPeriod ?? null,
      eventStartAt: (c.eventStartAt as string | null) ?? null,
      eventEndAt: (c.eventEndAt as string | null) ?? null,
      verifiedAt: c.verifiedAt ?? null,
      readiness: e.readiness,
      targetFit: c.targetFit ?? null,
      targetFitReason: c.targetFitReason ?? null,
      targetFitCompass: c.targetFitCompass ?? null,
      alreadyDrafted: alreadyDrafted.has(c.discoveredContentId),
      duplicate: !!c.duplicate,
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
  L(`■ 本日の確定: ${brief.filledCount}／3 領域`)
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
      },
      null,
      2,
    ) + '\n',
  )

  if (JSON_OUT) {
    console.log(JSON.stringify({ date: DATE, filledCount: brief.filledCount, pickedDcIds: brief.pickedDcIds, approveUrl, buckets: brief.buckets }))
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
