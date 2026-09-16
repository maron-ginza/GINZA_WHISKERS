// GINZA WHISKERS / Project 02（2026-09-16続き5、マロン指示：V1 5段階責任分離）
// — Stage 5「選定後のnote原稿作成」のエントリポイント。
//
//   ./p2 morning draft-selected <date> [--yes]
//
// 【責務の境界】マロンが Stage 4（./p2 morning select）で選んだ DC だけを原稿作成の
// 対象にする。Stage 1（A判定）時に確認済み・DBへ保存済みの情報だけを使う——このスクリプト
// 自身は URL 再取得・再検索・再クロール・再裏どりを一切行わない（外部ネットワークへは
// 一切アクセスしない）。公式情報に記載がない内容は既存の生成プロンプト側の方針
// （Editorial Trust Layer）どおり「公式記載なし」として扱い、推測・補完はしない。
//
// 【整合性チェック】Stage 4 選定時点で記録した sourceUrl と、現在 DB に保存されている
// DiscoveredContent.articleUrl を突合する。一致しない場合は選定後にデータが変わった
// 可能性があるため、再調査・推測はせず「データ不整合」として当該DCだけ停止・報告する
// （他のDCの処理は継続する）。
//
// 【生成前提】既存の createMultiAngleDraftsFromDiscoveredContent は
// curationStatus==='approved' を必須とする（既存のMaron Editor's Choice承認ゲート、
// このスクリプトでは変更しない）。Stage 4 の選定記録があっても未承認なら「承認が必要」
// として原稿作成をブロックする——このスクリプトが承認状態を書き換えることはない。
//
// 【費用】--yes を指定した場合のみ Claude API を呼ぶ（実際の課金が発生する）。
// --yes 未指定（既定）は「何を生成する予定か」の計画表示のみで、API 呼び出し・
// DB 書き込みは一切行わない。

import { getPayload } from 'payload'

import config from '../payload.config'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createMultiAngleDraftsFromDiscoveredContent } from '../lib/ai/createMultiAngleDraftsFromDiscoveredContent'
import type { MorningSelectionRecord } from '../lib/morning/selectionRecord'

interface ItemResult {
  discoveredContentId: number
  status: 'created' | 'blocked' | 'inconsistent' | 'dry-run' | 'error'
  detail: string
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const date = args[0]
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('エラー: 第1引数に対象日（YYYY-MM-DD）を指定してください。例: ./p2 morning draft-selected 2026-09-16')
    process.exit(1)
  }
  const yes = args.includes('--yes')

  const selectionPath = resolve(process.cwd(), '..', '.devlogs', 'morning', date, 'selection.json')
  if (!existsSync(selectionPath)) {
    console.error(`エラー: 選定記録が見つかりません: ${selectionPath}\n先に ./p2 morning select ${date} <dc1> <dc2> <dc3> を実行してください。`)
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
  if (!Array.isArray(record.picks) || record.picks.length === 0) {
    console.error('エラー: 選定記録に picks がありません。')
    process.exit(1)
  }

  const payload = await getPayload({ config })
  const results: ItemResult[] = []

  for (const pick of record.picks) {
    try {
      const dc = await payload.findByID({
        collection: 'discovered-content',
        id: pick.discoveredContentId,
        depth: 1,
        overrideAccess: true,
      })
      const currentUrl = (dc as unknown as { articleUrl?: string | null }).articleUrl ?? ''

      // データ不整合チェック：選定時点の sourceUrl と現在の articleUrl が食い違っていれば、
      // 選定後にデータが変わった可能性がある——推測で読み替えず停止・報告する。
      if (pick.sourceUrl && currentUrl && pick.sourceUrl !== currentUrl) {
        results.push({
          discoveredContentId: pick.discoveredContentId,
          status: 'inconsistent',
          detail: `Stage 4 選定時の公式URLと現在のDBの値が異なります（選定時: ${pick.sourceUrl} / 現在: ${currentUrl}）。再調査・推測はせず停止します。`,
        })
        continue
      }

      const curationStatus = (dc as unknown as { curationStatus?: string | null }).curationStatus ?? null
      if (curationStatus !== 'approved') {
        results.push({
          discoveredContentId: pick.discoveredContentId,
          status: 'blocked',
          detail: `curationStatus が approved ではありません（現在: ${curationStatus ?? '未設定'}）。既存のMaron Editor's Choice承認を先に行ってください（このスクリプトは承認状態を変更しません）。`,
        })
        continue
      }

      if (!yes) {
        results.push({
          discoveredContentId: pick.discoveredContentId,
          status: 'dry-run',
          detail: '生成可能（--yes 未指定のため実行していません。--yes 指定時に Claude API を1回呼び出します＝課金発生）。',
        })
        continue
      }

      // 既存の生成関数をそのまま再利用（新しいAI呼び出しスキーマは追加しない）。
      // CORE角度のみ（draft-today と同じ方針）。URL再取得・再クロールはこの関数内でも行わない。
      const created = await createMultiAngleDraftsFromDiscoveredContent(payload, pick.discoveredContentId, {
        angles: ['core'],
        enableCoreGuards: true,
      })
      results.push({
        discoveredContentId: pick.discoveredContentId,
        status: 'created',
        detail: `Article作成: ${created.createdArticles.map((a) => `#${a.id}`).join(', ') || '（なし）'}`,
      })
    } catch (err) {
      results.push({
        discoveredContentId: pick.discoveredContentId,
        status: 'error',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }

  console.log(JSON.stringify({ date, dryRun: !yes, results }, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
