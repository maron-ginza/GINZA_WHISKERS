import type { Payload } from 'payload'

import { CONTENT_TYPE_TO_PILLAR_NAME } from '../curation/contentTypeToPillar'
import { computeThemeBigramContainment } from '../curation/textSimilarity'
import {
  loadInterestMonetizationConfig,
  type InterestMonetizationConfig,
} from '../interestDiscovery/config'
import {
  computeInterestScoreFromRecords,
  type RawInterestThemeRecord,
} from '../interestDiscovery/computeInterestScore'
import {
  computeMonetizationMultiplier,
  type MonetizationResult,
} from '../interestDiscovery/monetizationScore'
import { normalizeThemeKey } from '../interestDiscovery/normalizeThemeKey'
import { resolvePillarHints } from '../interestDiscovery/pillarHint'
import { createMultiAngleDraftsFromDiscoveredContent } from './createMultiAngleDraftsFromDiscoveredContent'
import type { MultiAngleKey, ArticleVolume } from './generateMultiAngleArticleDrafts'

// Project 02-2 収益化②「興味関心 × 銀座 × GINZA WHISKERS視点 最大5本/日」
// オーケストレーション（2026-08-28、W_PAID=8 / C_MATCH=0.6 初期値確定を受けて実装）。
//
// 処理順（spec 固定）: A（Interest Discovery）→ B（Monetization Scoring）
//   → C（GINZA Transformation）→ D（Article Generation）→ 承認待ちへ
//
// - Phase A: 承認済み interest-themes ＋ 既存 computeInterestScore（式・weight・
//   decay は無変更）で topicInterestScore を得る。
// - Phase B（B2）: interest-themes.monetization.paidRatio を
//   monetizationMultiplier = clamp(1 + W_PAID×paidRatio, 1.0, MAX) に変換。
//   finalRankScore = topicInterestScore × monetizationMultiplier。
//   paidRatio 未取得 / サンプル過小なら乗数 1.0（初期段階でも暴れない fallback）。
// - Phase C（2段）:
//   段1 決定的プレマッチ — 承認済み DiscoveredContent のみを対象に
//     (1) 包含  (2) テーマ側 bigram 被覆率 ≥ C_MATCH（title のみ）
//     (3) pillar hint（keyword→収蔵室の exact 一致） のいずれかで候補化し、
//     editorialScore.total 最大を採用。候補ゼロ → deferred（銀座接続なし）。
//   段2 AI 最終判定 — createMultiAngleDraftsFromDiscoveredContent を
//     angles: ['interest','ginza_whiskers'] ＋ readerInterestTheme で呼ぶ。
//     両角度が include:false（＝関心テーマと元情報に自然な接点なし）なら
//     生成されず failure として報告（＝Phase C の最終判定）。
// - Phase D: 上記 AI 呼び出しがそのまま Article(reviewStatus: draft) を作る。
//   新規 AI ツールスキーマは追加していない（readerInterestTheme は user
//   メッセージへの注入のみ）。GINZA WHISKERS 視点は system プロンプト＋
//   ginza_whiskers 角度で担保。
// - 承認: 既存 Articles.ts beforeChange 人間承認ゲートをそのまま通る。
//
// 冪等性: 生成成功時に interest-themes.generatedArticles を紐付け、同一テーマ
// クラスタが既に生成済みならスキップ。加えて aiGeneratedBy の
// |interestTheme=<正規化テーマ> でも識別可能。

export interface RunInterestDrivenDraftsOptions {
  now?: Date
  /** 1日あたりの最大ドラフト本数（既定 config.maxDailyDrafts=5） */
  maxDrafts?: number
  /** W_PAID 上書き（9月Trial調整用。省略時は env / 既定 8） */
  wPaid?: number
  /** C_MATCH 上書き（9月Trial調整用。省略時は env / 既定 0.6） */
  cMatch?: number
  /** true の場合、選定計画のみ算出し AI 呼び出し・DB 書き込みを一切しない */
  dryRun?: boolean
  /** paidRatio が取得済みのテーマのみに絞る（既定 false） */
  strict?: boolean
}

interface MatchedDc {
  discoveredContentId: number
  title: string
  editorialScore: number | null
  /** 'inclusion' | 'containment' | 'pillar_hint' */
  matchMethod: string
}

interface RankedTheme {
  normalizedTheme: string
  originalTheme: string
  topicInterestScore: number
  sourceTypes: string[]
  paidRatio: number | null
  monetization: MonetizationResult
  finalRankScore: number
  nearDuplicateCandidates: string[]
}

