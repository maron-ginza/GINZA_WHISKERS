import { getPayload } from 'payload'

import config from '../payload.config'
import { DEFAULTS, nodeText, writeBackup } from '../lib/tns/maintenance'

// 🌈TNS #36 note投稿前 最終編集（2026-08-30、一回限り）。
//
//   node --env-file=.env --import=tsx/esm src/scripts/tnsFinalEditEdition36.ts [--dry-run]
//
// 現在DBを正として読み、exact-match（各1回一致）でのみ置換する。
// reviewStatus != draft / editionNumber != 36 なら中断。実適用前に
// _backups/ へ locale:'all' の JSON バックアップを作成する。
//
// 変更内容（マロン指示）:
//   2. GINZA CODE 7 の日本語ラベル「Soft-Cloud Ginza」→「新しい季節へ」。
//      英語サブタイトルも自然な表現へ。
//   3. 本文から「EDITORIAL POINT OF VIEW」という内部的な見出しを7日分すべて削除。
//      各EPOVの内容は削除せず、その日の選曲コメントへ自然に統合する。
//   4. 7曲・曜日構成・挿絵紐付け・重複チェック結果は一切変更しない
//      （musicSelected.trackRef / dailyScenes の並び / image には触れない）。
//   1. 天気は本スクリプトでは変更しない（別途 要確認）。

const EDITION_ID = DEFAULTS.editionId // 11
const ARTICLE_ID = DEFAULTS.articleId // 50

// ── 本文 exact-match 置換（それぞれちょうど1回一致すること）──────────
const BODY_REPLACEMENTS: Array<[string, string]> = [
  // 2. GINZA CODE 7
  [
    '2026-09-06（日曜日）｜GINZA CODE 7：Soft-Cloud Ginza',
    '2026-09-06（日曜日）｜GINZA CODE 7：新しい季節へ',
  ],
  ['Soft-Cloud Ginza Under a Clear Sky', 'Where a New Season Begins Under a Clear Sky'],
  // 3. EPOV を各日の選曲コメントへ統合（コメント段落を差し替え）
  [
    '静かな一歩を後押しするような、まっすぐな軽さを持つ一曲。',
    '月曜の切り替えと、まだ夏に留まる季節の感覚が重なる朝に。静かな一歩を後押しするような、まっすぐな軽さを持つ一曲を選んだ。',
  ],
  [
    '遠い記憶を呼び覚ますような旋律が、午後の静けさにそっと寄り添う。',
    '同じ曇り空でも、心の動きは昨日と違う。感傷のための余白を少しだけ——遠い記憶を呼び覚ますような旋律が、午後の静けさにそっと寄り添う。',
  ],
  [
    '曲名そのものが、季節の切り替わりをそっと予告するように響く。',
    '週の折り返しに、「季節の境目」という今週のテーマがちょうど重なる。半分だけ回った季節を水曜の気だるさとともに——曲名そのものが、季節の切り替わりをそっと予告するように響く。',
  ],
  [
    '雨に濡れた銀座の情景に、この曲の透明感がよく似合う。',
    '一時の雨が、木曜の落ち着きと季節の移ろいの両方を連れてくる。雨音に街の音がやわらぐ時間、雨に濡れた銀座の情景に、この曲の透明感がよく似合う。',
  ],
  [
    '夜の始まりにふさわしい、涼しさをまとった一曲。',
    '雨上がりの気温の下がりが、夜の空気を軽くする金曜。涼やかさと解放感を重ねて、夜の始まりにふさわしい、涼しさをまとった一曲を。',
  ],
  [
    '高ぶりのあとの静けさに、この曲のやわらかさがよく馴染む。',
    '金曜の高揚が静かに引いたあとの土曜。高ぶりのあとの静けさに、この曲のやわらかさがよく馴染む。霧雨の週末の静けさに重ね、翌日の余韻へそっと橋を渡すように。',
  ],
  [
    '広がる青空に、この曲の伸びやかさがよく似合う週の結び。',
    '晴れ渡った空と季節の境目で、一週間を閉じる。新しい季節へと視線を移すこの日の清々しさに、広がる青空によく似合う、この曲の伸びやかさを週の結びとして置いた。',
  ],
]

// dailyScenes[].musicSelected.readerFacingComment を本文コメントと同期させる
const COMMENT_SYNC = new Map(BODY_REPLACEMENTS.slice(2))

