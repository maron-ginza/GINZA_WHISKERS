// GINZA WHISKERS / Project 02 — CROSS CULTURE 派生記事の生成オーケストレーション（2026-09-04）
//
// CROSS CULTURE FILTER → 派生記事候補生成 の「接続」部分。既存の記事生成
// （draft-today の CORE / 収益化②）には一切触らず、**別の候補**として
// CROSS CULTURE 派生記事の下書きを作る。
//
//   ・既定は dry-run：FILTER 結果から派生プランと注入プロンプトを組み立てて返すだけ。
//     DB 書き込みなし・AI 呼び出しなし・課金なし。
//   ・live（dryRun:false）：selectedMarkets（既定1市場）ごとに
//     createMultiAngleDraftsFromDiscoveredContent を ginza_whiskers 角度＋
//     crossCultureContext 付きで呼び、reviewStatus:draft の Article を作る
//     （通常記事は上書きしない・別 Article 行・aiGeneratedBy に |crossCulture=<market>）。
//   ・FILTER が skipped / 派生なし のときは何も生成しない（通常フロー継続）。
//   ・例外は握りつぶし、mode='skipped' で返す（Project 02 本体を止めない）。

import type { Payload } from 'payload'

import {
  getOrComputeCrossCulture,
  buildCrossCultureDerivativePlan,
  type DerivativePlan,
  type DerivativeConfirmedFact,
} from '../crossCulture'
import { createMultiAngleDraftsFromDiscoveredContent } from './createMultiAngleDraftsFromDiscoveredContent'

export interface CreateCrossCultureDerivativeOptions {
  /** 既定 true（DB 書き込みなし・AI 呼び出しなし） */
  dryRun?: boolean
  now?: Date
  /** 複数市場 >=70 でも取るのはこの数まで（既定 1） */
  maxMarkets?: number
  /** 特定市場に限定（--market=France） */
  onlyMarket?: string
  /** CROSS CULTURE FILTER キャッシュを無視して再計算 */
  force?: boolean
}

export interface CrossCultureDerivativeCreated {
  articleId: number
  market: string
  title: string
  articlePotential: 'paid' | 'free'
  warnings?: string[]
}

export interface CreateCrossCultureDerivativeResult {
  discoveredContentId: number | string
  mode: 'derivative' | 'none' | 'skipped'
  reason: string
  plan: DerivativePlan
  /** dry-run で「live なら渡すはずの注入プロンプト」 */
  dryRunPreview: { market: string; wouldCallGenerator: boolean; promptInjection: string }[]
  createdArticles: CrossCultureDerivativeCreated[]
  /** live 生成時のエラー（市場ごと）。1件失敗しても他は続行 */
  generationErrors: { market: string; error: string }[]
}

