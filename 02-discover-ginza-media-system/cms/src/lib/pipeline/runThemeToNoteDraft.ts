// GINZA WHISKERS / Project 02（2026-09-03、自動制作パイプライン）
//
// マロンがテーマを承認したあとに起動する「記事化 → 裏取り → 表現確認 →
// リスク判定 → note 下書き候補 ＋ 監査カード 一括生成」のオーケストレーター。
//
// 【マロン承認（2026-09-03）】
//   ・4:00 / 6:00 の既存処理（収集・候補抽出・スコアリング）には接続しない。
//     このパイプラインは承認後に手動起動する（`./p2 pipeline`）。
//   ・auto-ready しない（v1）。ready でない ArticleFacts は pending として一覧に出す。
//   ・green だけを公開候補（green バケット）へ。reviewStatus は draft のまま・自動公開なし。
//   ・yellow は該当箇所だけ表示して保留。red は理由を明示して停止。
//   ・1件が red / 例外でも他の記事の処理は継続する。10件一括。
//   ・有料 API を使用しない（テンプレ経路のみ・¥0。--fetch は公式ページ取得のみ）。
//
// 出力：.devlogs/pipeline/<date>/{index.json,index.txt,green/,yellow/,red/}
import { tokyoBusinessDate } from '../util/businessDate'

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Payload } from 'payload'

import {
  createDraftFromArticleFacts,
  type CreateDraftFromArticleFactsResult,
} from '../template/createDraftFromArticleFacts'
import { runArticleBodyChecks } from '../audit/articleBodyChecks'
import { articleUnderAuditFromPreview } from '../audit/fromPreview'
import {
  buildAuditCard,
  renderAuditCardText,
  renderAuditIndexText,
  type AuditCard,
} from '../audit/buildAuditCard'
import { aggregateVerdict } from '../audit/riskModel'
import { fetchOfficialSignals } from '../morning/fetchOfficialSignals'
import { upsertOfficialSnapshot } from '../audit/officialSnapshot'
import {
  getOrComputeCrossCulture,
  crossCultureSummaryLine,
  buildCrossCultureDerivativePlan,
  derivativePlanSummaryLine,
} from '../crossCulture'
import type { CrossCultureFilterResult } from '../crossCulture/crossCultureFilter'
import type { DerivativePlan } from '../crossCulture/derivativeCandidate'

export interface RunPipelineOptions {
  dryRun?: boolean
  fetch?: boolean
  limit?: number
  date?: string
  force?: boolean
  now?: Date
  /** 出力ルート（既定 <cwd>/../.devlogs/pipeline） */
  outRoot?: string
  /**
   * テスト用の差し替え（DI）。既定は createDraftFromArticleFacts。
   * DB 非接続の回帰テストが preview を作為的に返すために使う。
   */
  renderPreview?: (
    payload: Payload,
    dcId: number | string,
    o: { dryRun: boolean; regenerate: boolean; now: Date },
  ) => Promise<CreateDraftFromArticleFactsResult>
  /** buildNoteDraftPackage の差し替え（live 時のみ使う） */
  buildNotePackage?: (payload: Payload, articleId: number) => Promise<{ body: string }>
}

export interface PipelinePendingItem {
  discoveredContentId: number | string
  title: string
  reason: string
}

export interface PipelineItemResult {
  discoveredContentId: number | string
  articleId?: number | string | null
  verdict: 'green' | 'yellow' | 'red'
  status: 'audited' | 'blocked' | 'skipped_idempotent' | 'error'
  reason?: string
  cardPath?: string
  notePackagePath?: string | null
  /** CROSS CULTURE FILTER の 1 行サマリ（派生・有料化候補の参考。verdict には無関係） */
  crossCulture?: string
  crossCultureDerivativeMarkets?: string[]
  /** CROSS CULTURE 派生記事プラン（提案）の 1 行サマリ */
  crossCultureDerivativePlan?: string
}

export interface RunPipelineResult {
  date: string
  dryRun: boolean
  fetch: boolean
  processed: number
  counts: { green: number; yellow: number; red: number; pending: number; error: number }
  items: PipelineItemResult[]
  pending: PipelinePendingItem[]
  indexPath: string
}

function dateStr(now: Date): string {
  return tokyoBusinessDate(now)
}

function toDcLike(dc: Record<string, unknown>) {
  const ss = dc.sourceSite
  return {
    id: dc.id as number,
    articleUrl: (dc.articleUrl as string | null) ?? null,
    sourceSiteName:
      ss && typeof ss === 'object' ? ((ss as { name?: string | null }).name ?? null) : ((ss as string | null) ?? null),
  }
}

