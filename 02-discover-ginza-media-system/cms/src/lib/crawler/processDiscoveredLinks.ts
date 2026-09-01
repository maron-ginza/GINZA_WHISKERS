import { createHash } from 'node:crypto'

import type { Payload } from 'payload'

import { classifyContentType } from './classifyContentType'
import type { DiscoveryStatus } from './discoveredContentTypes'
import type { ImageUrlSource } from './extractImageUrl'
import type { DateFieldResult } from './extractStructuredDates'
import type { DiscoveredLink } from './extractLinks'
import { fetchArticleMetadata } from './fetchArticlePage'
import { normalizeFloorTokens } from './normalizeVenueText'
import { classifyUxType } from '../curation/uxType'

interface DateExtractionMeta {
  publishedAt: DateFieldResult
  contentUpdatedAt: DateFieldResult
  eventStartAt: DateFieldResult
  eventEndAt: DateFieldResult
  // Payload's json field type requires an index signature to accept
  // an arbitrary object shape on write.
  [key: string]: unknown
}

// トップページ更新検知 → 個別記事・イベント抽出：Stage 1（リンク一覧の
// 反映・差分判定）とStage 2（新規・更新候補の実ページ取得、コスト制御付き）を
// まとめて実行するオーケストレーター（2026-08-17）。
//
// 【変化検知の設計】個別記事の`discoveryStatus`（first_seen/changed/unchanged）は
// トップページ上のアンカーテキストのハッシュ（linkFingerprint）のみを基準に
// 判定する——Stage 2で記事本文を取得できた場合でも、本文ハッシュと混在させず
// 一貫してアンカーテキスト基準を使う（毎回Stage 2が走るとは限らないため、
// 基準が回によって変わると誤って"changed"を連発する）。既知の制約として、
// サイトがリンクの見出しテキストを変えずに記事本文だけを更新した場合は
// 検知できない（v1のスコープ、将来Stage 2のexcerptハッシュも判定に組み込む
// 拡張の余地を残す）。
//
// 【コスト制御】Stage 2（個別ページの実HTTP取得）は新規(first_seen)・
// 更新(changed)候補にのみ、呼び出し元が指定する上限件数まで実行する
// （CLAUDE.md第13章の運用コスト方針を踏襲）。unchanged判定の候補や、
// 予算超過分はStage 1の情報（アンカーテキスト・URL・機械推定contentType）
// のみを保持し、公開日・開催期間はnullのまま——推測では埋めない。
//
// 【個別リンクのエラー分離（2026-08-17追加）】実運用テストで、一覧ページ
// （NEWS/EVENT等）がPDF/PNG等のバイナリへ直接リンクしているケースが見つかり、
// それをUTF-8テキストとしてDB書き込みしようとして失敗する事故が発生した。
// 修正（extractLinks.ts/discoverListingPages.tsの拡張子フィルタ、
// fetchArticlePage.tsのContent-Typeガード）を入れたが、想定していない
// エラーが今後も起こりうることを踏まえ、1件のリンク処理を独立した
// try/catchで分離した——1件の異常がサイト全体のループを中断させ、
// 成功していたはずのSnapshot取得まで誤ってfetch_error扱いになる、という
// 事故の再発を構造的に防ぐ。

