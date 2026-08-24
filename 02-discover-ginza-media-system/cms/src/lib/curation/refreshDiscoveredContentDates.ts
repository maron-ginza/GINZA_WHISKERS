import type { Payload } from 'payload'

import { fetchArticleMetadata } from '../crawler/fetchArticlePage'
import { classifyUxType } from './uxType'

// 既存DiscoveredContentの個別ページ再確認（2026-08-17、日付取得率改善セッション）。
//
// `runCrawl.ts`/`processDiscoveredLinks.ts`（トップページ・一覧ページ経由の
// 新規発見パイプライン）とは独立した並行の処理——**新規のDiscoveredContent行を
// 一切作成しない**。既存の行（`articleFetchStatus`が`not_fetched`/
// `fetch_error`、または`fetched`だが日付が1件も取得できていないもの）だけを
// 対象に、改善版の日付抽出ロジック（extractStructuredDates.tsのTier 3a/3b
// 拡張、siteAdapters/のサイト固有アダプタ）で個別ページを再取得し、
// 見つかった分だけ埋める。
//
// 【安全性】`discoveryStatus`・`lastChangedAt`・`linkFingerprint`・
// `curationStatus`はここでは一切変更しない——ページ内容の再確認であって
// 「新規発見/更新検知」ではないため（この2つを混同すると「本日new/updated」の
// 意味が壊れる）。取得できた値は「まだnullのフィールドのみ」埋める
// （fetchArticlePage.tsのアダプタマージと同じ「既存の高信頼度な値を
// 上書きしない」原則）。

export interface RefreshDatesResult {
  persisted: boolean
  scanned: number
  attempted: number
  fetchSucceeded: number
  newDatesFound: number
  errors: number
}

export async function refreshDiscoveredContentDates(
  payload: Payload,
  options: { limit?: number; persist?: boolean; all?: boolean } = {},
): Promise<RefreshDatesResult> {
  const persist = options.persist ?? true
  const limit = options.limit ?? 300
  // all:true の場合、日付未取得のものだけでなく全件を再取得する
  // （2026-08-17、Event Date Extraction誤判定修正セッションで追加）——
  // 抽出ロジック自体を修正した際、「既に日付を持っているが実は誤抽出
  // だった」行（例：POLA MUSEUM ANNEX id=47）は既存のnullフィールドのみ
  // 対象とする既定のwhere条件では再取得対象にならない。ロジック修正の
  // 効果を全件に反映させたい場合に使用する。
  const all = options.all ?? false

  const { docs } = await payload.find({
    collection: 'discovered-content',
    where: all
      ? {}
      : {
          or: [
            { articleFetchStatus: { equals: 'not_fetched' } },
            { articleFetchStatus: { equals: 'fetch_error' } },
            {
              and: [
                { articleFetchStatus: { equals: 'fetched' } },
                { publishedAt: { exists: false } },
                { eventStartAt: { exists: false } },
              ],
            },
          ],
        },
    limit,
    depth: 1, // sourceSite.sourceId（サイト固有アダプタのルックアップキー）を解決するため
    overrideAccess: true,
  })

  const result: RefreshDatesResult = {
    persisted: persist,
    scanned: docs.length,
    attempted: 0,
    fetchSucceeded: 0,
    newDatesFound: 0,
    errors: 0,
  }

  for (const doc of docs) {
    result.attempted += 1
    try {
      const sourceStableId =
        typeof doc.sourceSite === 'object' && doc.sourceSite !== null
          ? ((doc.sourceSite as { sourceId?: string }).sourceId ?? null)
          : null

      const fetched = await fetchArticleMetadata(doc.articleUrl as string, sourceStableId)
      if (!fetched.ok) continue
      result.fetchSucceeded += 1

      const foundNewDate = Boolean(
        (fetched.publishedAt.value && !doc.publishedAt) ||
          (fetched.eventStartAt.value && !doc.eventStartAt) ||
          (fetched.eventEndAt.value && !doc.eventEndAt) ||
          (fetched.updatedAt.value && !doc.contentUpdatedAt),
      )
      if (foundNewDate) result.newDatesFound += 1

      if (!persist) continue

      // 【all:trueモードの挙動（2026-08-17追加）】既定（all:false、日付
      // 未取得の行のみ対象）では「まだnullのフィールドのみ埋める」安全な
      // 追記のみ。all:true（全件再検証）では、抽出ロジック自体を修正した
      // 際に「以前は誤って値が入っていたが、修正後は正しくnull/unknownに
      // なるべき」フィールド（例：POLA MUSEUM ANNEX id=47の
      // eventStartAt/eventEndAt）を実際にnullへ戻せるよう、新しい抽出結果を
      // そのまま採用する（doc.Xへのフォールバックをしない）——修正の効果が
      // 実際にDBへ反映されることを優先する。
      const resolve = <T>(freshValue: T | null, existingValue: T | null | undefined): T | undefined =>
        all ? (freshValue ?? undefined) : (freshValue ?? (existingValue as T | undefined) ?? undefined)

      const refreshedTitle = fetched.title ?? doc.title ?? undefined
      const refreshedExcerpt = fetched.excerpt ?? doc.excerpt ?? undefined
      const refreshedContentType = fetched.contentType ?? doc.contentType
      // 参加／体験型UXタイプもtitle/excerpt/contentTypeの更新に合わせて
      // 再判定する。この時点ではcontentRichnessTierは（採点済みなら）既存値を
      // そのまま参照できる——ページ内容自体の再確認であって再採点ではないため
      // richnessの再計算はここでは行わない（scoreDiscoveredContentById.tsの
      // 責務、2026-08-18）。
      const uxType = classifyUxType(
        refreshedTitle,
        refreshedExcerpt,
        refreshedContentType,
        doc.editorialScore?.contentRichnessTier,
      )

      await payload.update({
        collection: 'discovered-content',
        id: doc.id,
        overrideAccess: true,
        data: {
          title: refreshedTitle,
          excerpt: refreshedExcerpt,
          contentType: refreshedContentType,
          uxType,
          publishedAt: resolve(fetched.publishedAt.value, doc.publishedAt),
          contentUpdatedAt: resolve(fetched.updatedAt.value, doc.contentUpdatedAt),
          eventStartAt: resolve(fetched.eventStartAt.value, doc.eventStartAt),
          eventEndAt: resolve(fetched.eventEndAt.value, doc.eventEndAt),
          venue: resolve(fetched.venue.value, doc.venue),
          imageUrl: resolve(fetched.imageUrl.value, doc.imageUrl),
          imageUrlSource: resolve(fetched.imageUrl.source, doc.imageUrlSource),
          dateExtraction: {
            publishedAt: fetched.publishedAt,
            contentUpdatedAt: fetched.updatedAt,
            eventStartAt: fetched.eventStartAt,
            eventEndAt: fetched.eventEndAt,
          },
          articleFetchStatus: 'fetched',
          lastCheckedAt: new Date().toISOString(),
        },
      })
    } catch (err) {
      result.errors += 1
      console.error(`[refreshDiscoveredContentDates] リンク再確認中にエラー: ${doc.articleUrl}`, err)
    }
  }

  return result
}
