// GINZA WHISKERS / Project 02（2026-09-11）— 朝刊ブリーフの選定・整形（純粋・AI/DB/ネットワークなし）。
//
// 目的：本日の公開候補を「①ビューティー ②グルメ（スイーツ含む）③文化・アート」各1本で
// 選び、各候補について必須 ArticleFacts（12項目）・Editorial Compass・選定理由を1画面へ
// まとめる。**推測でデータを補完しない**——ArticleFacts / DiscoveredContent に無い項目は
// すべて「公式記載なし」（検証状態は「未確認」）とする。
//
// 選定条件（マロン指示・2026-09-11）：
//   ・コアターゲット＝20代後半〜30代女性。Editorial Compass かわいい20／上質30／
//     自分を整える25／新しい発見15／少し背伸び10。
//   ・18カテゴリー全体の過去掲載数を参照して偏りを補正（scoreTotal に反映済みの前提）。
//   ・GINZA SIX・銀座三越・松屋銀座など特定施設への連続集中を自動回避。
//   ・同一イベント・同一商品・同一URL・既に Article 化済みの候補は除外。

import { bucketForCategory, CORE_DAILY_BUCKETS } from './dailySelectionSupport'

export const CORE_COMPASS_WEIGHT = { kawaii: 20, joshitsu: 30, totonoeru: 25, hakken: 15, senobi: 10 } as const

export const FACT_NOT_STATED = '公式記載なし'
export const FACT_UNVERIFIED = '未確認'

/** 特定施設への連続集中を避ける対象（キーワード）。 */
const CONCENTRATED_FACILITY_RE = /ginza[ _-]?six|銀座シックス|ギンザ ?シックス|銀座三越|三越|松屋銀座|松屋/i

export interface BriefCandidateInput {
  dcId: number
  title: string
  displayTitle?: string | null
  /** selectRecommendedThemes の最終スコア（偏り補正込み） */
  scoreTotal: number
  categoryKey: string | null
  categoryBasis?: string | null
  facilityKey: string | null
  facilityLabel: string
  sourceName: string
  sourceUrl: string
  venue?: string | null
  eventPeriod?: string | null
  eventStartAt?: string | null
  eventEndAt?: string | null
  verifiedAt?: string | null
  readiness: string
  targetFit?: number | null
  targetFitReason?: string | null
  targetFitCompass?: { kawaii: number; joshitsu: number; totonoeru: number; hakken: number; senobi: number } | null
  /** 既存 ArticleFacts（DB。無ければ undefined） */
  facts?: BriefFactsInput
  /** true なら「既に Article / note下書き 化済み」＝候補から除外 */
  alreadyDrafted?: boolean
  /** dedup：同一URL・同一イベント重複の検出結果 */
  duplicate?: boolean
  /** 既公開テーマ（全公開履歴）と重複＝候補から除外（同一URL/DC＋意味的重複） */
  alreadyPublished?: boolean
  /** 既公開重複の理由（表示用） */
  publishedReason?: string | null
  /** 公式URL・開催期間・場所・内容がすべて確認できるか。false は最終候補に上げない（推測補完しない） */
  finalEligible?: boolean
  /** 公式情報で未確認の項目（表示用） */
  officialMissing?: string[] | null
}

export interface BriefFactsInput {
  enrichmentStatus?: string | null
  primaryCategory?: string | null
  templateType?: string | null
  eventName?: string | null
  whatHappens?: string | null
  priceText?: string | null
  eventDate?: string | null
  areaLead?: string | null
  applyRequired?: boolean | null
  applyDeadline?: string | null
  saleAvailability?: string | null
  officialInfoNote?: string | null
  humanReviewedAt?: string | null
  excerpt?: string | null
}

export interface BriefFacts {
  正式名称: string
  概要: string
  価格: string
  '開催／販売期間': string
  '購入／参加条件': string
  場所: string
  公式URL: string
  出典名: string
  出典確認日: string
  '18カテゴリー': string
  'Editorial Compass': string
  選定理由: string
  /** 公式記載なし として扱った項目名の一覧 */
  notStatedFields: string[]
}

