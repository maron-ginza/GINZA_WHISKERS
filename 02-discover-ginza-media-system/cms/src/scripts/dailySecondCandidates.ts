// GINZA WHISKERS / Project 02（2026-09-14、マロン指示）。
//
// `./p2 daily-second-candidates --dc=<id1>,<id2>,... --exclude-category=SWEETS,FOOD`
//
// 読み取り専用：指定した DiscoveredContent 群（既定は引数で明示的に渡す——
// このコマンド自身は新規収集・再収集を一切行わない）を Payload から読み、
// selectDailySecondCandidates（決定的・AIなし・DB書き込みなし）で
// 「本日N本目」候補を上位3件まで表示する。7日間のカテゴリー別／施設別
// 採用件数は、承認済み（curationStatus=approved）DiscoveredContentの
// decisionAtから読み取り専用で集計する（DB書き込みなし）。
//
// AI 呼び出し・記事生成・DB 書き込み・note 操作・公開はいずれも行わない。

import { getPayload } from 'payload'
import config from '../payload.config'
import { deriveProvisionalCategory } from '../lib/pipeline/provisionalCategory'
import { resolveFacilityKey } from '../lib/curation/facilityKey'
import {
  selectDailySecondCandidates,
  type SecondCandidateInput,
} from '../lib/pipeline/selectDailySecondCandidates'
import { dedupCheck } from '../lib/morning/dedupCheck'
import { loadArticleRecords, buildNoteRecords } from './morningRun'

