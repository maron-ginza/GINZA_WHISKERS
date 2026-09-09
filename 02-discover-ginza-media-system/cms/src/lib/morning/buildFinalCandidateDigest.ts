// GINZA WHISKERS / Project 02（2026-09-05、記事生成レディ最終候補ダイジェスト）
//
// 既存の A/B/C 判定（assessCandidate.ts）はそのまま・無変更で使い、その上に
// 「マロンが1件選べば、そのまま記事生成へ進める品質」を満たすための追加ゲートを重ねる：
//
//   1. 当日の一次情報／公式情報の取得に成功したものだけを採用する
//      （digestMeta.officialFetch.ok === true が必須。403・タイムアウト・取得エラーは除外）
//   2. 開催終了・開催日不明・場所不明・既出重複は除外する（理由つき）
//   3. 同一施設・同一ドメインは上限2件
//   4. 5候補を提示する場合は原則4カテゴリー以上に分散させる（データが無ければ無理に埋めない）
//   5. 品質条件を満たす候補が5件未満なら水増ししない
//
// 純粋関数・AI 呼び出しなし・DB 書き込みなし。

import { rankAssessments } from './buildMorningReport'
import { buildEditorialBrief } from './buildEditorialBrief'
import type {
  CandidateAssessment,
  ExcludedDigestEntry,
  FinalCandidateDigest,
  FinalCandidateEntry,
} from './types'

export interface BuildFinalCandidateDigestOptions {
  now?: Date
  /** 最終候補の最大件数（既定 5） */
  maxCandidates?: number
  /** 同一施設・同一ドメインの上限件数（既定 2） */
  facilityCap?: number
  /** 5候補提示時に目指すカテゴリー分散の目標（既定 4） */
  minCategoriesTarget?: number
}

/**
 * 会場（venue）を「既取得データ」から優先順に解決する（2026-09-10）。
 * A/B/C 判定（assessCandidate → evaluateReadyGate）は ready ArticleFacts の会場情報を
 * 見て A にするのに、ダイジェストは digestMeta.venue（＝DiscoveredContent.venue 列のみ）
 * しか見ておらず、GINZA SIX ショップニュース等（scraper が venue 列を埋めない）で
 * 「会場不明」で落ちていた（DC #370）。判定経路と同じソースを同じ順で参照する。
 *   1. digestMeta.venue（DiscoveredContent.venue）
 *   2. ready ArticleFacts の venues[0].place
 *   3. ready ArticleFacts の venues[0].name
 *   4. ready ArticleFacts の areaLead
 *   5. productExtraction.fields.salesLocation（product_news）
 *   6. extraction.fields.venue（event）
 */
