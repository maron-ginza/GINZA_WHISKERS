// GINZA WHISKERS / Project 02（2026-09-17新設・マロン指示：朝処理の統合）
//
// SOURCE_LEDGER既存51件へ、今回新設した venueKind／extractionMethod／
// article18Categories（ヒントのみ）を後付けで設定する（冪等・何度実行しても同じ結果）。
// 新しい情報源を追加するスクリプトではない——既存データへのメタデータ後付けのみ。
// 判定不能な情報源は venueKind='other'（スキーマ既定値）のまま変更しない
// （推測で「個別店舗」等に寄せない）。
//
//   ./p2 backfill-source-ledger-metadata [--dry-run]

import { getPayload } from 'payload'
import config from '../payload.config'

const DRY = process.argv.includes('--dry-run')

// 百貨店・デパ地下（専用抽出アダプターを持つ2件）。
const DEPARTMENT_STORES: Record<string, { extractionMethod: string; article18Categories: string[] }> = {
  'mitsukoshi-ginza': { extractionMethod: 'html_listing_blocks', article18Categories: ['SWEETS', 'FOOD', 'SHOPPING'] },
  'matsuya-ginza': { extractionMethod: 'storyblok_api', article18Categories: ['SWEETS', 'FOOD', 'SHOPPING'] },
}

// GINZA SIX：category='commercial'だが、デパ地下相当の食料品フロアを持つ複合施設のため
// venueKind='department_store'として扱う（既存facilityKey.tsのPARENT_GINZA_SIXグルーピングと
// 整合。抽出は通常のHTML取得のまま＝専用アダプターは無い）。
const COMMERCIAL_AS_DEPARTMENT_STORE = new Set(['ginza-six'])

// 個別店舗・ブランド（category='food'または'brand'の既存29件。既存登録状況の確認結果——
// 新規追加ではなくメタデータの後付けのみ）。
const INDIVIDUAL_SHOP_CATEGORIES = new Set(['food', 'brand'])

// 【2026-09-17続き・マロン指示：朝処理の統合仕上げ】category='brand'の29件中、
// 実際は菓子・チョコレート専門ブランド（SWEETS）である11件は、初回のbackfillで
// category==='food'のみを対象にしたため取りこぼしていた（監査で発見・是正）。
// 各社ともブランド自体が国際的に洋菓子・チョコレート専門店として知られており
// （ブールミッシュ・DALLOYAU・フレデリック・カッセル・GODIVA・アンリ・シャルパンティエ・
// JEAN-PAUL HÉVIN・ルノートル・PIERRE HERMÉ＝いずれもパティスリー／ショコラティエ）、
// 銀座コージーコーナーはseedData.ts notesに「SWEETS（洋菓子、路面店）」と実地確認済みの
// 記載がある。残りのbrand（AYURA GINZA＝スキンケア、SEIKO HOUSE GINZA＝時計、
// SHISEIDO THE STORE＝化粧品、和光＝時計・宝飾、銀座若菜＝漬物専門店〈notes記載済み〉）は
// SWEETS対象外のため意図的にタグを付けない（推測でSWEETSへ寄せない）。
const SWEETS_BRAND_SOURCE_IDS = new Set([
  'boulmich-ginza',
  'dalloyau-japon',
  'frederic-cassel-japan',
  'godiva-japan',
  'henri-charpentier',
  'jean-paul-hevin-japon',
  'lenotre-japan',
  'pierre-herme-paris',
  'ginza-cozycorner',
])

async function main() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'source-ledger', limit: 200, depth: 0, overrideAccess: true })

  let updated = 0
  let unchanged = 0
  const changes: string[] = []

  for (const doc of docs) {
    const sourceId = String(doc.sourceId)
    const category = String(doc.category ?? '')
    const data: Record<string, unknown> = {}

    if (DEPARTMENT_STORES[sourceId]) {
      const cfg = DEPARTMENT_STORES[sourceId]
      if (doc.venueKind !== 'department_store') data.venueKind = 'department_store'
      if (doc.extractionMethod !== cfg.extractionMethod) data.extractionMethod = cfg.extractionMethod
      const existingCats = Array.isArray(doc.article18Categories) ? (doc.article18Categories as string[]) : []
      if (existingCats.length === 0) data.article18Categories = cfg.article18Categories
    } else if (COMMERCIAL_AS_DEPARTMENT_STORE.has(sourceId)) {
      if (doc.venueKind !== 'department_store') data.venueKind = 'department_store'
    } else if (INDIVIDUAL_SHOP_CATEGORIES.has(category)) {
      if (doc.venueKind !== 'individual_shop') data.venueKind = 'individual_shop'
      if (category === 'food' || SWEETS_BRAND_SOURCE_IDS.has(sourceId)) {
        const existingCats = Array.isArray(doc.article18Categories) ? (doc.article18Categories as string[]) : []
        if (existingCats.length === 0) data.article18Categories = ['SWEETS', 'FOOD']
      }
    }
    // それ以外（art_culture／public_tourism／transport／hotel／ginza_general等）は
    // venueKind='other'（スキーマ既定値）のまま——推測で個別店舗・百貨店に寄せない。

    if (Object.keys(data).length === 0) {
      unchanged++
      continue
    }

    changes.push(`${sourceId}: ${JSON.stringify(data)}`)
    if (!DRY) {
      await payload.update({ collection: 'source-ledger', id: doc.id, overrideAccess: true, data })
    }
    updated++
  }

  console.log(`結果: ${DRY ? '[dry-run] ' : ''}更新対象 ${updated} 件 / 変更なし ${unchanged} 件（総数 ${docs.length}）`)
  for (const c of changes) console.log(`  - ${c}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e))
  process.exit(1)
})
