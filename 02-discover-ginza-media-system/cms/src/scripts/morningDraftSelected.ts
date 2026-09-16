// GINZA WHISKERS / Project 02（2026-09-16続き6、マロン指示：V1 Stage 5 追加費用0円化）
// — Stage 5「選定後のnote原稿作成」のエントリポイント。
//
//   ./p2 morning-draft-selected <date> [--force]
//
// 【追加費用0円】Claude API / OpenAI API / その他有料APIを一切呼ばない。中核の
// 判定・生成ロジックは純粋関数 noteDraftFromSelection.prepareNoteDraftFromSelection
// （AI/DB/外部fetchなし・既存の決定的テンプレート生成経路を再利用）に分離済み——
// このスクリプトは DiscoveredContent / ArticleFacts の DB 読み取りと、全件検証後の
// atomic write だけを担う薄いラッパー。
//
// 【責務の境界】マロンが Stage 4（./p2 morning-select）で選んだ DC だけを原稿作成の
// 対象にする。このスクリプト自身は URL 再取得・再検索・再クロール・再裏どりを一切
// 行わない（外部ネットワークへは一切アクセスしない。DBの読み取りのみ）。
//
// 【全体を停止（all-or-nothing）】3件のうち1件でも「データ不整合」または
// 「templateEligible:false（必須情報の不足・未確認）」に該当する場合、**どの件も
// 保存せず**停止・報告する（推測で埋めない・途中までの原稿を保存しない）。
// 先に全3件を検証し、全件が生成可能と確認できてから初めて書き込む（2フェーズ）。
//
// 【二重生成防止】同じ日付の note-drafts.json が既に存在する場合は --force が無い
// 限り拒否する。書き込みは atomic write（一時ファイル→rename）。

import { getPayload } from 'payload'

import config from '../payload.config'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { toDcLike } from './morningRun'
import { toFactsLike } from '../lib/morning/toFactsLike'
import { prepareNoteDraftFromSelection, type PreparedNoteDraft } from '../lib/morning/noteDraftFromSelection'
import { atomicWriteFileSync } from '../lib/util/atomicWrite'
import type { MorningSelectionRecord } from '../lib/morning/selectionRecord'

interface StopItem {
  discoveredContentId: number
  reason: string
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const date = args[0]
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('エラー: 第1引数に対象日（YYYY-MM-DD）を指定してください。例: ./p2 morning-draft-selected 2026-09-16')
    process.exit(1)
  }
  const force = args.includes('--force')

  const dayRoot = resolve(process.cwd(), '..', '.devlogs', 'morning', date)
  const selectionPath = resolve(dayRoot, 'selection.json')
  if (!existsSync(selectionPath)) {
    console.error(
      `エラー: Stage 4 の選定記録が見つかりません: ${selectionPath}\n` +
        `先に ./p2 morning-select ${date} <dc1> <dc2> <dc3> を実行してください。`,
    )
    process.exit(1)
  }

  let record: MorningSelectionRecord
  try {
    record = JSON.parse(readFileSync(selectionPath, 'utf8')) as MorningSelectionRecord
  } catch (err) {
    console.error(`エラー: selection.json の読み取りに失敗しました: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
    return
  }
  if (!Array.isArray(record.picks) || record.picks.length !== 3 || !record.sweetsSatisfied) {
    console.error(
      'エラー: 選定記録が3本・SWEETS1本の条件を満たしていません（Stage 4 は本来この状態を' +
        '保存しないため、選定記録が破損している可能性があります）。推測で処理を続けず停止します。',
    )
    process.exit(1)
  }

  const draftsPath = resolve(dayRoot, 'note-drafts.json')
  if (existsSync(draftsPath) && !force) {
    console.error(
      `エラー: 本日のnote原稿は既に生成済みです（二重生成防止）: ${draftsPath}\n` +
        '再生成する場合は --force を指定してください。',
    )
    process.exit(1)
  }

  const payload = await getPayload({ config })

  // --- フェーズ1：全3件を検証する（DB読み取りのみ・ファイル書き込みなし） ---
  const prepared: PreparedNoteDraft[] = []
  const stopped: StopItem[] = []

  for (const pick of record.picks) {
    try {
      const dcRaw = (await payload.findByID({
        collection: 'discovered-content',
        id: pick.discoveredContentId,
        depth: 1,
        overrideAccess: true,
      })) as unknown as Record<string, unknown>
      const currentArticleUrl = (dcRaw.articleUrl as string | null) ?? null

      const factsRes = await payload.find({
        collection: 'article-facts',
        where: { discoveredContent: { equals: pick.discoveredContentId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const factsDoc = factsRes.docs[0] as unknown as Record<string, unknown> | undefined

      const result = prepareNoteDraftFromSelection({
        pick,
        currentArticleUrl,
        dc: toDcLike(dcRaw),
        facts: toFactsLike(factsDoc),
      })
      if (result.status === 'stopped') {
        stopped.push({ discoveredContentId: result.discoveredContentId, reason: result.reason })
      } else {
        prepared.push(result.draft)
      }
    } catch (err) {
      stopped.push({
        discoveredContentId: pick.discoveredContentId,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // --- 全体を停止（all-or-nothing）：1件でも失敗したら何も保存しない ---
  if (stopped.length > 0) {
    console.error('原稿作成を停止しました（1件でも問題があれば全体を保存しません）:')
    for (const s of stopped) console.error(`  - DC #${s.discoveredContentId}: ${s.reason}`)
    console.log(JSON.stringify({ saved: false, date, stopped }, null, 2))
    process.exit(1)
  }

  // --- フェーズ2：全件検証成功。ここで初めて書き込む（atomic write） ---
  const bundle = {
    date,
    generatedAt: new Date().toISOString(),
    method: 'template' as const, // AI不使用・決定的生成であることを明示
    selectionRecordSelectedAt: record.selectedAt,
    drafts: prepared,
  }
  const result = atomicWriteFileSync(draftsPath, JSON.stringify(bundle, null, 2), { force })
  if (!result.written) {
    console.error(`エラー: ${result.reason}`)
    process.exit(1)
  }

  console.log(JSON.stringify({ saved: true, path: draftsPath, count: prepared.length, drafts: prepared }, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
