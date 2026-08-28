import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

import { getPayload } from 'payload'

import config from '../payload.config'

// 🌈TNS #36 の安全リセット（2026-08-28、マロン承認済み）。
//
// 目的：クレジット回復後に #36（2026-08-31〜09-06）を同じ editionNumber #36 で
// 本文込み再生成できる状態にする。既存 #36 は本文未完成の未承認ドラフトのため、
// 2026-08-27 の #0/#37 整理と同じ方式で「退避 → 依存ゼロ確認 → 削除」を行う。
//
// 対象：SoundtrackEditions id=2（#36, status=article_generated）＋その dailyScenes
// 7件（配列子行、edition 削除で cascade）＋ Article id=31（reviewStatus=draft）。
//
// 削除後は残存最大 editionNumber が 35 になり、computeNextEditionNumber は 36 を返す。
// approve・自動投稿・AI 生成は行わない。--dry-run で書き込みなしの確認。

const EDITION_ID = 10
const EDITION_NUMBER = 36
const ARTICLE_ID = 49

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const payload = await getPayload({ config })

  const backupDir = path.resolve(process.cwd(), '..', '_backups')
  mkdirSync(backupDir, { recursive: true })
  const backupPath = path.join(backupDir, 'tns_edition_36_jma_regen_backup_20260828.json')

  // ── STEP 1: retrieve + abort guards ────────────────────────
  const guards: string[] = []

  let edition: Record<string, unknown> | null = null
  try {
    edition = (await payload.findByID({
      collection: 'soundtrack-editions',
      id: EDITION_ID,
      depth: 0,
      locale: 'all' as never,
    })) as unknown as Record<string, unknown>
  } catch {
    guards.push(`soundtrack-editions id=${EDITION_ID} が見つからない`)
  }
  if (edition) {
    if (Number(edition.editionNumber) !== EDITION_NUMBER)
      guards.push(`id=${EDITION_ID} の editionNumber が ${edition.editionNumber}（期待 ${EDITION_NUMBER}）`)
    if (edition.status !== 'article_generated')
      guards.push(`id=${EDITION_ID} の status が "${edition.status}"（期待 "article_generated"）`)
    const ga = edition.generatedArticle
    const gaId = ga ? (typeof ga === 'object' ? Number((ga as { id: number }).id) : Number(ga)) : null
    if (gaId !== ARTICLE_ID)
      guards.push(`id=${EDITION_ID} の generatedArticle=${gaId}（期待 ${ARTICLE_ID}）`)
  }

  let article: Record<string, unknown> | null = null
  try {
    article = (await payload.findByID({
      collection: 'articles',
      id: ARTICLE_ID,
      depth: 0,
      locale: 'all' as never,
    })) as unknown as Record<string, unknown>
  } catch {
    guards.push(`articles id=${ARTICLE_ID} が見つからない`)
  }
  if (article) {
    if (article.reviewStatus !== 'draft')
      guards.push(`Article ${ARTICLE_ID} の reviewStatus が "${article.reviewStatus}"（draft 以外は削除しない）`)
    if (article.accessionNumber)
      guards.push(`Article ${ARTICLE_ID} に accessionNumber "${article.accessionNumber}" がある（承認済みの可能性）`)
    const ph = article.publishHistory
    if (Array.isArray(ph) && ph.length > 0)
      guards.push(`Article ${ARTICLE_ID} に publishHistory が ${ph.length} 件ある`)
  }

  // 外部参照ゼロの再確認
  const ledgerRef = await payload.count({
    collection: 'music-usage-ledger',
    where: { soundtrackEdition: { equals: EDITION_ID } },
  })
  if (ledgerRef.totalDocs !== 0)
    guards.push(`music-usage-ledger が edition id=${EDITION_ID} を ${ledgerRef.totalDocs} 件参照している`)

  const relatedRef = await payload.count({
    collection: 'articles',
    where: { relatedArticles: { equals: ARTICLE_ID } },
  })
  if (relatedRef.totalDocs !== 0)
    guards.push(`他 Article の relatedArticles が ${ARTICLE_ID} を ${relatedRef.totalDocs} 件参照している`)

  const socialRef = await payload.count({
    collection: 'social-posts',
    where: { article: { equals: ARTICLE_ID } },
  })
  if (socialRef.totalDocs !== 0)
    guards.push(`social-posts が Article ${ARTICLE_ID} を ${socialRef.totalDocs} 件参照している`)

  const otherEdRef = await payload.count({
    collection: 'soundtrack-editions',
    where: { and: [{ generatedArticle: { equals: ARTICLE_ID } }, { id: { not_equals: EDITION_ID } }] },
  })
  if (otherEdRef.totalDocs !== 0)
    guards.push(`id=${EDITION_ID} 以外の soundtrack-editions が Article ${ARTICLE_ID} を参照している`)

  if (guards.length) {
    console.error('[STEP1] 中断：')
    for (const g of guards) console.error('  - ' + g)
    process.exit(2)
  }

  const observation = String((edition as Record<string, unknown>).context
    ? ((edition as { context?: { maronWeeklyObservation?: string } }).context?.maronWeeklyObservation ?? '')
    : '')
  console.log('[STEP1] abort guard OK（#36=article_generated / Article 49=draft・publishHistory空 / 台帳0・relatedArticles0・social0・他edition参照0）')
  console.log(`[STEP1] 保持する週間観察テキスト: "${observation}"`)

  // dailyScenes 件数（確認用）
  const scenes = Array.isArray((edition as { dailyScenes?: unknown[] }).dailyScenes)
    ? (edition as { dailyScenes: unknown[] }).dailyScenes.length
    : null

  // ── STEP 2: backup ─────────────────────────────────────────
  const backup = {
    exportedAt: new Date().toISOString(),
    reason:
      '#36（2026-08-31〜09-06）を同一 editionNumber で本文込み再生成するための安全リセット。' +
      '既存 #36 は本文未完成の未承認ドラフト（reviewStatus=draft, publishHistory空, 台帳・外部参照ゼロ）。',
    preservedWeeklyObservation: observation,
    deleted: {
      soundtrackEditionId: EDITION_ID,
      soundtrackEditionNumber: EDITION_NUMBER,
      dailyScenesCount: scenes,
      articleId: ARTICLE_ID,
    },
    soundtrackEdition: edition,
    article,
  }

  if (dryRun) {
    console.log(`[dry-run] 退避先: ${backupPath}`)
    console.log(`[dry-run] 削除予定: soundtrack-editions id=${EDITION_ID}(#${EDITION_NUMBER}, dailyScenes ${scenes}件) + articles id=${ARTICLE_ID}`)
    const maxEd = await payload.find({
      collection: 'soundtrack-editions',
      where: { id: { not_equals: EDITION_ID } },
      sort: '-editionNumber',
      limit: 1,
      depth: 0,
    })
    console.log(`[dry-run] 削除後の computeNextEditionNumber 相当: ${maxEd.docs.length ? Number(maxEd.docs[0].editionNumber) + 1 : '(seed)'}`)
    process.exit(0)
  }

  writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8')
  console.log(`[STEP2] 退避完了: ${backupPath}`)

  // ── STEP 3: delete ─────────────────────────────────────────
  await payload.delete({ collection: 'soundtrack-editions', id: EDITION_ID })
  console.log(`[STEP3] deleted soundtrack-editions id=${EDITION_ID}（dailyScenes は cascade）`)
  await payload.delete({ collection: 'articles', id: ARTICLE_ID })
  console.log(`[STEP3] deleted articles id=${ARTICLE_ID}`)

  // ── STEP 4: verify ─────────────────────────────────────────
  const editionsLeft = await payload.find({
    collection: 'soundtrack-editions',
    sort: 'editionNumber',
    limit: 100,
    depth: 0,
  })
  const maxEd = await payload.find({
    collection: 'soundtrack-editions',
    sort: '-editionNumber',
    limit: 1,
    depth: 0,
  })
  const computeNext = maxEd.docs.length ? Number(maxEd.docs[0].editionNumber) + 1 : '(seed)'

  let article31Gone = false
  try {
    await payload.findByID({ collection: 'articles', id: ARTICLE_ID, depth: 0 })
  } catch {
    article31Gone = true
  }

  const verify = {
    remainingEditions: editionsLeft.docs.map((e) => ({
      id: e.id,
      editionNumber: e.editionNumber,
      status: e.status,
      weekStart: String(e.weekStart).slice(0, 10),
    })),
    edition36Count: editionsLeft.docs.filter((e) => Number(e.editionNumber) === EDITION_NUMBER).length,
    article31Deleted: article31Gone,
    computeNextEditionNumber: computeNext,
    preservedWeeklyObservation: observation,
  }
  console.log('[STEP4] verify:')
  console.log(JSON.stringify(verify, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