export interface InterestDraftPlanRow {
  normalizedTheme: string
  originalTheme: string
  topicInterestScore: number
  paidRatio: number | null
  monetizationMultiplier: number
  monetizationNote: string | null
  finalRankScore: number
  matchedDc: MatchedDc | null
  status: 'selected' | 'deferred' | 'no_ginza_match' | 'already_generated' | 'strict_skipped'
  note: string | null
}

export interface RunInterestDrivenDraftsResult {
  dryRun: boolean
  strict: boolean
  maxDrafts: number
  wPaid: number
  cMatch: number
  approvedThemeRecords: number
  approvedThemeClusters: number
  approvedDiscoveredContent: number
  /** finalRankScore 降順の全クラスタ計画 */
  plan: InterestDraftPlanRow[]
  /** 実際に作成された Article ドラフト（dryRun 時は空） */
  createdDrafts: {
    articleId: number
    discoveredContentId: number
    interestTheme: string
    title: string
    angle: MultiAngleKey
    volume: ArticleVolume
  }[]
  /** テーマ単位の生成失敗（両角度 include:false ＝銀座接続不成立 / AIエラー等） */
  failures: { interestTheme: string; discoveredContentId: number | null; reason: string }[]
}

const INTEREST_ANGLES: MultiAngleKey[] = ['interest', 'ginza_whiskers']

function newestMonetization(
  rows: { monetization?: unknown }[],
): { paidRatio: number | null; sampleSize: number | null; isApproximate: boolean; capturedAt: string | null } {
  let best: { paidRatio: number | null; sampleSize: number | null; isApproximate: boolean; capturedAt: string | null } = {
    paidRatio: null,
    sampleSize: null,
    isApproximate: false,
    capturedAt: null,
  }
  for (const row of rows) {
    const m = row.monetization as
      | { paidRatio?: number | null; sampleSize?: number | null; isApproximate?: boolean; capturedAt?: string | null }
      | null
      | undefined
    if (!m || m.paidRatio === null || m.paidRatio === undefined) continue
    if (best.capturedAt === null || (m.capturedAt && m.capturedAt > best.capturedAt)) {
      best = {
        paidRatio: typeof m.paidRatio === 'number' ? m.paidRatio : null,
        sampleSize: typeof m.sampleSize === 'number' ? m.sampleSize : null,
        isApproximate: Boolean(m.isApproximate),
        capturedAt: m.capturedAt ?? null,
      }
    }
  }
  return best
}

