import { getPayload } from 'payload'

import { findExistingEditionForWeek } from '../lib/tns/findExistingEditionForWeek'
import config from '../payload.config'

// TNS #32 の historical_import（2026-08-28、マロン承認済み）。
//
// 目的：note.com #32（2026-08-03〜08-09、https://note.com/ginza_whiskers/n/n0136ca15976d）
// の7曲を MusicUsageLedger（重複排除台帳）へ正しく登録する。#33/#34/#35 と同じ
// historical_import パターン：soundtrack-editions を最小フィールドで1件 +
// music-usage-ledger を7件。dailyScenes は作らない。
//
// MusicTracks 6曲（id 66〜71）は事前に `./p2 tns import-tracks` で作成済み。
// 日曜曲は既存 id=54（Hard to Say I'm Sorry / Chicago）を再利用する。
//
// approve・自動投稿・AI生成は一切行わない。--dry-run で書き込みなしの計画表示。

const EDITION_NUMBER = 32
const WEEK_START = '2026-08-03T00:00:00.000Z'
const WEEK_END = '2026-08-09T00:00:00.000Z'

// 曜日 → { musicTrackId, usedDate }。id は import-tracks 実行後の実測値。
const LEDGER_PLAN: Array<{
  dayOfWeek: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  usedDate: string
  musicTrackId: number
  titleForLog: string
}> = [
  { dayOfWeek: 'monday', usedDate: '2026-08-03T00:00:00.000Z', musicTrackId: 66, titleForLog: 'Babe / Styx' },
  { dayOfWeek: 'tuesday', usedDate: '2026-08-04T00:00:00.000Z', musicTrackId: 67, titleForLog: '白いパラソル / 松田聖子' },
  { dayOfWeek: 'wednesday', usedDate: '2026-08-05T00:00:00.000Z', musicTrackId: 68, titleForLog: 'Lotta Love / Nicolette Larson' },
  { dayOfWeek: 'thursday', usedDate: '2026-08-06T00:00:00.000Z', musicTrackId: 69, titleForLog: 'タッチ / 岩崎良美' },
  { dayOfWeek: 'friday', usedDate: '2026-08-07T00:00:00.000Z', musicTrackId: 70, titleForLog: "This Time I'm in It for Love / Player" },
  { dayOfWeek: 'saturday', usedDate: '2026-08-08T00:00:00.000Z', musicTrackId: 71, titleForLog: 'LOVELAND, ISLAND / 山下達郎' },
  { dayOfWeek: 'sunday', usedDate: '2026-08-09T00:00:00.000Z', musicTrackId: 54, titleForLog: "Hard to Say I'm Sorry / Chicago (既存 id=54 再利用)" },
]

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const payload = await getPayload({ config })

  // ── STEP 1: abort guard ─────────────────────────────────────
  const guards: string[] = []

  const existing = await payload.find({
    collection: 'soundtrack-editions',
    where: { editionNumber: { equals: EDITION_NUMBER } },
    limit: 1,
  })
  if (existing.totalDocs > 0) {
    guards.push(`soundtrack-editions に editionNumber=${EDITION_NUMBER} が既に存在（id=${existing.docs[0].id}）`)
  }

  // 参照する MusicTracks が全て存在するか
  for (const row of LEDGER_PLAN) {
    try {
      await payload.findByID({ collection: 'music-tracks', id: row.musicTrackId, depth: 0 })
    } catch {
      guards.push(`music-tracks id=${row.musicTrackId}（${row.titleForLog}）が見つからない`)
    }
  }

  // #32 週に対する既存 ledger 行が無いこと
  const ledgerForWeek = await payload.find({
    collection: 'music-usage-ledger',
    where: {
      usedDate: {
        greater_than_equal: WEEK_START,
        less_than_equal: WEEK_END,
      },
    },
    limit: 100,
  })
  if (ledgerForWeek.totalDocs > 0) {
    guards.push(`2026-08-03〜09 に既存の music-usage-ledger 行が ${ledgerForWeek.totalDocs} 件ある`)
  }

  if (guards.length) {
    console.error('[STEP1] 中断：')
    for (const g of guards) console.error('  - ' + g)
    process.exit(2)
  }
  console.log('[STEP1] abort guard OK（#32 未登録 / 参照trackすべて実在 / 当該週のledger 0件）')

  if (dryRun) {
    console.log('[dry-run] 以下を作成する予定（DB書き込みなし）:')
    console.log(`  soundtrack-editions: { editionNumber:${EDITION_NUMBER}, weekStart:${WEEK_START.slice(0, 10)}, weekEnd:${WEEK_END.slice(0, 10)}, status:'historical_import' }`)
    for (const r of LEDGER_PLAN) {
      console.log(`  music-usage-ledger: ${r.dayOfWeek} ${r.usedDate.slice(0, 10)} musicTrack=${r.musicTrackId} reuseAllowed=false  (${r.titleForLog})`)
    }
    process.exit(0)
  }

  // ── STEP 2: create edition ──────────────────────────────────
  const edition = await payload.create({
    collection: 'soundtrack-editions',
    data: {
      editionNumber: EDITION_NUMBER,
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      status: 'historical_import',
    },
  })
  console.log(`[STEP2] created soundtrack-editions id=${edition.id} (#${EDITION_NUMBER})`)

  // ── STEP 3: create 7 ledger rows ────────────────────────────
  const created: Array<{ id: number | string; dayOfWeek: string; musicTrackId: number }> = []
  for (const row of LEDGER_PLAN) {
    // 冪等：同じ (musicTrack, soundtrackEdition) が無いことを確認してから作成
    const dup = await payload.find({
      collection: 'music-usage-ledger',
      where: {
        and: [
          { musicTrack: { equals: row.musicTrackId } },
          { soundtrackEdition: { equals: edition.id } },
        ],
      },
      limit: 1,
    })
    if (dup.totalDocs > 0) {
      console.log(`[STEP3] skip（既存）: musicTrack=${row.musicTrackId} edition=${edition.id}`)
      continue
    }
    const led = await payload.create({
      collection: 'music-usage-ledger',
      data: {
        musicTrack: row.musicTrackId,
        soundtrackEdition: edition.id,
        usedDate: row.usedDate,
        dayOfWeek: row.dayOfWeek,
        reuseAllowed: false,
      },
    })
    created.push({ id: led.id, dayOfWeek: row.dayOfWeek, musicTrackId: row.musicTrackId })
    console.log(`[STEP3] created music-usage-ledger id=${led.id} ${row.dayOfWeek} track=${row.musicTrackId}`)
  }

  // ── STEP 4: verify ─────────────────────────────────────────
  const editionCheck = await payload.findByID({ collection: 'soundtrack-editions', id: edition.id, depth: 0 })
  const ledgerCheck = await payload.find({
    collection: 'music-usage-ledger',
    where: { soundtrackEdition: { equals: edition.id } },
    depth: 1,
    limit: 100,
    sort: 'usedDate',
  })
  const forWeek = await findExistingEditionForWeek(payload, '2026-08-03')
  const maxEd = await payload.find({ collection: 'soundtrack-editions', sort: '-editionNumber', limit: 1, depth: 0 })
  const computeNext = maxEd.docs.length ? Number(maxEd.docs[0].editionNumber) + 1 : '(seed)'

  const verify = {
    edition: {
      id: editionCheck.id,
      editionNumber: editionCheck.editionNumber,
      weekStart: String(editionCheck.weekStart).slice(0, 10),
      weekEnd: String(editionCheck.weekEnd).slice(0, 10),
      status: editionCheck.status,
      generatedArticle: (editionCheck as { generatedArticle?: unknown }).generatedArticle ?? null,
    },
    ledgerCount: ledgerCheck.totalDocs,
    ledger: ledgerCheck.docs.map((d) => {
      const t = d.musicTrack as { id?: number; title?: string; artist?: string } | number
      return {
        id: d.id,
        dayOfWeek: d.dayOfWeek,
        usedDate: String(d.usedDate).slice(0, 10),
        reuseAllowed: d.reuseAllowed,
        ginzaCode: d.ginzaCode ?? null,
        trackId: typeof t === 'object' ? t.id : t,
        title: typeof t === 'object' ? t.title : null,
        artist: typeof t === 'object' ? t.artist : null,
      }
    }),
    findExistingEditionForWeek_2026_08_03: forWeek
      ? { id: forWeek.id, editionNumber: forWeek.editionNumber, status: forWeek.status }
      : null,
    computeNextEditionNumber: computeNext,
  }

  console.log('[STEP4] verify:')
  console.log(JSON.stringify(verify, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