export async function runThemeToNoteDraft(
  payload: Payload,
  options: RunPipelineOptions = {},
): Promise<RunPipelineResult> {
  const now = options.now ?? new Date()
  const dryRun = options.dryRun ?? true
  const doFetch = options.fetch ?? false
  const renderPreview = options.renderPreview ?? createDraftFromArticleFacts
  const limit = Math.max(1, Math.min(50, options.limit ?? 10))
  const date = options.date ?? dateStr(now)
  const outRoot = options.outRoot ?? resolve(process.cwd(), '..', '.devlogs', 'pipeline')
  const outDir = resolve(outRoot, date)
  for (const b of ['green', 'yellow', 'red']) mkdirSync(resolve(outDir, b), { recursive: true })
  const ccDir = resolve(outDir, 'crossculture')
  const ccDerivDir = resolve(outDir, 'crossculture-derivative')
  try {
    mkdirSync(ccDir, { recursive: true })
    mkdirSync(ccDerivDir, { recursive: true })
  } catch {
    /* CROSS CULTURE の出力先が作れなくても本体は継続 */
  }

  // 公式ページ取得用の許可ホスト（SOURCE LEDGER 由来。--fetch 時のみ使う）
  const allowedHosts = await buildAllowedHostsFromSourceLedger(payload)

  // マロン承認済みの DiscoveredContent（＝テーマ承認後）。id 昇順・limit。
  const approved = await payload.find({
    collection: 'discovered-content',
    where: { curationStatus: { equals: 'approved' } },
    sort: 'id',
    limit,
    depth: 1,
    overrideAccess: true,
  })

  const items: PipelineItemResult[] = []
  const pending: PipelinePendingItem[] = []
  const cards: AuditCard[] = []

  for (const dcDoc of approved.docs as unknown as Record<string, unknown>[]) {
    const dcId = dcDoc.id as number
    const title = String(dcDoc.title ?? `(DC #${dcId})`)
    try {
      // 冪等：green カードが既にあればスキップ（--force で無効化）
      const greenCardPath = resolve(outDir, 'green', `dc${dcId}.json`)
      if (!options.force && existsSync(greenCardPath)) {
        let ccLine: string | undefined
        let ccDeriv: string[] | undefined
        try {
          const cached = JSON.parse(readFileSync(greenCardPath, 'utf8')) as AuditCard
          cards.push(cached)
          ccLine = crossCultureSummaryLine(cached.crossCulture)
          ccDeriv = cached.crossCulture?.derivativeMarkets ?? []
        } catch {
          /* ignore parse */
        }
        items.push({
          discoveredContentId: dcId,
          verdict: 'green',
          status: 'skipped_idempotent',
          cardPath: greenCardPath,
          crossCulture: ccLine,
          crossCultureDerivativeMarkets: ccDeriv,
        })
        continue
      }

      // ArticleFacts の状態
      const factsRes = await payload.find({
        collection: 'article-facts',
        where: { discoveredContent: { equals: dcId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const facts = factsRes.docs[0] as unknown as Record<string, unknown> | undefined
      if (!facts) {
        pending.push({ discoveredContentId: dcId, title, reason: 'ArticleFacts が無い（morning --write-facts で draft 作成 → admin で ready 化）' })
        continue
      }
      if (facts.enrichmentStatus !== 'ready') {
        pending.push({
          discoveredContentId: dcId,
          title,
          reason: `ArticleFacts が enrichmentStatus=${String(facts.enrichmentStatus)}（マロンが admin で Primary Category / templateType を確定 → 一覧でまとめて ready 承認。auto-ready しない）`,
        })
        continue
      }

      // --- CROSS CULTURE FILTER（GINZA WHISKERS 適合判定の後段。決定的・課金なし・キャッシュ再利用）---
      // 失敗しても記事化・監査は続行する（cc は skipped 結果 or null になるだけ）。
      let cc: CrossCultureFilterResult | null = null
      let ccDerivPlan: DerivativePlan | null = null
      try {
        // extraText は編集済みの構造化フィールドのみ（excerpt のようなナビ文言は入れない）
        const factsText = [
          facts.eventName,
          facts.theme,
          facts.whatHappens,
          facts.areaLead,
          facts.audienceNote,
          facts.officialInfoNote,
        ]
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .join(' ／ ')
        cc = getOrComputeCrossCulture(
          {
            discoveredContentId: dcId,
            title: String(dcDoc.title ?? ''),
            venue: (dcDoc.venue as string | null) ?? null,
            contentType: (dcDoc.contentType as string | null) ?? null,
            uxType: (dcDoc.uxType as string | null) ?? null,
            factKind: 'event',
            templateType: (facts.templateType as string | null) ?? null,
            primaryCategory: (facts.primaryCategory as string | null) ?? null,
            extraText: factsText || null,
            sourceName: toDcLike(dcDoc).sourceSiteName,
            sourceUrl: (dcDoc.articleUrl as string | null) ?? null,
          },
          { now },
        )
        writeFileSync(
          resolve(ccDir, `dc${dcId}.json`),
          JSON.stringify({ discoveredContentId: dcId, title, result: cc }, null, 2),
        )
      } catch {
        cc = null
      }

      // --- CROSS CULTURE 派生記事プラン（提案のみ・生成はしない。pipeline は提案まで）---
      try {
        const confirmed = Array.isArray(facts.sourceProvenanceFacts)
          ? (facts.sourceProvenanceFacts as Record<string, unknown>[])
              .filter(
                (s) =>
                  (s.verificationStatus === 'confirmed' || s.confirmationStatus === 'confirmed') &&
                  typeof s.fact === 'string' &&
                  s.fact.trim(),
              )
              .map((s) => ({ fact: String(s.fact).trim(), factType: (s.factType as string | null) ?? null }))
          : []
        ccDerivPlan = buildCrossCultureDerivativePlan({
          discoveredContentId: dcId,
          title: String(dcDoc.title ?? ''),
          ccResult: cc,
          confirmedFacts: confirmed,
          maxMarkets: 1,
        })
        writeFileSync(
          resolve(ccDerivDir, `dc${dcId}.json`),
          JSON.stringify({ discoveredContentId: dcId, title, plan: ccDerivPlan }, null, 2),
        )
      } catch {
        ccDerivPlan = null
      }

      // step 2：公式スナップショット（--fetch 時のみ）
      const dcLike = toDcLike(dcDoc)
      if (doFetch && dcLike.articleUrl && allowedHosts.length > 0) {
        try {
          const sig = await fetchOfficialSignals(dcLike.articleUrl, { allowedHosts })
          if (sig.bodyText) {
            await upsertOfficialSnapshot(
              payload,
              {
                sourceUrl: dcLike.articleUrl,
                sourceName: dcLike.sourceSiteName ?? '(unknown)',
                bodyText: sig.bodyText,
                capturedAt: now.toISOString(),
                httpStatus: sig.httpStatus ?? null,
                articleFactsId: (facts.id as number) ?? null,
                discoveredContentId: dcId,
                fetchNotes: sig.error ?? sig.rejectedReason ?? null,
              },
              { dryRun },
            )
          }
        } catch {
          /* fetch 失敗は非致命。監査は既存 provenance で行う */
        }
      }

      // step 4：まず dry-run で preview を得る（red なら記事を書かない＝生成停止）
      const preview = await renderPreview(payload, dcId, { dryRun: true, regenerate: true, now })
      if (preview.status === 'skipped' || !preview.preview) {
        const card = buildAuditCard({
          article: {
            articleId: preview.existingArticleId ?? undefined,
            discoveredContentId: dcId,
            title,
            sections: [],
            appliedTemplate: 'generic',
            templateType: String(facts.templateType ?? 'unknown'),
            primaryCategory: (facts.primaryCategory as string | null) ?? null,
            callToAction: null,
            ctaInBody: false,
            hashtags: [],
            provenance: [],
            facts: {},
            hasOfficialUrl: !!dcLike.articleUrl,
          },
          findings: [
            {
              checkId: preview.reason ?? 'generationBlocked',
              severity: 'red',
              message: `記事生成に進めない（${preview.reason ?? 'unknown'}）: ${(preview.missing ?? []).join(' / ') || '—'}`,
            },
          ],
          crossCulture: cc,
          crossCultureDerivative: ccDerivPlan,
          now,
        })
        const p = writeCard(outDir, card)
        items.push({
          discoveredContentId: dcId,
          verdict: 'red',
          status: 'blocked',
          reason: preview.reason,
          cardPath: p,
          crossCulture: crossCultureSummaryLine(cc),
          crossCultureDerivativeMarkets: cc?.derivativeMarkets ?? [],
          crossCultureDerivativePlan: derivativePlanSummaryLine(ccDerivPlan),
        })
        cards.push(card)
        continue
      }

      // steps 5〜13：本文検査 → verdict
      const article = articleUnderAuditFromPreview(preview.preview, {
        articleId: preview.existingArticleId ?? preview.articleId ?? undefined,
        discoveredContentId: dcId,
      })
      const findings = runArticleBodyChecks(article, { now })
      const verdict = aggregateVerdict(findings)

      let articleId: number | string | null = preview.existingArticleId ?? preview.articleId ?? null
      let notePackagePath: string | null = null

      // green / yellow：記事 draft を書き（live のみ）、note 下書きパッケージを作る
      if (verdict !== 'red') {
        if (!dryRun) {
          const live = await renderPreview(payload, dcId, { dryRun: false, regenerate: true, now })
          articleId = live.articleId ?? articleId
          if (live.preview) {
            // buildNoteDraftPackage は Payload の Article を読むため live のみ
            try {
              const pkgFn = options.buildNotePackage ?? (async (p, id) => (await import('../night/buildNoteDraftPackage')).buildNoteDraftPackage(p, id))
              const pkg = await pkgFn(payload, Number(articleId))
              const pkgDir = resolve(outDir, verdict, 'note-draft', String(articleId))
              mkdirSync(pkgDir, { recursive: true })
              writeFileSync(resolve(pkgDir, 'note-draft.json'), JSON.stringify(pkg, null, 2))
              writeFileSync(resolve(pkgDir, 'note-body.txt'), pkg.body)
              notePackagePath = `.devlogs/pipeline/${date}/${verdict}/note-draft/${articleId}/note-draft.json`
            } catch {
              /* パッケージ化失敗は監査カードに残すのみ（記事 draft は既にできている） */
            }
          }
        } else {
          notePackagePath = `.devlogs/pipeline/${date}/${verdict}/note-draft/<articleId>/note-draft.json (dry-run: 未生成)`
        }
      }

      const card = buildAuditCard({
        article: { ...article, articleId: articleId ?? undefined },
        findings,
        notePackagePath,
        crossCulture: cc,
        crossCultureDerivative: ccDerivPlan,
        now,
      })
      const cp = writeCard(outDir, card)
      cards.push(card)
      items.push({
        discoveredContentId: dcId,
        articleId,
        verdict,
        status: 'audited',
        cardPath: cp,
        notePackagePath,
        crossCulture: crossCultureSummaryLine(cc),
        crossCultureDerivativeMarkets: cc?.derivativeMarkets ?? [],
        crossCultureDerivativePlan: derivativePlanSummaryLine(ccDerivPlan),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      items.push({ discoveredContentId: dcId, verdict: 'red', status: 'error', reason: msg })
      // 1件の例外で全体を止めない
    }
  }

  // インデックス
  const counts = {
    green: items.filter((i) => i.verdict === 'green' && i.status !== 'error').length,
    yellow: items.filter((i) => i.verdict === 'yellow').length,
    // red は「本文検査で red（audited）」＋「生成に進めず blocked」の両方を停止扱いにする（例外は別枠）
    red: items.filter((i) => i.verdict === 'red' && i.status !== 'error').length,
    pending: pending.length,
    error: items.filter((i) => i.status === 'error').length,
  }
  const indexJson = {
    date,
    dryRun,
    fetch: doFetch,
    generatedAt: now.toISOString(),
    counts,
    items,
    pending,
    cards,
  }
  const indexPath = resolve(outDir, 'index.json')
  writeFileSync(indexPath, JSON.stringify(indexJson, null, 2))
  let idxTxt = renderAuditIndexText(cards, { date })
  if (pending.length > 0) {
    idxTxt += '\n──────── ready 待ち（記事化していない・マロンが admin で ready 化）────────\n'
    for (const p of pending) idxTxt += `  ・DC #${p.discoveredContentId} ${p.title}\n      ${p.reason}\n`
  }
  if (counts.error > 0) {
    idxTxt += '\n──────── 例外（他の記事の処理は継続済み）────────\n'
    for (const i of items.filter((x) => x.status === 'error'))
      idxTxt += `  ・DC #${i.discoveredContentId}: ${i.reason}\n`
  }
  writeFileSync(resolve(outDir, 'index.txt'), idxTxt)

  return {
    date,
    dryRun,
    fetch: doFetch,
    processed: items.length,
    counts,
    items,
    pending,
    indexPath,
  }
}

function writeCard(outDir: string, card: AuditCard): string {
  const dir = resolve(outDir, card.bucket)
  mkdirSync(dir, { recursive: true })
  // ファイル名は DC 単位で固定（冪等判定・再実行の突き合わせを DC で行うため）
  const base = `dc${card.discoveredContentId}`
  writeFileSync(resolve(dir, `${base}.json`), JSON.stringify(card, null, 2))
  writeFileSync(resolve(dir, `${base}.txt`), renderAuditCardText(card))
  return `.devlogs/pipeline/${outDir.split('/').pop()}/${card.bucket}/${base}.json`
}

/** SOURCE LEDGER の url からホスト名を集めて許可リストにする（--fetch 用）。失敗時は空。 */
async function buildAllowedHostsFromSourceLedger(payload: Payload): Promise<string[]> {
  const hosts = new Set<string>()
  try {
    const res = await payload.find({ collection: 'source-ledger', limit: 200, depth: 0, overrideAccess: true })
    for (const d of res.docs as unknown as Record<string, unknown>[]) {
      const u = d.url
      if (typeof u === 'string') {
        try {
          hosts.add(new URL(u).hostname.toLowerCase())
        } catch {
          /* skip */
        }
      }
    }
  } catch {
    /* コレクション未定義でも継続（許可リスト空＝取得しない） */
  }
  return [...hosts]
}