/** 既存 Article の editorialProvenance（confirmed）＋ ArticleFacts の根拠事実を集める */
async function collectConfirmedFacts(
  payload: Payload,
  dcId: number | string,
): Promise<DerivativeConfirmedFact[]> {
  const facts: DerivativeConfirmedFact[] = []
  try {
    const arts = await payload.find({
      collection: 'articles',
      where: { 'editorialProvenance.discoveredContentSource': { equals: Number(dcId) } },
      limit: 20,
      depth: 0,
      overrideAccess: true,
    })
    for (const a of arts.docs as unknown as Record<string, unknown>[]) {
      const prov = Array.isArray(a.editorialProvenance) ? (a.editorialProvenance as Record<string, unknown>[]) : []
      for (const p of prov) {
        if (p.verificationStatus === 'confirmed' && typeof p.fact === 'string' && p.fact.trim()) {
          facts.push({
            fact: p.fact.trim(),
            factType: (p.factType as string | null) ?? null,
            sourceUrl: (p.sourceUrl as string | null) ?? null,
            verifiedAt: (p.verifiedAt as string | null) ?? null,
          })
        }
      }
    }
  } catch {
    /* Article 未作成でも継続 */
  }
  try {
    const af = await payload.find({
      collection: 'article-facts',
      where: { discoveredContent: { equals: Number(dcId) } },
      limit: 3,
      depth: 0,
      overrideAccess: true,
    })
    for (const f of af.docs as unknown as Record<string, unknown>[]) {
      const spf = Array.isArray(f.sourceProvenanceFacts) ? (f.sourceProvenanceFacts as Record<string, unknown>[]) : []
      for (const s of spf) {
        if (
          (s.verificationStatus === 'confirmed' || s.confirmationStatus === 'confirmed') &&
          typeof s.fact === 'string' &&
          s.fact.trim()
        ) {
          facts.push({
            fact: s.fact.trim(),
            factType: (s.factType as string | null) ?? null,
            sourceUrl: (s.sourceUrl as string | null) ?? null,
          })
        }
      }
    }
  } catch {
    /* ArticleFacts なしでも継続 */
  }
  // 重複除去
  const seen = new Set<string>()
  return facts.filter((f) => {
    const k = f.fact
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export async function createCrossCultureDerivativeDrafts(
  payload: Payload,
  discoveredContentId: number | string,
  options: CreateCrossCultureDerivativeOptions = {},
): Promise<CreateCrossCultureDerivativeResult> {
  const dryRun = options.dryRun ?? true
  const now = options.now ?? new Date()

  const emptyPlan: DerivativePlan = {
    discoveredContentId,
    mode: 'none',
    filterUnavailable: true,
    reason: '',
    selectedMarkets: [],
    editorialOnlyMarkets: [],
    excludedMarkets: [],
  }

  try {
    const doc = (await payload.findByID({
      collection: 'discovered-content',
      id: discoveredContentId,
      depth: 1,
    })) as unknown as Record<string, unknown>

    const ss = doc.sourceSite as { name?: string } | string | null
    const sourceName = ss && typeof ss === 'object' ? (ss.name ?? null) : ((ss as string | null) ?? null)

    // ArticleFacts（primaryCategory / templateType ＋ 構造化テキスト）
    let primaryCategory: string | null = null
    let templateType: string | null = null
    let factsText: string | null = null
    try {
      const af = await payload.find({
        collection: 'article-facts',
        where: { discoveredContent: { equals: Number(discoveredContentId) } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const f = af.docs[0] as unknown as Record<string, unknown> | undefined
      primaryCategory = (f?.primaryCategory as string | null) ?? null
      templateType = (f?.templateType as string | null) ?? null
      // excerpt のようなナビ文言は入れず、編集済みの構造化フィールドのみ
      const t = [f?.eventName, f?.theme, f?.whatHappens, f?.areaLead, f?.audienceNote, f?.officialInfoNote]
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .join(' ／ ')
      factsText = t || null
    } catch {
      /* skip */
    }

    const cc = getOrComputeCrossCulture(
      {
        discoveredContentId,
        title: (doc.title as string | null) ?? null,
        venue: (doc.venue as string | null) ?? null,
        contentType: (doc.contentType as string | null) ?? null,
        uxType: (doc.uxType as string | null) ?? null,
        factKind: 'event',
        templateType,
        primaryCategory,
        extraText: factsText,
        sourceName,
        sourceUrl: (doc.articleUrl as string | null) ?? null,
      },
      { now, force: options.force },
    )

    const confirmedFacts = await collectConfirmedFacts(payload, discoveredContentId)

    const plan = buildCrossCultureDerivativePlan({
      discoveredContentId,
      title: String(doc.title ?? ''),
      ccResult: cc,
      confirmedFacts,
      maxMarkets: options.maxMarkets ?? 1,
      onlyMarket: options.onlyMarket,
    })

    if (plan.mode === 'none') {
      return {
        discoveredContentId,
        mode: 'none',
        reason: plan.reason,
        plan,
        dryRunPreview: [],
        createdArticles: [],
        generationErrors: [],
      }
    }

    const dryRunPreview = plan.selectedMarkets.map((s) => ({
      market: s.market,
      wouldCallGenerator: true,
      promptInjection: s.promptInjection,
    }))

    if (dryRun) {
      return {
        discoveredContentId,
        mode: 'derivative',
        reason: `${plan.reason}（dry-run：DB 書き込み・AI 呼び出しなし）`,
        plan,
        dryRunPreview,
        createdArticles: [],
        generationErrors: [],
      }
    }

    // --- live ---
    if (doc.curationStatus !== 'approved') {
      return {
        discoveredContentId,
        mode: 'skipped',
        reason: `live 生成には curationStatus=approved が必要（現在: ${String(doc.curationStatus)}）。dry-run で内容確認可。`,
        plan,
        dryRunPreview,
        createdArticles: [],
        generationErrors: [],
      }
    }

    const createdArticles: CrossCultureDerivativeCreated[] = []
    const generationErrors: { market: string; error: string }[] = []
    for (const sm of plan.selectedMarkets) {
      try {
        const res = await createMultiAngleDraftsFromDiscoveredContent(payload, discoveredContentId, {
          angles: ['ginza_whiskers'],
          crossCultureContext: sm.promptInjection,
          crossCultureMarket: sm.market,
        })
        for (const a of res.createdArticles) {
          // 通常記事と混同しないよう、人間可読なプレフィックスを付ける（別 Article 行・別候補）
          let title = a.title
          try {
            const prefixed = `【CROSS CULTURE｜${sm.market}】${a.title}`
            await payload.update({
              collection: 'articles',
              id: a.id,
              locale: 'ja',
              data: { title: prefixed },
            })
            title = prefixed
          } catch {
            /* prefix 失敗は非致命（本文・aiGeneratedBy のタグで識別可能） */
          }
          createdArticles.push({
            articleId: a.id,
            market: sm.market,
            title,
            articlePotential: sm.articlePotential,
            warnings: a.warnings,
          })
        }
      } catch (e) {
        generationErrors.push({ market: sm.market, error: e instanceof Error ? e.message : String(e) })
      }
    }

    return {
      discoveredContentId,
      mode: createdArticles.length > 0 ? 'derivative' : 'skipped',
      reason:
        createdArticles.length > 0
          ? `CROSS CULTURE 派生記事 ${createdArticles.length} 本を draft 生成（別候補・reviewStatus:draft・人間承認ゲートは従来どおり）`
          : `派生記事の生成に失敗（${generationErrors.map((x) => `${x.market}:${x.error}`).join(' / ')}）→ 通常記事は影響なし`,
      plan,
      dryRunPreview,
      createdArticles,
      generationErrors,
    }
  } catch (e) {
    return {
      discoveredContentId,
      mode: 'skipped',
      reason: `CROSS CULTURE 派生記事オーケストレーションで例外（${e instanceof Error ? e.message : String(e)}）→ 通常記事は影響なし`,
      plan: emptyPlan,
      dryRunPreview: [],
      createdArticles: [],
      generationErrors: [],
    }
  }
}
