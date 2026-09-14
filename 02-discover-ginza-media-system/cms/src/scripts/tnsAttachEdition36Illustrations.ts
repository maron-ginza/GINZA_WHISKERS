import { mkdirSync, readdirSync, writeFileSync, existsSync } from 'fs'
import path from 'path'

import { getPayload } from 'payload'

import config from '../payload.config'
import { WEEKDAY_LABELS_JA } from '../lib/tns/types'

// 🌈TNS #36（SoundtrackEditions id=11 / Article 50）へ、人間が用意した
// CODE1〜7 の世界観挿絵7点を紐付ける1回限りの作業スクリプト（2026-08-29、
// マロン確定の方式A：dailyScenes[].image ＋ imageProductionNote）。
//
// 前提：
//   - cms/src/collections/SoundtrackEditions.ts に image / imageProductionNote
//     フィールドを追加済み（dev push 済み）。
//   - 原本7点を  02-discover-ginza-media-system/media/tns-inbox/  に配置。
//     命名規約：tns36_code<1-7>_<...>.(png|jpg|jpeg)
//     （命名が違う場合は --map code1=/abs/path ... で明示指定）
//
// やること：
//   1) 変更前の edition 11（dailyScenes + visual）を _backups/ へ退避
//   2) 7点を image-assets へ create（rights.owner="GINZA WHISKERS" /
//      licenseType="自社生成・独自制作" / altText.ja=中立的な情景説明 /
//      pillars=[文化]）
//   3) edition 11 の dailyScenes[0..6]（= code1..7 = mon..sun）へ
//      image を割当、imageProductionNote に共通コンセプトメモを保存
//   4) 7点そろっていれば visual.visualStatus='attached'
//   5) 検証結果を _backups/ へ保存
//
// 触らないもの：articles id=50（本文・選曲・コメント・天気・翻訳）、
//   visual.heroImageAsset（null のまま）、visual.heroVisualBrief。

const EDITION_ID = 11
const INBOX_REL = path.resolve(process.cwd(), '..', 'media', 'tns-inbox')
const BACKUP_DIR = path.resolve(process.cwd(), '..', '_backups')
const PILLAR_BUNKA_ID = 3 // tags: 文化
const RIGHTS_OWNER = 'GINZA WHISKERS'
const RIGHTS_LICENSE = '自社生成・独自制作'
const PRODUCTION_NOTE =
  '挿絵の猫は三毛猫（白猫コロンとは別存在）。裏コンセプト：挿絵の女性は白猫コロンの化身。マロン（犬）は主役にしない。'

const CODES = ['code1', 'code2', 'code3', 'code4', 'code5', 'code6', 'code7'] as const

function parseMapArgs(args: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const a of args) {
    const m = a.match(/^--map=?(.+)$/)
    if (!m) continue
    const [code, ...rest] = m[1].split('=')
    if (CODES.includes(code as (typeof CODES)[number]) && rest.length) out[code] = rest.join('=')
  }
  return out
}