export interface BriefBucketResult {
  bucketKey: string
  bucketLabel: string
  /** null＝該当候補なし（推測補完しない） */
  pick: (BriefCandidateInput & { facts12: BriefFacts }) | null
  reasonIfEmpty: string | null
  /** このバケットで検討したが外した候補（理由つき） */
  considered: { dcId: number; title: string; skipped: string }[]
}

export interface BuildBriefResult {
  buckets: BriefBucketResult[]
  pickedDcIds: number[]
  /** 施設が重複した等の警告 */
  warnings: string[]
  filledCount: number
}

function clean(s: string | null | undefined): string {
  return (s ?? '').toString().trim()
}

/** Editorial Compass を「かわいい X ／ 上質 Y ／ …／ 主軸: Z」の1行に整形（重みは固定 20/30/25/15/10）。 */
export function formatEditorialCompass(
  compass: BriefCandidateInput['targetFitCompass'],
): string {
  if (!compass) return `${FACT_NOT_STATED}（適合語の反応なし）`
  const w = CORE_COMPASS_WEIGHT
  const scaled = {
    かわいい: compass.kawaii * w.kawaii,
    上質: compass.joshitsu * w.joshitsu,
    自分を整える: compass.totonoeru * w.totonoeru,
    新しい発見: compass.hakken * w.hakken,
    少し背伸び: compass.senobi * w.senobi,
  }
  const total = Object.values(scaled).reduce((a, b) => a + b, 0)
  const top = Object.entries(scaled).sort((a, b) => b[1] - a[1])[0]
  const parts = Object.entries(scaled).map(([k, v]) => `${k}${v.toFixed(0)}`)
  return `${parts.join('／')}（加重計 ${total.toFixed(0)}／主軸 ${top[1] > 0 ? top[0] : 'なし'}）`
}

/** 期間表示：ArticleFacts.eventDate → DC の start/end → いずれも無ければ「公式記載なし」。 */
function resolvePeriod(c: BriefCandidateInput): string {
  const fromFacts = clean(c.facts?.eventDate)
  if (fromFacts) return fromFacts
  const ep = clean(c.eventPeriod)
  if (ep && !/確認できません|未確認|不明/.test(ep)) return ep
  const st = clean(c.eventStartAt)
  const en = clean(c.eventEndAt)
  if (st || en) return `${st ? st.slice(0, 10) : '（開始）公式記載なし'} 〜 ${en ? en.slice(0, 10) : '（終了）公式記載なし'}`
  return FACT_NOT_STATED
}

function resolveConditions(c: BriefCandidateInput): string {
  const f = c.facts
  if (!f) return FACT_NOT_STATED
  const bits: string[] = []
  if (f.applyRequired === true) bits.push(`予約・申込：必要${clean(f.applyDeadline) ? `（締切 ${clean(f.applyDeadline)}）` : ''}`)
  else if (f.applyRequired === false) bits.push('予約・申込：不要')
  if (clean(f.saleAvailability)) bits.push(`販売状況：${clean(f.saleAvailability)}`)
  if (clean(f.officialInfoNote)) bits.push(clean(f.officialInfoNote))
  return bits.length ? bits.join(' ／ ') : FACT_NOT_STATED
}

/** 選定理由：カテゴリー・旬・target_fit・偏り補正の観点から機械生成（推測なし・数値と事実のみ）。 */
export function buildSelectionReason(c: BriefCandidateInput, bucketLabel: string): string {
  const bits: string[] = [`本日の3領域「${bucketLabel}」枠として選定`]
  if (c.categoryKey && c.categoryKey !== '未確定') bits.push(`18カテゴリー＝${c.categoryKey}（${c.categoryBasis === 'primaryCategory' ? 'ArticleFacts確定' : '明記'}）`)
  if (typeof c.targetFit === 'number') bits.push(`コアターゲット適合 ${c.targetFit}／100`)
  if (clean(c.targetFitReason)) bits.push(clean(c.targetFitReason))
  bits.push(`最終score ${c.scoreTotal.toFixed(3)}（施設・カテゴリーの偏り補正込み）`)
  bits.push(`情報源＝${c.sourceName}（特定施設への連続集中は自動回避の対象。他の推奨と施設が重複しないことを確認）`)
  if (c.readiness !== 'ready') bits.push(`ArticleFacts は ${c.readiness}（未確定項目は「公式記載なし」。承認後にマロンが公式で確定）`)
  return bits.join(' ／ ')
}