export async function runInterestDrivenDraftsFromThemes(
  payload: Payload,
  options: RunInterestDrivenDraftsOptions = {},
): Promise<RunInterestDrivenDraftsResult> {
  const now = options.now ?? new Date()
  const dryRun = options.dryRun ?? false
  const strict = options.strict ?? false

  const baseConfig = loadInterestMonetizationConfig()
  const config: InterestMonetizationConfig = {
    ...baseConfig,
    wPaid: options.wPaid ?? baseConfig.wPaid,
    cMatch: options.cMatch ?? baseConfig.cMatch,
    maxDailyDrafts: options.maxDrafts ?? baseConfig.maxDailyDrafts,
  }
  const maxDrafts = config.maxDailyDrafts
  if (maxDrafts < 1) throw new Error(`maxDrafts は 1 以上を指定してください（現在: ${maxDrafts}）`)

  // === Phase A: 承認済み interest-themes → topicInterestScore ===
  const { docs: approvedThemeDocs } = await payload.find({
    collection: 'interest-themes',
    where: { status: { equals: 'approved' } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })

  const records: RawInterestThemeRecord[] = approvedThemeDocs.map((d) => ({
    theme: String(d.theme),
    sourceType: d.sourceType as RawInterestThemeRecord['sourceType'],
    confidence: d.confidence as RawInterestThemeRecord['confidence'],
    capturedAt: String(d.capturedAt),
  }))
  // 既存の Phase A 統合ロジック（式・weight・decay は無変更）を承認サブセットへ適用。
  const scoreRows = computeInterestScoreFromRecords(records, now)

  // 正規化テーマ → その承認済み行（monetization / generatedArticles 参照用）
  const rowsByNormalized = new Map<string, typeof approvedThemeDocs>()
  for (const d of approvedThemeDocs) {
    const key = normalizeThemeKey(String(d.theme))
    const bucket = rowsByNormalized.get(key)
    if (bucket) bucket.push(d)
    else rowsByNormalized.set(key, [d])
  }

  // === Phase B: monetizationMultiplier → finalRankScore ===
  const ranked: RankedTheme[] = scoreRows.map((row) => {
    const clusterRows = rowsByNormalized.get(row.normalizedTheme) ?? []
    const mon = newestMonetization(clusterRows)
    const monResult = computeMonetizationMultiplier(
      { paidRatio: mon.paidRatio, sampleSize: mon.sampleSize, isApproximate: mon.isApproximate },
      config,
    )
    return {
      normalizedTheme: row.normalizedTheme,
      originalTheme: row.originalTheme,
      topicInterestScore: row.totalInterestScore,
      sourceTypes: row.sourceTypes,
      paidRatio: mon.paidRatio,
      monetization: monResult,
      finalRankScore: row.totalInterestScore * monResult.multiplier,
      nearDuplicateCandidates: row.nearDuplicateCandidates,
    }
  })
  ranked.sort((a, b) => b.finalRankScore - a.finalRankScore)

  // テーマ近似クラスタの束ね（先勝ち＝finalRankScore 上位を残す）
  const themeKept: RankedTheme[] = []
  const collapsedInto = new Map<string, string>() // normalizedTheme → 代表 normalizedTheme
  for (const t of ranked) {
    const rep = themeKept.find(
      (k) => k.nearDuplicateCandidates.includes(t.normalizedTheme) || t.nearDuplicateCandidates.includes(k.normalizedTheme),
    )
    if (rep) {
      collapsedInto.set(t.normalizedTheme, rep.normalizedTheme)
    } else {
      themeKept.push(t)
    }
  }

  // === 承認済み DiscoveredContent（プレマッチ対象。approved のみ、方針2・3）===
  const { docs: approvedDcs } = await payload.find({
    collection: 'discovered-content',
    where: { curationStatus: { equals: 'approved' } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })

  // 二次冪等: aiGeneratedBy に |interestTheme=<key> を含む既存 Article
  const { docs: allArticles } = await payload.find({
    collection: 'articles',
    depth: 0,
    limit: 2000,
    overrideAccess: true,
  })
  const generatedThemeKeys = new Set<string>()
  for (const a of allArticles) {
    const gen = String((a as { aiGeneratedBy?: string }).aiGeneratedBy ?? '')
    const m = gen.match(/interestTheme=([^)]+)\)?$/)
    if (m) generatedThemeKeys.add(m[1])
  }

  const dcMatchMethod = (theme: string, dc: (typeof approvedDcs)[number]): string | null => {
    const key = normalizeThemeKey(theme)
    const title = normalizeThemeKey(String((dc as { title?: string }).title ?? ''))
    const excerpt = normalizeThemeKey(String((dc as { excerpt?: string }).excerpt ?? ''))
    if (key.length > 0 && (title.includes(key) || excerpt.includes(key))) return 'inclusion'
    if (computeThemeBigramContainment(key, title) >= config.cMatch) return 'containment'
    const hints = resolvePillarHints(theme)
    if (hints.length > 0) {
      const dcPillar =
        CONTENT_TYPE_TO_PILLAR_NAME[(dc as { contentType?: string }).contentType ?? 'other'] ?? '文化'
      if (hints.includes(dcPillar as (typeof hints)[number])) return 'pillar_hint'
    }
    return null
  }

  const dcScore = (dc: (typeof approvedDcs)[number]): number => {
    const v = (dc as { editorialScore?: { total?: number | null } }).editorialScore?.total
    return typeof v === 'number' ? v : -1
  }

  // === Phase C 段1: 各テーマ → 最良の承認済み DiscoveredContent ===
  const plan: InterestDraftPlanRow[] = []
  const usedDcIds = new Set<number>()
  const selectable: { theme: RankedTheme; dc: MatchedDc }[] = []

  for (const t of themeKept) {
    const alreadyGen =
      generatedThemeKeys.has(t.normalizedTheme) ||
      (rowsByNormalized.get(t.normalizedTheme) ?? []).some(
        (r) => Array.isArray((r as { generatedArticles?: unknown[] }).generatedArticles) && ((r as { generatedArticles?: unknown[] }).generatedArticles?.length ?? 0) > 0,
      )

    const basePlan: Omit<InterestDraftPlanRow, 'status' | 'note' | 'matchedDc'> = {
      normalizedTheme: t.normalizedTheme,
      originalTheme: t.originalTheme,
      topicInterestScore: Number(t.topicInterestScore.toFixed(4)),
      paidRatio: t.paidRatio,
      monetizationMultiplier: Number(t.monetization.multiplier.toFixed(4)),
      monetizationNote: t.monetization.fallbackReason,
      finalRankScore: Number(t.finalRankScore.toFixed(4)),
    }

    if (alreadyGen) {
      plan.push({ ...basePlan, matchedDc: null, status: 'already_generated', note: '既にこのテーマから記事ドラフト生成済み' })
      continue
    }
    if (strict && t.paidRatio === null) {
      plan.push({ ...basePlan, matchedDc: null, status: 'strict_skipped', note: '--strict: paidRatio 未取得のため除外' })
      continue
    }

    let best: MatchedDc | null = null
    for (const dc of approvedDcs) {
      const method = dcMatchMethod(t.originalTheme, dc)
      if (!method) continue
      const cand: MatchedDc = {
        discoveredContentId: Number(dc.id),
        title: String((dc as { title?: string }).title ?? '(無題)'),
        editorialScore: dcScore(dc) >= 0 ? dcScore(dc) : null,
        matchMethod: method,
      }
      if (!best || dcScore(dc) > (best.editorialScore ?? -1)) best = cand
    }

    if (!best) {
      plan.push({
        ...basePlan,
        matchedDc: null,
        status: 'no_ginza_match',
        note: '承認済み DiscoveredContent に接続できる候補が現時点でない',
      })
      continue
    }
    if (usedDcIds.has(best.discoveredContentId)) {
      plan.push({
        ...basePlan,
        matchedDc: best,
        status: 'deferred',
        note: `同一 DiscoveredContent #${best.discoveredContentId} へ上位テーマが先着したため繰り越し`,
      })
      continue
    }

    if (selectable.length < maxDrafts) {
      usedDcIds.add(best.discoveredContentId)
      selectable.push({ theme: t, dc: best })
      plan.push({ ...basePlan, matchedDc: best, status: 'selected', note: null })
    } else {
      plan.push({ ...basePlan, matchedDc: best, status: 'deferred', note: `1日あたり上限 ${maxDrafts} を超過したため繰り越し` })
    }
  }

  const result: RunInterestDrivenDraftsResult = {
    dryRun,
    strict,
    maxDrafts,
    wPaid: config.wPaid,
    cMatch: config.cMatch,
    approvedThemeRecords: approvedThemeDocs.length,
    approvedThemeClusters: scoreRows.length,
    approvedDiscoveredContent: approvedDcs.length,
    plan,
    createdDrafts: [],
    failures: [],
  }

  if (dryRun) return result

  // === Phase C 段2 ＋ Phase D: 選定 (theme, dc) を multi-angle で記事化 ===
  for (const { theme, dc } of selectable) {
    if (result.createdDrafts.length >= maxDrafts) break
    try {
      const { createdArticles } = await createMultiAngleDraftsFromDiscoveredContent(
        payload,
        dc.discoveredContentId,
        {
          angles: INTEREST_ANGLES,
          readerInterestTheme: theme.originalTheme,
          interestThemeKey: theme.normalizedTheme,
        },
      )
      if (createdArticles.length === 0) {
        result.failures.push({
          interestTheme: theme.originalTheme,
          discoveredContentId: dc.discoveredContentId,
          reason: 'interest / ginza_whiskers 角度がどちらも生成されませんでした（AI判定で銀座接続不成立の可能性）',
        })
        continue
      }
      for (const created of createdArticles) {
        result.createdDrafts.push({
          articleId: created.id,
          discoveredContentId: dc.discoveredContentId,
          interestTheme: theme.originalTheme,
          title: created.title,
          angle: created.angle,
          volume: created.volume,
        })
      }
      // 冪等: このテーマクラスタの全承認行に generatedArticles を紐付ける
      const articleIds = createdArticles.map((c) => c.id)
      for (const row of rowsByNormalized.get(theme.normalizedTheme) ?? []) {
        const existing = ((row as { generatedArticles?: (number | { id?: number })[] }).generatedArticles ?? []).map(
          (x) => (typeof x === 'object' && x !== null ? Number(x.id) : Number(x)),
        )
        await payload.update({
          collection: 'interest-themes',
          id: row.id,
          overrideAccess: true,
          data: { generatedArticles: Array.from(new Set([...existing, ...articleIds])) },
        })
      }
    } catch (err) {
      result.failures.push({
        interestTheme: theme.originalTheme,
        discoveredContentId: dc.discoveredContentId,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}
