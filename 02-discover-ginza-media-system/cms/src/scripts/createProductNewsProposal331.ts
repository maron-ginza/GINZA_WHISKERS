import { getPayload } from 'payload'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import config from '../payload.config'
import { dedupCheck } from '../lib/morning/dedupCheck'
import { extractProductNewsFactsCandidate } from '../lib/morning/extractProductNewsFacts'
import { fetchOfficialSignals } from '../lib/morning/fetchOfficialSignals'
import type { OfficialPageSignals } from '../lib/morning/types'
import type { DiscoveredContentLike } from '../lib/template/mapDiscoveredContentToEventFields'

// 一回限りの処理（2026-09-03）。DC #331 のみ。
//   node --env-file=.env --import=tsx/esm src/scripts/createProductNewsProposal331.ts            # dry-run（表示のみ）
//   node --env-file=.env --import=tsx/esm src/scripts/createProductNewsProposal331.ts --write     # .devlogs プロポーザルを書き出す
//
// マロンの人間判断を明示入力として使用：Primary Category=BEAUTY / icon=09_beauty.jpg /
// templateType=sale / 適用経路=product_news。
//
// 【厳守】DB 書き込みなし・ready 化なし・記事生成なし・note/X なし・commit なし。
//         公式ページで確認できる事実だけ。推測補完しない。確認できない項目は unknownItems へ。
//         article-facts（イベント用）DB へは書かない（product_news は G.19 により .devlogs プロポーザル）。

const DC_ID = 331
const HUMAN_DECISION = {
  primaryCategory: 'BEAUTY',
  primaryCategoryNo: 9,
  categoryIcon: 'media/discover-ginza-category-icons/09_beauty.jpg',
  categoryIconSlug: 'icon_beauty',
  templateType: 'sale',
  route: 'product_news',
  decidedBy: 'マロン（人間確定・明示入力）',
  decidedAt: '2026-09-03',
}