/** 候補1件 → 必須 ArticleFacts 12項目（無い項目は「公式記載なし」）。 */
export function assembleBriefFacts(c: BriefCandidateInput): BriefFacts {
  const f = c.facts
  const notStated: string[] = []
  const take = (label: string, v: string): string => {
    const t = clean(v)
    if (t) return t
    notStated.push(label)
    return FACT_NOT_STATED
  }

  const name = take('正式名称', clean(f?.eventName) || clean(c.displayTitle) || clean(c.title))
  // 概要は ArticleFacts.whatHappens のみ採用。DiscoveredContent.excerpt はサイトナビ由来の
  // ノイズが多く、事実としては使わない（推測補完しない＝無ければ「公式記載なし」）。
  const summary = take('概要', clean(f?.whatHappens))
  const price = take('価格', clean(f?.priceText))
  const period = resolvePeriod(c)
  if (period === FACT_NOT_STATED) notStated.push('開催／販売期間')
  const conditions = resolveConditions(c)
  if (conditions === FACT_NOT_STATED) notStated.push('購入／参加条件')
  const place = take('場所', clean(f?.areaLead) || clean(c.venue))
  const url = take('公式URL', clean(c.sourceUrl))
  const srcName = take('出典名', clean(c.sourceName))
  const verifiedAt = clean(f?.humanReviewedAt) || clean(c.verifiedAt)
  const verified = verifiedAt ? verifiedAt.slice(0, 10) : FACT_UNVERIFIED
  if (verified === FACT_UNVERIFIED) notStated.push('出典確認日')
  const cat = clean(f?.primaryCategory) || (c.categoryKey && c.categoryKey !== '未確定' ? c.categoryKey! : '')
  const category = cat || FACT_NOT_STATED
  if (category === FACT_NOT_STATED) notStated.push('18カテゴリー')

  return {
    正式名称: name,
    概要: summary,
    価格: price,
    '開催／販売期間': period,
    '購入／参加条件': conditions,
    場所: place,
    公式URL: url,
    出典名: srcName,
    出典確認日: verified,
    '18カテゴリー': category,
    'Editorial Compass': formatEditorialCompass(c.targetFitCompass),
    選定理由: '', // 呼び出し側で bucketLabel を渡して埋める
    notStatedFields: [...new Set(notStated)],
  }
}

/**
 * 候補プール → 3領域（ビューティー／グルメ・スイーツ／文化・アート）各1本を選ぶ。
 *  ・alreadyDrafted / duplicate は除外
 *  ・同一施設は2枠に跨がせない
 *  ・直近採用の施設（recentFacility）と同一なら次点へ
 *  ・特定施設（GINZA SIX／三越／松屋）が既に1枠に入っていたら、2枠目には別施設を優先
 *  ・該当なしのバケットは pick=null＋理由（推測補完しない）
 */