export function resolveDigestVenue(a: CandidateAssessment): string {
  const dm = a.digestMeta
  const candidates: (string | null | undefined)[] = [
    dm?.venue,
    dm?.factsVenuePlace,
    dm?.factsVenueName,
    dm?.factsAreaLead,
    a.productExtraction?.fields.salesLocation,
    a.extraction?.fields.venue,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return ''
}

/**
 * sale / product_news は evaluateReadyGate が会期・会場を必須にしない
 * （店頭取扱商品には「会期」「会場」の概念が無い）。ダイジェストの除外ゲートも
 * これに合わせ、開催日・会場の一律必須を外す。generic は会場のみ免除（会期は必須）。
 */
function isSaleLike(a: CandidateAssessment): boolean {
  return a.templateType === 'sale' || a.factKind === 'product_news'
}
function venueGateApplies(a: CandidateAssessment): boolean {
  return !isSaleLike(a) && a.templateType !== 'generic'
}
function periodGateApplies(a: CandidateAssessment): boolean {
  return !isSaleLike(a)
}

function facilityBucketOf(a: CandidateAssessment): string {
  const dm = a.digestMeta
  if (dm?.facilityKey) return dm.facilityKey
  // 施設キーが解決できない場合も「不明」1件として扱う（同一「不明」同士も上限の対象にする）
  return `unresolved:${(resolveDigestVenue(a) || a.sourceName || '').trim() || 'unknown'}`
}

export function buildFinalCandidateDigest(
  assessments: CandidateAssessment[],
  opts: BuildFinalCandidateDigestOptions = {},
): FinalCandidateDigest {
  const now = opts.now ?? new Date()
  const maxCandidates = opts.maxCandidates ?? 5
  const facilityCap = opts.facilityCap ?? 2
  const minCategoriesTarget = opts.minCategoriesTarget ?? 4

  const excluded: ExcludedDigestEntry[] = []
  const eligible: CandidateAssessment[] = []

  for (const a of assessments) {
    const dm = a.digestMeta
    if (a.verdict !== 'A') {
      excluded.push({
        discoveredContentId: a.discoveredContentId,
        title: a.displayTitle,
        reason: `A判定でないため除外（${a.reasons.join(' / ') || a.verdict}）`,
      })
      continue
    }
    if (!dm) {
      excluded.push({
        discoveredContentId: a.discoveredContentId,
        title: a.displayTitle,
        reason: '当日の公式確認情報（digestMeta）が付与されていないため除外',
      })
      continue
    }
    if (!dm.officialFetch || dm.officialFetch.requested !== true || dm.officialFetch.ok !== true) {
      const detail =
        dm.officialFetch?.rejectedReason ??
        dm.officialFetch?.error ??
        (dm.officialFetch?.httpStatus ? `HTTP ${dm.officialFetch.httpStatus}` : '未取得（--fetch 対象外 or 取得前に重複除外）')
      excluded.push({
        discoveredContentId: a.discoveredContentId,
        title: a.displayTitle,
        reason: `一次情報・公式情報を当日取得できなかったため除外（${detail}）`,
      })
      continue
    }
    if (a.expired) {
      excluded.push({ discoveredContentId: a.discoveredContentId, title: a.displayTitle, reason: '開催終了済みのため除外' })
      continue
    }
    if (periodGateApplies(a) && (!a.eventPeriod || a.eventPeriod === '不明')) {
      excluded.push({ discoveredContentId: a.discoveredContentId, title: a.displayTitle, reason: '開催日が不明なため除外' })
      continue
    }
    if (venueGateApplies(a) && !resolveDigestVenue(a)) {
      excluded.push({ discoveredContentId: a.discoveredContentId, title: a.displayTitle, reason: '場所（会場）が不明なため除外' })
      continue
    }
    if (a.dedup.duplicate) {
      excluded.push({
        discoveredContentId: a.discoveredContentId,
        title: a.displayTitle,
        reason: `既出記事・既存下書きと重複のため除外（${a.dedup.signalSummary?.join(' / ') ?? '重複シグナルあり'}）`,
      })
      continue
    }
    eligible.push(a)
  }

  // 優先順位：開催が近い順 → 情報確認日時が新しい順 → id昇順（既存 rankAssessments と同一の考え方）
  const sorted = rankAssessments(eligible)

  const facilityCount = new Map<string, number>()
  const usedCategories = new Set<string>()
  const picked: CandidateAssessment[] = []
  const deferred: CandidateAssessment[] = []

  // パス1：まだ登場していないカテゴリーを優先しつつ、スコア順（開催近接・確認日時）を保って拾う
  for (const a of sorted) {
    if (picked.length >= maxCandidates) break
    const fk = facilityBucketOf(a)
    if ((facilityCount.get(fk) ?? 0) >= facilityCap) {
      deferred.push(a)
      continue
    }
    const cat = a.digestMeta?.category ?? null
    if (cat && usedCategories.has(cat)) {
      deferred.push(a)
      continue
    }
    picked.push(a)
    facilityCount.set(fk, (facilityCount.get(fk) ?? 0) + 1)
    if (cat) usedCategories.add(cat)
  }

  // パス2：残り枠を、施設上限だけ守って埋める（カテゴリー重複は許容。候補が無ければ水増ししない）
  for (const a of deferred) {
    if (picked.length >= maxCandidates) break
    const fk = facilityBucketOf(a)
    if ((facilityCount.get(fk) ?? 0) >= facilityCap) continue
    picked.push(a)
    facilityCount.set(fk, (facilityCount.get(fk) ?? 0) + 1)
    const cat = a.digestMeta?.category ?? null
    if (cat) usedCategories.add(cat)
  }

  // パス2でも施設上限のため拾えなかった候補を除外理由として記録
  const pickedIds = new Set(picked.map((a) => a.discoveredContentId))
  for (const a of deferred) {
    if (pickedIds.has(a.discoveredContentId)) continue
    excluded.push({
      discoveredContentId: a.discoveredContentId,
      title: a.displayTitle,
      reason: `同一施設・同一ドメインの上限（${facilityCap}件）に達したため除外`,
    })
  }

  const candidates: FinalCandidateEntry[] = picked.map((a) => {
    const dm = a.digestMeta!
    const resolvedVenue = resolveDigestVenue(a)
    const brief = buildEditorialBrief({
      displayTitle: a.displayTitle,
      venue: resolvedVenue || null,
      eventPeriod: a.eventPeriod,
      templateType: a.templateType ?? null,
      factKind: a.factKind ?? null,
      category: dm.category,
      contentType: null,
      uxType: null,
    })
    return {
      discoveredContentId: a.discoveredContentId,
      officialName: a.displayTitle,
      verifiedAt: a.verifiedAt ?? null,
      publishedAt: dm.publishedAt,
      eventPeriod: a.eventPeriod,
      venue: resolvedVenue || '不明',
      price: dm.priceHint ?? '確認できません（公式に価格表記なし／要確認）',
      sourceUrl: a.sourceUrl,
      sourceName: a.sourceName,
      facilityKey: dm.facilityKey,
      facilityLabel: dm.facilityLabel || '(不明)',
      category: dm.category,
      origin: dm.origin,
      brief,
    }
  })

  const categoryList = [...new Set(candidates.map((c) => c.category).filter((c): c is string => !!c))]
  const facilityCounts: Record<string, number> = {}
  for (const c of candidates) {
    const key = c.facilityLabel || '(施設不明)'
    facilityCounts[key] = (facilityCounts[key] ?? 0) + 1
  }

  const shortfall = candidates.length < maxCandidates

  return {
    generatedAt: now.toISOString(),
    candidates,
    excluded,
    diversitySummary: {
      categoriesUsed: categoryList.length,
      categoryList,
      facilityCounts,
      minCategoriesTarget,
      // 候補が5件未満のとき（＝水増ししない結果）は分散未達を「失敗」として報告しない
      achievedDiversity: shortfall ? true : categoryList.length >= minCategoriesTarget,
    },
    shortfall,
    evaluatedCount: assessments.length,
  }
}

// ─────────────────────────────────────────────────────────────
// 人間が読むテキスト整形（7:10 レポートへ追記する）
// ─────────────────────────────────────────────────────────────
function line(s = ''): string {
  return s + '\n'
}

export function renderFinalCandidateDigest(digest: FinalCandidateDigest): string {
  let s = ''
  s += line('════════════════════════════════════════════════')
  s += line('  Project 02 — 記事生成レディ最終候補ダイジェスト')
  s += line('  （マロンが1件選べば、そのまま記事生成へ進める品質のみを掲載）')
  s += line(`  生成: ${digest.generatedAt}`)
  s += line(`  評価対象: ${digest.evaluatedCount} 件 → 確定候補 ${digest.candidates.length} 件（水増しなし）`)
  s += line(
    `  カテゴリー分散: ${digest.diversitySummary.categoriesUsed} 種類` +
      `（${digest.diversitySummary.categoryList.join('・') || 'なし'}）` +
      `／目標 ${digest.diversitySummary.minCategoriesTarget} 種類以上` +
      `${digest.diversitySummary.achievedDiversity ? '（達成）' : '（未達・データ制約のため無理に埋めていません）'}`,
  )
  s += line('════════════════════════════════════════════════')

  if (digest.candidates.length === 0) {
    s += line()
    s += line('  当日の公式確認・必須情報すべてを満たす候補は 0 件です。水増しせず「候補なし」を正常結果として扱います。')
  }

  digest.candidates.forEach((c, i) => {
    s += line()
    s += line(`【確定候補 ${i + 1}】 DC #${c.discoveredContentId}（${c.origin === 'approved' ? '承認済み' : '推奨〈未承認・admin承諾が必要〉'}）`)
    s += line(`  正式名称      : ${c.officialName}`)
    s += line(`  情報確認日    : ${c.verifiedAt ?? '（未記録）'}`)
    s += line(`  公開日        : ${c.publishedAt ?? '確認できません'}`)
    s += line(`  開催期間      : ${c.eventPeriod}`)
    s += line(`  場所          : ${c.venue}`)
    s += line(`  価格          : ${c.price}`)
    s += line(`  公式URL       : ${c.sourceUrl}`)
    s += line(`  情報源        : ${c.sourceName}`)
    s += line(`  カテゴリー／施設: ${c.category ?? '未確定'} ／ ${c.facilityLabel}`)
    s += line('  ── 20代後半〜30代女性への適合理由 ──')
    s += line(`    ${c.brief.targetFitReason}`)
    s += line('  ── GINZA WHISKERS独自の切り口 ──')
    s += line(`    ${c.brief.ginzaWhiskersAngle}`)
    s += line('  ── タイトル案 ──')
    c.brief.titleCandidates.forEach((t, ti) => (s += line(`    ${ti + 1}. ${t}`)))
    s += line('  ── 導入案 ──')
    s += line(`    ${c.brief.introDraft}`)
    s += line('  ── 記事構成案 ──')
    c.brief.structureOutline.forEach((st, si) => (s += line(`    ${si + 1}. ${st}`)))
    s += line(`  推奨記事量    : ${c.brief.recommendedLength.charRange}（${c.brief.recommendedLength.reason}）`)
    s += line(
      `  無料／有料候補: ${c.brief.payFreeCandidate.type === 'paid_candidate' ? '有料候補' : '無料'} — ${c.brief.payFreeCandidate.reason}`,
    )
    if (c.origin === 'inbox-recommended')
      s += line('  ※ この候補はまだ curationStatus=approved ではありません。記事生成前に admin で承諾してください。')
  })

  s += line()
  s += line(`■ 除外候補（${digest.excluded.length} 件・理由つき）`)
  if (digest.excluded.length === 0) s += line('  なし')
  else digest.excluded.forEach((e) => (s += line(`  - DC #${e.discoveredContentId} ${e.title}: ${e.reason}`)))

  s += line()
  s += line('（このダイジェストは読み取り専用。DB書き込み・記事生成・note投稿・課金は行っていません。')
  s += line(' タイトル案・導入案・構成案は決定的テンプレートによるたたき台であり、マロンの編集判断を代替しません。')
  s += line(' 「推奨〈未承認〉」の候補は curationStatus=inbox のまま——このレポートは approve しません。）')
  return s
}