function parseListArg(flag: string): string[] {
  const argv = process.argv.slice(2)
  const f = argv.find((a) => a.startsWith(`${flag}=`))
  if (!f) return []
  return f
    .slice(flag.length + 1)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

async function main(): Promise<void> {
  const dcIds = parseListArg('--dc').map(Number).filter((n) => Number.isInteger(n))
  const excludeCategories = parseListArg('--exclude-category').map((s) => s.toUpperCase())
  if (dcIds.length === 0) {
    console.error('Usage: dailySecondCandidates.ts --dc=<id1>,<id2>,... [--exclude-category=SWEETS,FOOD]')
    process.exit(1)
  }

  const payload = await getPayload({ config })

  console.log('=== ./p2 daily-second-candidates（読み取り専用・DB書き込みなし・AI不使用） ===')
  console.log(`対象DC（指定分のみ・再収集なし）: ${dcIds.join(', ')}`)
  console.log(`除外カテゴリー: ${excludeCategories.join(', ') || '(なし)'}`)
  console.log('────────────────────────────────────────────')

  // --- 直近7日間のカテゴリー別／施設別 採用件数（承認済みDCのdecisionAtから集計。読み取り専用） ---
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const recentApproved = await payload.find({
    collection: 'discovered-content',
    where: { and: [{ curationStatus: { equals: 'approved' } }, { decisionAt: { greater_than: sevenDaysAgo } }] },
    limit: 500,
    depth: 1,
    overrideAccess: true,
  })
  const categoryCounts7d: Record<string, number> = {}
  const facilityCounts7d: Record<string, number> = {}
  for (const doc of recentApproved.docs as unknown as Record<string, unknown>[]) {
    const cat = deriveProvisionalCategory({
      title: (doc.title as string | null) ?? null,
      venue: (doc.venue as string | null) ?? null,
      contentType: (doc.contentType as string | null) ?? null,
    }).category
    if (cat) categoryCounts7d[cat] = (categoryCounts7d[cat] ?? 0) + 1
    const ss = doc.sourceSite
    const sourceName = ss && typeof ss === 'object' ? ((ss as { name?: string | null }).name ?? null) : null
    const fk = resolveFacilityKey({
      venue: (doc.venue as string | null) ?? null,
      sourceName,
      sourceUrl: (doc.articleUrl as string | null) ?? null,
      title: (doc.title as string | null) ?? null,
    }).key
    if (fk) facilityCounts7d[fk] = (facilityCounts7d[fk] ?? 0) + 1
  }
  console.log(`直近7日間の承認済みDC: ${recentApproved.docs.length}件（カテゴリー別・施設別集計に使用）`)
  console.log('────────────────────────────────────────────')

  // --- 対象DCを読み、SecondCandidateInput へ変換 ---
  // 重複判定は既存の dedupCheck.ts をそのまま再利用する（Article.editorialProvenance
  // だけでなく .devlogs/night/queue の note-draft.json / note-body.txt も見る、
  // 2026-09-02由来の多シグナル判定。施設単位・ページ単位では判定しない——
  // 同一URL/DC参照・類似タイトル+同一開催日 のみを重複とみなす）。
  const articleRecords = await loadArticleRecords(payload)
  const noteRecords = buildNoteRecords()

  const inputs: SecondCandidateInput[] = []
  for (const id of dcIds) {
    const dc = (await payload.findByID({
      collection: 'discovered-content',
      id,
      depth: 1,
      overrideAccess: true,
    }).catch(() => null)) as unknown as Record<string, unknown> | null
    if (!dc) {
      console.log(`  DC #${id}: 見つからない（スキップ）`)
      continue
    }
    const ss = dc.sourceSite
    const sourceName =
      ss && typeof ss === 'object' ? ((ss as { name?: string | null }).name ?? null) : ((ss as string | null) ?? null)
    const title = (dc.title as string | null) ?? ''
    const venue = (dc.venue as string | null) ?? null
    const articleUrl = (dc.articleUrl as string | null) ?? null
    const contentType = (dc.contentType as string | null) ?? null
    const category = deriveProvisionalCategory({ title, venue, contentType }).category
    const facility = resolveFacilityKey({ venue, sourceName, sourceUrl: articleUrl, title })

    const dup = dedupCheck(
      { id, articleUrl, title, eventStartAt: (dc.eventStartAt as string | null) ?? null, venue },
      articleRecords,
      noteRecords,
    )

    inputs.push({
      dcId: id,
      title,
      displayTitle: title,
      sourceName: sourceName ?? '(出典名なし)',
      sourceUrl: articleUrl ?? '',
      venue,
      facilityKey: facility.key,
      facilityLabel: facility.store || sourceName || '(施設不明)',
      category,
      excerpt: (dc.excerpt as string | null) ?? null,
      whatHappens: null, // ArticleFacts側のwhatHappensは別経路（このコマンドは呼ばない）。excerptで代替。
      eventStartAt: (dc.eventStartAt as string | null) ?? null,
      eventEndAt: (dc.eventEndAt as string | null) ?? null,
      verifiedAt: (dc.lastCheckedAt as string | null) ?? (dc.detectedAt as string | null) ?? null,
      priceText: null,
      targetFit: null,
      facilityResolved: !!facility.key,
      duplicate: dup.duplicate,
    })
  }

  const result = selectDailySecondCandidates(inputs, {
    excludeCategories,
    categoryCounts7d,
    facilityCounts7d,
    limit: 3,
  })

  console.log(`評価対象: ${result.evaluatedCount}件`)
  console.log('除外内訳:')
  for (const [reason, n] of Object.entries(result.excludedReasons)) console.log(`  - ${reason}: ${n}件`)
  console.log(`基準を満たした候補: ${result.picked.length}件（水増ししていません）`)
  console.log('────────────────────────────────────────────')

  result.picked.forEach((p, i) => {
    console.log(`【${i + 1}位】 DC #${p.dcId}`)
    console.log(`  カテゴリー    : ${p.category ?? '未確定'}`)
    console.log(`  店舗・施設名  : ${p.facilityLabel ?? '公式記載なし'}`)
    console.log(`  情報名        : ${p.title}`)
    console.log(`  開催・販売期間: ${p.eventPeriodText}`)
    console.log(`  会場          : ${p.venue ?? '公式記載なし'}`)
    console.log(`  価格          : ${p.priceText}`)
    console.log(`  公式URL       : ${p.sourceUrl}`)
    console.log(`  出典          : ${p.sourceName}`)
    console.log(`  確認日時      : ${p.verifiedAt ?? '未確認'}`)
    console.log(`  スコア        : ${p.score.toFixed(3)}（${p.scoreReason}）`)
    console.log(`  必須項目確認  : ${p.official.have.join('・')}`)
    console.log('  ----')
  })

  console.log('（読み取り専用。DB書き込み・記事生成・AI呼び出し・note操作・公開は行っていません）')
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
  process.exit(1)
})