export function buildMorningBrief(
  candidates: BriefCandidateInput[],
  opts: { recentFacilities?: string[] } = {},
): BuildBriefResult {
  const recent = new Set((opts.recentFacilities ?? []).slice(0, 2).filter(Boolean))
  const buckets: BriefBucketResult[] = CORE_DAILY_BUCKETS.map((b) => ({
    bucketKey: b.key,
    bucketLabel: b.label,
    pick: null,
    reasonIfEmpty: null,
    considered: [],
  }))
  const warnings: string[] = []
  const usedFacilities = new Set<string>()
  let concentratedUsed = 0

  for (const bucket of buckets) {
    const coreBucket = CORE_DAILY_BUCKETS.find((b) => b.key === bucket.bucketKey)!
    // このバケットに該当する候補（カテゴリー確定のみ。未確定は推測しないので対象外）
    const pool = candidates
      .filter((c) => {
        const b = bucketForCategory(c.categoryKey)
        return b?.key === bucket.bucketKey
      })
      .sort((a, b) => b.scoreTotal - a.scoreTotal)

    if (pool.length === 0) {
      bucket.reasonIfEmpty = `該当なし：${coreBucket.label}に分類できる公式確認可能な候補が本日の承諾前プールに無い（推測でカテゴリーを付けない）。追加収集が必要。`
      continue
    }

    let picked: BriefCandidateInput | null = null
    for (const c of pool) {
      if (c.alreadyPublished) {
        bucket.considered.push({
          dcId: c.dcId,
          title: c.displayTitle ?? c.title,
          skipped: `既公開テーマとの重複（${c.publishedReason ?? '全公開履歴と一致'}）`,
        })
        continue
      }
      if (c.finalEligible === false) {
        bucket.considered.push({
          dcId: c.dcId,
          title: c.displayTitle ?? c.title,
          skipped: `公式情報の完全度不足（未確認: ${(c.officialMissing ?? ['公式URL/期間/場所/内容']).join('・')}）— 最終候補に上げない`,
        })
        continue
      }
      if (c.alreadyDrafted) {
        bucket.considered.push({ dcId: c.dcId, title: c.displayTitle ?? c.title, skipped: '既に Article／note下書き 化済み（重複）' })
        continue
      }
      if (c.duplicate) {
        bucket.considered.push({ dcId: c.dcId, title: c.displayTitle ?? c.title, skipped: '同一イベント／商品／URL の重複候補' })
        continue
      }
      const fk = c.facilityKey ?? c.facilityLabel
      if (fk && fk !== '(会場不明)' && usedFacilities.has(fk)) {
        bucket.considered.push({ dcId: c.dcId, title: c.displayTitle ?? c.title, skipped: `施設「${c.facilityLabel}」が他の枠と重複` })
        continue
      }
      if (fk && recent.has(fk) && pool.length > 1) {
        bucket.considered.push({ dcId: c.dcId, title: c.displayTitle ?? c.title, skipped: `直近の採用施設「${c.facilityLabel}」と同一（連続集中回避）— 次点を優先` })
        continue
      }
      const isConcentrated = CONCENTRATED_FACILITY_RE.test(`${c.facilityLabel} ${c.sourceName} ${c.venue ?? ''}`)
      if (isConcentrated && concentratedUsed >= 1 && pool.length > 1) {
        bucket.considered.push({ dcId: c.dcId, title: c.displayTitle ?? c.title, skipped: `GINZA SIX／三越／松屋 系が既に1枠。特定施設集中回避で次点を優先` })
        continue
      }
      picked = c
      if (isConcentrated) concentratedUsed += 1
      break
    }

    if (!picked) {
      // 全候補が除外条件に当たった＝実質「該当なし」
      bucket.reasonIfEmpty = `該当なし：${coreBucket.label}の候補は ${pool.length} 件あったが、すべて重複・施設集中・既記事化で除外（推測補完しない）。`
      continue
    }
    const fk = picked.facilityKey ?? picked.facilityLabel
    if (fk && fk !== '(会場不明)') usedFacilities.add(fk)
    const facts12 = assembleBriefFacts(picked)
    facts12.選定理由 = buildSelectionReason(picked, bucket.bucketLabel)
    bucket.pick = { ...picked, facts12 }
  }

  const pickedDcIds = buckets.filter((b) => b.pick).map((b) => b.pick!.dcId)
  if (concentratedUsed >= 2) warnings.push('GINZA SIX／三越／松屋 系が2枠以上を占めています。追加収集で分散してください。')
  if (pickedDcIds.length < 3) warnings.push(`本日確定できたのは ${pickedDcIds.length}／3 領域。残りは「該当なし」として報告（推測で埋めない）。`)

  return { buckets, pickedDcIds, warnings, filledCount: pickedDcIds.length }
}