async function main() {
  const write = process.argv.slice(2).includes('--write')
  const payload = await getPayload({ config })

  const dc = (await payload.findByID({
    collection: 'discovered-content',
    id: DC_ID,
    depth: 1,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>
  const ss = dc.sourceSite as { name?: string | null } | null

  if (dc.curationStatus !== 'approved') {
    console.error(`[abort] DC #${DC_ID} は curationStatus=${dc.curationStatus}（approved でない）。中断。`)
    process.exit(2)
  }

  const dcLike: DiscoveredContentLike = {
    id: DC_ID,
    title: (dc.title as string | null) ?? null,
    excerpt: (dc.excerpt as string | null) ?? null,
    articleUrl: (dc.articleUrl as string | null) ?? null,
    sourceSiteName: ss?.name ?? null,
    publishedAt: (dc.publishedAt as string | null) ?? null,
    eventStartAt: (dc.eventStartAt as string | null) ?? null,
    eventEndAt: (dc.eventEndAt as string | null) ?? null,
    venue: (dc.venue as string | null) ?? null,
    contentType: (dc.contentType as string | null) ?? null,
    uxType: (dc.uxType as string | null) ?? null,
    lastCheckedAt: (dc.lastCheckedAt as string | null) ?? null,
    detectedAt: (dc.detectedAt as string | null) ?? null,
    dateExtraction: (dc.dateExtraction as DiscoveredContentLike['dateExtraction']) ?? null,
  }

  // 公式ページ取得（読み取りのみ・0円・許可ホストは記事 URL のホストのみ）
  const host = (() => {
    try { return new URL(dcLike.articleUrl ?? '').hostname.replace(/^www\./, '') } catch { return '' }
  })()
  let signals: OfficialPageSignals | null = null
  try {
    signals = await fetchOfficialSignals(dcLike.articleUrl ?? '', { allowedHosts: [host] })
  } catch (e) {
    signals = { requested: true, ok: false, fetchedAt: new Date().toISOString(), error: String(e) }
  }

  // 重複確認（Articles の editorialProvenance / sourceUrl / 類似タイトル）
  const articles = await payload.find({ collection: 'articles', limit: 500, depth: 0, overrideAccess: true, locale: 'ja' })
  const artRecords = (articles.docs as unknown as Array<Record<string, unknown>>).map((a) => {
    const prov = (a.editorialProvenance as Array<Record<string, unknown>> | undefined) ?? []
    const dcRefs: number[] = []
    const urls: string[] = []
    for (const p of prov) {
      const d = p.discoveredContentSource
      if (typeof d === 'number') dcRefs.push(d)
      else if (d && typeof d === 'object' && typeof (d as { id?: number }).id === 'number') dcRefs.push((d as { id: number }).id)
      if (typeof p.sourceUrl === 'string') urls.push(p.sourceUrl)
    }
    return {
      id: Number(a.id),
      title: (a.title as string | null) ?? null,
      provenanceDcIds: dcRefs,
      provenanceSourceUrls: urls,
      eventDates: [] as string[],
      venueHints: [] as string[],
    }
  })
  const dedup = dedupCheck(
    {
      id: DC_ID,
      title: dcLike.title ?? null,
      articleUrl: dcLike.articleUrl ?? null,
      eventStartAt: dcLike.eventStartAt ?? null,
      venue: dcLike.venue ?? null,
    },
    artRecords,
    [], // note-record は最新の ./p2 morning 実行で C 判定に出ていない＝重複なし（本スクリプトは Articles を厳密確認）
  )

  const image = { available: false, assetPath: null, policy: '画像なし（外部転載不可）', season: null } as never
  const product = extractProductNewsFactsCandidate({
    dc: dcLike,
    image,
    officialSignals: signals,
    trustedSource: true,
  })

  const proposal = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    note:
      '記事タイプ分類つき構造化事実プロポーザル。DB へは書いていない。' +
      'product_news（sale）は article-facts（イベント用）コレクションへは登録しない（G.19。DB 列は P1）。' +
      'この JSON が product_news の「draft」に相当する。',
    discoveredContentId: DC_ID,
    humanDecision: HUMAN_DECISION,
    verdict: 'B',
    factKind: 'product_news',
    factKindSource: 'human-override（マロンが sale と確定。機械分類は unknown だった）',
    officialPage: {
      url: dcLike.articleUrl,
      fetchOk: !!signals?.ok,
      httpStatus: signals?.httpStatus ?? null,
      fetchedAt: signals?.fetchedAt ?? null,
    },
    dedup: {
      duplicate: dedup.duplicate,
      possibleDuplicate: dedup.possibleDuplicate,
      signals: dedup.signals.map((s) => s.detail),
      externalPublicationUnverified: dedup.externalPublicationUnverified,
      externalNote: dedup.externalNote,
      existingArticleId: dedup.existingArticleId ?? null,
    },
    eventExtraction: null,
    productNewsExtraction: product,
  }

  const dateStr = '2026-09-03'
  const outPath = resolve(process.cwd(), '..', '.devlogs', 'morning', dateStr, 'facts', `${DC_ID}.json`)

  console.log('=== #331 product_news 構造化事実プロポーザル（DB 非書き込み） ===')
  console.log(`mode          : ${write ? 'WRITE（.devlogs へ出力）' : 'DRY-RUN（表示のみ）'}`)
  console.log(`人間判断       : Primary Category=${HUMAN_DECISION.primaryCategory} / icon=${HUMAN_DECISION.categoryIcon} / templateType=${HUMAN_DECISION.templateType} / route=${HUMAN_DECISION.route}`)
  console.log(`公式ページ     : ${dcLike.articleUrl}  ok=${signals?.ok} status=${signals?.httpStatus}`)
  console.log(`重複           : duplicate=${dedup.duplicate} possible=${dedup.possibleDuplicate}  ${dedup.signals.map((s) => s.detail).join(' / ') || '（重複シグナルなし）'}`)
  console.log('')
  console.log('--- productNewsExtraction ---')
  console.log(JSON.stringify(product, null, 2))
  console.log('')
  console.log(`出力先         : .devlogs/morning/${dateStr}/facts/${DC_ID}.json`)
  console.log('article-facts DB 行 : 作成しない（product_news は event 用スキーマへ入れない＝G.19・削除済み ID1/ID2 の再発防止）')

  if (!write) {
    console.log('\n（dry-run：ファイル出力なし。--write で .devlogs へ書き出す。DB・commit は一切なし）')
    process.exit(0)
  }
  mkdirSync(resolve(outPath, '..'), { recursive: true })
  writeFileSync(outPath, JSON.stringify(proposal, null, 2) + '\n', 'utf8')
  console.log(`\n✅ 出力: ${outPath}`)
  console.log('DB 書き込み・ready 化・記事生成・note/X・commit はしていません。')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