function findInboxFileForCode(code: string): string | null {
  if (!existsSync(INBOX_REL)) return null
  const files = readdirSync(INBOX_REL).filter((f) => /\.(png|jpe?g)$/i.test(f))
  const num = code.replace('code', '')
  const hit = files.find((f) => new RegExp(`(^|[^0-9])code${num}([^0-9]|_|$)`, 'i').test(f))
  return hit ? path.join(INBOX_REL, hit) : null
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const explicitMap = parseMapArgs(args)

  const payload = await getPayload({ config })
  mkdirSync(BACKUP_DIR, { recursive: true })

  const ed: any = await payload.findByID({ collection: 'soundtrack-editions', id: EDITION_ID, depth: 0 })
  if (!ed) throw new Error(`SoundtrackEditions id=${EDITION_ID} が見つかりません`)
  if (Number(ed.editionNumber) !== 36) throw new Error(`id=${EDITION_ID} は #${ed.editionNumber}（#36 ではない）`)
  const scenes: any[] = ed.dailyScenes ?? []
  if (scenes.length !== 7) throw new Error(`dailyScenes が7件ではありません（${scenes.length}件）`)

  // 変更前の退避
  const beforePath = path.join(BACKUP_DIR, 'tns_edition36_visual_before_20260829.json')
  writeFileSync(
    beforePath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        editionId: EDITION_ID,
        editionNumber: ed.editionNumber,
        visual: ed.visual,
        dailyScenes: scenes.map((s) => ({
          id: s.id,
          date: s.date,
          weekday: s.weekday,
          code: s.tnsEditorialCode?.code,
          image: s.image ?? null,
          imageProductionNote: s.imageProductionNote ?? null,
        })),
      },
      null,
      2,
    ),
    'utf8',
  )

  // 各 code の入力ファイルを解決
  const plan = CODES.map((code, i) => {
    const scene = scenes[i]
    const filePath = explicitMap[code] ?? findInboxFileForCode(code)
    return {
      index: i,
      code,
      sceneId: scene.id,
      date: String(scene.date).slice(0, 10),
      weekday: scene.weekday,
      weekdayJa: WEEKDAY_LABELS_JA[scene.weekday as keyof typeof WEEKDAY_LABELS_JA],
      sceneCode: scene.tnsEditorialCode?.code,
      fixedMoodLabel: scene.tnsEditorialCode?.fixedMoodLabel || '',
      alreadyImage: scene.image ?? null,
      filePath,
      fileFound: Boolean(filePath && existsSync(filePath)),
    }
  })

  console.log('=== ATTACH PLAN (edition id=11 / #36) ===')
  for (const p of plan) {
    console.log(
      `  ${p.code} [${p.index}] ${p.date}(${p.weekdayJa}) sceneCode=${p.sceneCode} ` +
        `existing_image=${p.alreadyImage ?? 'null'} file=${p.fileFound ? p.filePath : '（未検出）'}`,
    )
  }

  const missing = plan.filter((p) => !p.fileFound)
  if (missing.length) {
    console.error(
      `\n[中断] ${missing.length}件の画像ファイルが未検出です（${missing.map((m) => m.code).join(', ')}）。` +
        `\n  ${INBOX_REL} に tns36_code<n>_*.png|jpg を配置するか、--map code<n>=/abs/path を渡してください。` +
        `\n  DBは変更していません。退避: ${beforePath}`,
    )
    process.exit(2)
  }

  if (dryRun) {
    console.log(`\n[dry-run] 7点すべて検出。ここで停止（DB変更なし）。退避: ${beforePath}`)
    process.exit(0)
  }

  // 2) image-assets へ create
  const createdByCode: Record<string, number> = {}
  for (const p of plan) {
    const altJa =
      `Tokyo Nostalgic Soundtrack #36 世界観挿絵 — ${p.weekdayJa}（${p.date}）` +
      (p.fixedMoodLabel ? `／${p.fixedMoodLabel}` : '')
    const asset: any = await payload.create({
      collection: 'image-assets',
      filePath: p.filePath!,
      data: {
        rights: { owner: RIGHTS_OWNER, licenseType: RIGHTS_LICENSE },
        altText: { ja: altJa, en: '' },
        pillars: [PILLAR_BUNKA_ID],
      },
    })
    createdByCode[p.code] = Number(asset.id)
    console.log(`  [image-assets] created id=${asset.id} filename=${asset.filename} <- ${p.code}`)
  }

  // 3) edition 11 の dailyScenes を更新（既存フィールドは spread で保持）
  const nextScenes = scenes.map((s, i) => ({
    ...s,
    image: createdByCode[CODES[i]],
    imageProductionNote: PRODUCTION_NOTE,
  }))

  const allAttached = nextScenes.every((s) => s.image)
  const nextVisual = {
    ...(ed.visual ?? {}),
    visualStatus: allAttached ? 'attached' : 'pending_selection',
  }

  await payload.update({
    collection: 'soundtrack-editions',
    id: EDITION_ID,
    data: { dailyScenes: nextScenes, visual: nextVisual },
  })

  // 4) 検証
  const after: any = await payload.findByID({ collection: 'soundtrack-editions', id: EDITION_ID, depth: 0 })
  const art: any = await payload.findByID({ collection: 'articles', id: 50, depth: 0, locale: 'ja' })
  const verify = {
    verifiedAt: new Date().toISOString(),
    editionId: EDITION_ID,
    visualStatus: after.visual?.visualStatus,
    heroImageAsset: after.visual?.heroImageAsset ?? null,
    dailyScenes: (after.dailyScenes ?? []).map((s: any) => ({
      date: String(s.date).slice(0, 10),
      weekday: s.weekday,
      code: s.tnsEditorialCode?.code,
      image: s.image ?? null,
      imageProductionNoteLen: (s.imageProductionNote ?? '').length,
    })),
    article50Untouched: {
      id: art.id,
      reviewStatus: art.reviewStatus,
      updatedAt: art.updatedAt,
      bodyBlocks: art.body?.root?.children?.length ?? null,
    },
    createdImageAssets: createdByCode,
  }
  const afterPath = path.join(BACKUP_DIR, 'tns_edition36_visual_after_20260829.json')
  writeFileSync(afterPath, JSON.stringify(verify, null, 2), 'utf8')
  console.log('\n=== VERIFY ===')
  console.log(JSON.stringify(verify, null, 2))
  console.log(`\n退避: ${beforePath}\n検証: ${afterPath}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
