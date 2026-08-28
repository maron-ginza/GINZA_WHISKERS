import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

import { getPayload } from 'payload'

import { findExistingEditionForWeek } from '../lib/tns/findExistingEditionForWeek'
import config from '../payload.config'

// 2026-08-31週の重複 SoundtrackEditions 整理（2026-08-28、マロン承認済み）。
//
// 方針（マロン確定）：
//   - 保持：SoundtrackEdition id=2 / #36（既存ドラフトを正本）＋ Article id=31
//   - 削除：SoundtrackEdition id=1 / #0（空生成・番号壊れ）＋ Article id=30
//   - 削除：SoundtrackEdition id=3 / #37（空生成・番号違い）＋ Article id=32
//
// 実施順：①全6ドキュメントをJSON退避 → ②依存関係の再確認（台帳/SNS/相互参照が
// ゼロであること）→ ③削除 → ④findExistingEditionForWeek / computeNextEditionNumber
// / #36の健全性を再確認。ライブ生成・approve・自動投稿は行わない。

const DELETE_EDITION_IDS = [1, 3]
const DELETE_ARTICLE_IDS = [30, 32]
const KEEP_EDITION_ID = 2
const KEEP_ARTICLE_ID = 31
const TARGET_WEEK = '2026-08-31'

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const payload = await getPayload({ config })

  const backupDir = path.resolve(process.cwd(), '..', '_backups')
  mkdirSync(backupDir, { recursive: true })
  const backupPath = path.join(backupDir, 'tns_edition_cleanup_backup_20260828.json')

  // ── STEP 1: 退避 ─────────────────────────────────────────────
  const backup: any = {
    exportedAt: new Date().toISOString(),
    reason:
      '2026-08-31週に SoundtrackEditions が3件（id1/#0, id2/#36, id3/#37）重複生成されていた。' +
      'id2/#36 のみ7日分の選曲が完成し号数も整合するため正本として保持し、空生成の id1/#0・id3/#37 と' +
      'その draft Article(30,32) を削除する。台帳・公開・相互参照は事前確認で全てゼロ。',
    kept: { soundtrackEditionId: KEEP_EDITION_ID, articleId: KEEP_ARTICLE_ID },
    deleted: { soundtrackEditionIds: DELETE_EDITION_IDS, articleIds: DELETE_ARTICLE_IDS },
    soundtrackEditions: {} as Record<string, unknown>,
    articles: {} as Record<string, unknown>,
  }

  for (const id of [1, 2, 3]) {
    backup.soundtrackEditions[id] = await payload.findByID({
      collection: 'soundtrack-editions',
      id,
      depth: 0,
      locale: 'all' as any,
    })
  }
  for (const id of [30, 31, 32]) {
    backup.articles[id] = await payload.findByID({
      collection: 'articles',
      id,
      depth: 0,
      locale: 'all' as any,
    })
  }

  writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8')
  console.log(`[STEP1] 退避完了: ${backupPath}`)

  // ── STEP 2: 依存関係の再確認（abort guard）──────────────────
  const guards: string[] = []

  const ledgerRef = await payload.count({
    collection: 'music-usage-ledger',
    where: { soundtrackEdition: { in: [...DELETE_EDITION_IDS, KEEP_EDITION_ID] } },
  })
  if (ledgerRef.totalDocs !== 0) guards.push(`MusicUsageLedger が対象editionを${ledgerRef.totalDocs}件参照している`)

  const spAll = await payload.find({ collection: 'social-posts', limit: 1000, depth: 0 })
  const spRef = (spAll.docs as any[]).filter((p) => {
    const r = p.sourceArticle
    const rid = typeof r === 'object' && r !== null ? Number(r.id) : Number(r)
    return [...DELETE_ARTICLE_IDS, KEEP_ARTICLE_ID].includes(rid)
  })
  if (spRef.length) guards.push(`SocialPosts が対象Articleを${spRef.length}件参照している`)

  const artsAll = await payload.find({ collection: 'articles', limit: 2000, depth: 0, locale: 'ja' })
  const relRef = (artsAll.docs as any[]).filter(
    (a) =>
      Array.isArray(a.relatedArticles) &&
      a.relatedArticles.some((r: any) =>
        DELETE_ARTICLE_IDS.includes(Number(typeof r === 'object' ? r?.id : r)),
      ),
  )
  if (relRef.length) guards.push(`他Articleの relatedArticles が削除対象Articleを参照している（${relRef.map((a) => a.id)}）`)

  // 削除対象editionが本当に空生成か（選曲済みなら中断）
  for (const id of DELETE_EDITION_IDS) {
    const ed: any = await payload.findByID({ collection: 'soundtrack-editions', id, depth: 0 })
    const assigned = (ed.dailyScenes ?? []).filter((s: any) => s.musicSelected?.trackRef).length
    if (ed.status === 'historical_import') guards.push(`edition id=${id} が historical_import（削除対象外のはず）`)
    if (assigned > 0) guards.push(`edition id=${id} に選曲済みトラックが${assigned}件ある（空生成の想定に反する）`)
    const art = ed.generatedArticle
    const artId = art ? (typeof art === 'object' ? Number(art.id) : Number(art)) : null
    if (artId && !DELETE_ARTICLE_IDS.includes(artId)) {
      guards.push(`edition id=${id} の generatedArticle=${artId} が削除リスト${DELETE_ARTICLE_IDS}に無い`)
    }
  }

  // 削除対象Articleが公開実績を持たないこと
  for (const id of DELETE_ARTICLE_IDS) {
    const a: any = await payload.findByID({ collection: 'articles', id, depth: 0, locale: 'ja' })
    if (a.reviewStatus === 'published') guards.push(`Article id=${id} が published（削除しない）`)
    if (Array.isArray(a.publishHistory) && a.publishHistory.length) guards.push(`Article id=${id} に publishHistory がある`)
  }

  if (guards.length) {
    console.error('[STEP2] 中断：以下の依存が検出されました:')
    for (const g of guards) console.error('  - ' + g)
    process.exit(2)
  }
  console.log('[STEP2] 依存関係の再確認OK（台帳0 / SNS0 / 相互参照0 / 削除対象は全日pending / 未公開）')

  if (dryRun) {
    console.log('[dry-run] ここで停止。削除は行いません。')
    process.exit(0)
  }

  // ── STEP 3: 削除 ────────────────────────────────────────────
  for (const id of DELETE_EDITION_IDS) {
    await payload.delete({ collection: 'soundtrack-editions', id })
    console.log(`[STEP3] deleted soundtrack-editions id=${id}`)
  }
  for (const id of DELETE_ARTICLE_IDS) {
    await payload.delete({ collection: 'articles', id })
    console.log(`[STEP3] deleted articles id=${id}`)
  }

  // ── STEP 4: 再確認 ──────────────────────────────────────────
  const existing = await findExistingEditionForWeek(payload, TARGET_WEEK)
  const maxEd = await payload.find({ collection: 'soundtrack-editions', sort: '-editionNumber', limit: 1, depth: 0 })
  const computeNext = maxEd.docs.length ? Number(maxEd.docs[0].editionNumber) + 1 : '(fallback seed)'

  const keptEd: any = await payload.findByID({ collection: 'soundtrack-editions', id: KEEP_EDITION_ID, depth: 0 })
  const keptArt: any = await payload.findByID({ collection: 'articles', id: KEEP_ARTICLE_ID, depth: 0, locale: 'ja' })
  const keptTracks = (keptEd.dailyScenes ?? []).map((s: any) => {
    const tr = s.musicSelected?.trackRef
    return typeof tr === 'object' && tr !== null ? Number(tr.id) : tr
  })

  const allEditions = await payload.find({ collection: 'soundtrack-editions', sort: 'editionNumber', limit: 100, depth: 0 })

  const verify = {
    findExistingEditionForWeek: existing,
    computeNextEditionNumber: computeNext,
    remainingEditions: allEditions.docs.map((e: any) => ({ id: e.id, editionNumber: e.editionNumber, status: e.status, weekStart: String(e.weekStart).slice(0, 10) })),
    kept36: {
      editionId: keptEd.id,
      editionNumber: keptEd.editionNumber,
      status: keptEd.status,
      weekStart: String(keptEd.weekStart).slice(0, 10),
      weekEnd: String(keptEd.weekEnd).slice(0, 10),
      dailyScenesCount: (keptEd.dailyScenes ?? []).length,
      trackRefs: keptTracks,
      pendingDays: (keptEd.dailyScenes ?? []).filter((s: any) => s.musicSelected?.pendingHumanSelection).length,
      article: {
        id: keptArt.id,
        title: keptArt.title,
        slug: keptArt.slug,
        reviewStatus: keptArt.reviewStatus,
        seriesEditionNumber: keptArt.series?.editionNumber,
        hasBody: Boolean(keptArt.body),
        bodyRootChildren: keptArt.body?.root?.children?.length ?? null,
        publishHistory: keptArt.publishHistory ?? [],
      },
    },
  }

  writeFileSync(
    path.join(backupDir, 'tns_edition_cleanup_verify_20260828.json'),
    JSON.stringify(verify, null, 2),
    'utf8',
  )
  console.log('[STEP4] 検証結果:')
  console.log(JSON.stringify(verify, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