function fingerprint(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export interface ProcessLinksStats {
  scanned: number
  firstSeen: number
  changed: number
  unchanged: number
  stage2Attempted: number
  stage2Succeeded: number
  publishedDatesFound: number
  eventDatesFound: number
  /**
   * ページ内の重複リンク除外件数。この関数自体では計算しない
   * （extractLinks.tsが同一ページ内の重複を除去する時点で計算済みのため）——
   * 呼び出し元（runCrawl.ts）がoutcome.linksDuplicatesRemovedを設定する。
   */
  duplicatesRemoved: number
  /**
   * 1件のリンク処理中に予期しない例外が発生した件数（2026-08-17追加）。
   * 個別リンクの処理はtry/catchで分離しており、1件の異常がサイト全体の
   * 処理を中断させない（詳細は本ファイル冒頭コメント参照）。
   */
  errors: number
}

interface ProcessDiscoveredLinksParams {
  payload: Payload
  sourceLedgerId: string | number
  /** SourceLedger.sourceId（kebab-case安定ID）。siteAdapters/registry.tsのルックアップキーとして使用（2026-08-17追加） */
  sourceStableId?: string | null
  links: DiscoveredLink[]
  now: Date
  /** falseの場合、判定・Stage2取得は行うがDBへの書き込みは一切行わない */
  persist: boolean
  /** このサイト分に割り当てられたStage2取得の残り予算（呼び出し元が全体予算を管理） */
  stage2Budget: number
}

interface Budget {
  remaining: number
}

async function processOneLink(
  payload: Payload,
  sourceLedgerId: string | number,
  sourceStableId: string | null | undefined,
  link: DiscoveredLink,
  now: Date,
  persist: boolean,
  budget: Budget,
  stats: ProcessLinksStats,
): Promise<void> {
  const { docs: existingDocs } = await payload.find({
    collection: 'discovered-content',
    where: { and: [{ sourceSite: { equals: sourceLedgerId } }, { articleUrl: { equals: link.url } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const existing = existingDocs[0] ?? null

  const newFingerprint = fingerprint(link.anchorText)
  const isNew = !existing
  const isChanged = !isNew && existing.linkFingerprint !== newFingerprint
  const discoveryStatus: DiscoveryStatus = isNew ? 'first_seen' : isChanged ? 'changed' : 'unchanged'

  if (discoveryStatus === 'first_seen') stats.firstSeen += 1
  else if (discoveryStatus === 'changed') stats.changed += 1
  else stats.unchanged += 1

  // Stage 2の実行対象：新規または更新のみ、かつ予算内。unchangedは既存の
  // 保存済みメタデータをそのまま使う（再取得しない＝コスト削減）。
  const shouldAttemptStage2 = (discoveryStatus === 'first_seen' || discoveryStatus === 'changed') && budget.remaining > 0

  let title = existing?.title ?? link.anchorText
  let excerpt: string | null = existing?.excerpt ?? null
  let contentType = existing?.contentType ?? classifyContentType(link.url, link.anchorText, null)
  let publishedAt: string | null = existing?.publishedAt ?? null
  let contentUpdatedAt: string | null = existing?.contentUpdatedAt ?? null
  let eventStartAt: string | null = existing?.eventStartAt ?? null
  let eventEndAt: string | null = existing?.eventEndAt ?? null
  let venue: string | null = existing?.venue ?? null
  let dateExtraction: DateExtractionMeta | null = (existing?.dateExtraction as unknown as DateExtractionMeta) ?? null
  let imageUrl: string | null = existing?.imageUrl ?? null
  let imageUrlSource: ImageUrlSource = (existing?.imageUrlSource as ImageUrlSource) ?? null
  let articleFetchStatus = existing?.articleFetchStatus ?? 'not_fetched'

  if (shouldAttemptStage2) {
    stats.stage2Attempted += 1
    budget.remaining -= 1

    const fetched = await fetchArticleMetadata(link.url, sourceStableId)
    if (fetched.ok) {
      stats.stage2Succeeded += 1
      title = fetched.title ?? link.anchorText
      excerpt = fetched.excerpt
      contentType = fetched.contentType
      publishedAt = fetched.publishedAt.value
      contentUpdatedAt = fetched.updatedAt.value
      eventStartAt = fetched.eventStartAt.value
      eventEndAt = fetched.eventEndAt.value
      // 再発防止 #2（2026-09-01 Trial）：保存前に地下階表記を正規化（B2F の先頭 B を
      // 落とさない／Ｂ２Ｆ→B2F）。地上階「2F」や「地下2階」表記は変更しない。
      venue = fetched.venue.value ? normalizeFloorTokens(fetched.venue.value) : fetched.venue.value
      imageUrl = fetched.imageUrl.value
      imageUrlSource = fetched.imageUrl.source
      dateExtraction = {
        publishedAt: fetched.publishedAt,
        contentUpdatedAt: fetched.updatedAt,
        eventStartAt: fetched.eventStartAt,
        eventEndAt: fetched.eventEndAt,
      }
      articleFetchStatus = 'fetched'
    } else {
      articleFetchStatus = 'fetch_error'
    }
  }

  if (publishedAt) stats.publishedDatesFound += 1
  if (eventStartAt || eventEndAt) stats.eventDatesFound += 1

  // 参加／体験型UXタイプ（2026-08-18）。この時点ではeditorialScore
  // （contentRichnessTier）がまだ存在しないため、richness未考慮で暫定
  // 判定する——採点時（scoreDiscoveredContentById.ts）にcontentRichness
  // Tierが確定した時点で、より精度の高い判定へ更新される
  // （excerptがナビ文言主体のページをexcerptキーワードマッチから除外できる）。
  const uxType = classifyUxType(title, excerpt, contentType)

  if (!persist) return

  // lastChangedAtはfirst_seen/changedの回のみ更新する（SourceLedger.
  // lastChangedAtと同じ考え方）。detectedAtは毎回更新されるため、
  // 「本日発見・更新されたか」の判定にはdetectedAtではなくlastChangedAtを
  // 使う（dailyRanking.ts/discoveredContentSummary.ts）——2026-08-17、
  // 同日内に複数回巡回すると2回目のunchanged判定でdetectedAtだけを見ると
  // 当日発見分がDaily候補から漏れることを実地テストで発見し修正した。
  const lastChangedAt =
    discoveryStatus === 'first_seen' || discoveryStatus === 'changed'
      ? now.toISOString()
      : (existing?.lastChangedAt ?? now.toISOString())

  const data = {
    sourceSite: Number(sourceLedgerId),
    articleUrl: link.url,
    rawUrl: link.url,
    title,
    publishedAt: publishedAt ?? undefined,
    contentUpdatedAt: contentUpdatedAt ?? undefined,
    eventStartAt: eventStartAt ?? undefined,
    eventEndAt: eventEndAt ?? undefined,
    venue: venue ?? undefined,
    imageUrl: imageUrl ?? undefined,
    imageUrlSource: imageUrlSource ?? undefined,
    dateExtraction: dateExtraction ?? undefined,
    excerpt: excerpt ?? undefined,
    detectedAt: now.toISOString(),
    discoveryStatus,
    contentType,
    uxType,
    linkFingerprint: newFingerprint,
    articleFetchStatus,
    lastCheckedAt: now.toISOString(),
    lastChangedAt,
  }

  if (existing) {
    // curationStatusはここでは絶対に触れない——人間が承認/却下した後の
    // 再巡回でうっかりinboxへ巻き戻すことを防ぐため、updateのdataには含めない。
    await payload.update({
      collection: 'discovered-content',
      id: existing.id,
      overrideAccess: true,
      data,
    })
  } else {
    await payload.create({
      collection: 'discovered-content',
      overrideAccess: true,
      data: { ...data, curationStatus: 'inbox' },
    })
  }
}

export async function processDiscoveredLinks(params: ProcessDiscoveredLinksParams): Promise<ProcessLinksStats> {
  const { payload, sourceLedgerId, sourceStableId, links, now, persist, stage2Budget } = params

  const stats: ProcessLinksStats = {
    scanned: links.length,
    firstSeen: 0,
    changed: 0,
    unchanged: 0,
    stage2Attempted: 0,
    stage2Succeeded: 0,
    publishedDatesFound: 0,
    eventDatesFound: 0,
    duplicatesRemoved: 0,
    errors: 0,
  }

  const budget: Budget = { remaining: stage2Budget }

  for (const link of links) {
    try {
      await processOneLink(payload, sourceLedgerId, sourceStableId, link, now, persist, budget, stats)
    } catch (err) {
      stats.errors += 1
      console.error(`[processDiscoveredLinks] リンク処理中にエラー: ${link.url}`, err)
    }
  }

  return stats
}