const EPOV_PREFIX = 'EDITORIAL POINT OF VIEW'

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const payload = await getPayload({ config })

  const edition = (await payload.findByID({ collection: 'soundtrack-editions', id: EDITION_ID, depth: 0 })) as Record<
    string,
    any
  >
  const article = (await payload.findByID({
    collection: 'articles',
    id: ARTICLE_ID,
    locale: 'ja',
    depth: 0,
  })) as Record<string, any>

  // ── ガード ───────────────────────────────────────────────
  const guards: string[] = []
  if (!edition) guards.push(`soundtrack-editions id=${EDITION_ID} が見つからない`)
  if (!article) guards.push(`articles id=${ARTICLE_ID} が見つからない`)
  if (edition && Number(edition.editionNumber) !== 36) guards.push(`editionNumber=${edition.editionNumber}（期待 36）`)
  if (article && article.reviewStatus !== 'draft') guards.push(`reviewStatus="${article.reviewStatus}"（draft のみ許可）`)
  if (guards.length) {
    console.error('[abort]')
    for (const g of guards) console.error('  - ' + g)
    process.exit(2)
  }

  // ── 本文の変換（deep copy 上で）──────────────────────────
  const body = JSON.parse(JSON.stringify(article.body)) as {
    root: { children: Array<{ children?: Array<{ text?: string }> }> }
  }
  const changeLog: string[] = []

  // 3a. EPOV 段落を削除
  const before = body.root.children.length
  const removed: string[] = []
  body.root.children = body.root.children.filter((c) => {
    const t = nodeText(c)
    if (t.startsWith(EPOV_PREFIX)) {
      removed.push(t)
      return false
    }
    return true
  })
  if (removed.length !== 7) {
    console.error(`[abort] 「${EPOV_PREFIX}」段落が7件ではなく ${removed.length}件でした（現在DBの構造が想定と異なる）`)
    process.exit(2)
  }
  changeLog.push(`本文: 「${EPOV_PREFIX}」見出し段落を7件削除（${before} -> ${body.root.children.length} ブロック）`)

  // 2 + 3b. exact-match 置換
  const notFound: string[] = []
  for (const [oldText, newText] of BODY_REPLACEMENTS) {
    let hits = 0
    for (const child of body.root.children) {
      const leaves = child.children
      if (leaves && leaves.length === 1 && leaves[0].text === oldText) {
        leaves[0].text = newText
        hits++
      }
    }
    if (hits !== 1) notFound.push(`(${hits}回一致) ${oldText.slice(0, 50)}`)
    else changeLog.push(`本文: "${oldText.slice(0, 32)}…" -> "${newText.slice(0, 42)}…"`)
  }
  if (notFound.length) {
    console.error('[abort] 想定テキストが1回一致しませんでした:')
    for (const s of notFound) console.error('  - ' + s)
    process.exit(2)
  }

  // ── edition（dailyScenes）の変換 ────────────────────────
  const scenes = JSON.parse(JSON.stringify(edition.dailyScenes)) as Array<Record<string, any>>
  const sun = scenes.find((s) => s.weekday === 'sunday')
  if (!sun) {
    console.error('[abort] dailyScenes に sunday が無い')
    process.exit(2)
  }
  sun.tnsEditorialCode.fixedMoodLabel = '新しい季節へ'
  sun.tnsEditorialCode.weeklyEnglishSubtitle = 'Where a New Season Begins Under a Clear Sky'
  sun.editorialPointOfView = '晴天と季節の境目という週の締めくくりに、「新しい季節へ」という視点を重ねた。'
  changeLog.push('edition: dailyScenes[日].tnsEditorialCode.fixedMoodLabel "Soft-Cloud Ginza" -> "新しい季節へ"')
  changeLog.push('edition: dailyScenes[日].tnsEditorialCode.weeklyEnglishSubtitle -> "Where a New Season Begins Under a Clear Sky"')
  changeLog.push('edition: dailyScenes[日].editorialPointOfView（内部メモ）を新ラベルへ更新')

  let syncCount = 0
  for (const s of scenes) {
    const cur = s.musicSelected?.readerFacingComment
    if (cur && COMMENT_SYNC.has(cur)) {
      s.musicSelected.readerFacingComment = COMMENT_SYNC.get(cur)
      syncCount++
    }
  }
  if (syncCount !== 7) {
    console.error(`[abort] readerFacingComment の同期対象が7件ではなく ${syncCount}件でした`)
    process.exit(2)
  }
  changeLog.push('edition: dailyScenes[*].musicSelected.readerFacingComment を本文コメントに同期（7件）')

  // ── 出力 / 適用 ────────────────────────────────────────
  console.log('=== 変更箇所一覧 ===')
  for (const l of changeLog) console.log('  - ' + l)

  if (dryRun) {
    console.log('\n[dry-run] DB書き込みなし。実適用時は _backups/ にバックアップを作成します。')
    process.exit(0)
  }

  const backupPath = await writeBackup(payload, { editionId: EDITION_ID, articleId: ARTICLE_ID, editionNumber: 36, skipNumberCheck: false }, 'final_edit_before')

  await payload.update({ collection: 'articles', id: ARTICLE_ID, locale: 'ja', data: { body: body as never } })
  await payload.update({ collection: 'soundtrack-editions', id: EDITION_ID, data: { dailyScenes: scenes as never } })

  console.log(`\n[done] 適用しました（reviewStatus は draft のまま）。バックアップ: ${backupPath}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
