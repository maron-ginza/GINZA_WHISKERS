// GINZA WHISKERS / Project 02（2026-09-22）— 候補不足時の自動フォールバック判定（CLI）。
//
// `./p2 am-run` が生成した .devlogs/morning/<date>/report.json の candidateBoard を
// 読み取り（DB書き込みなし・外部通信なし）、施設多様性フィルタ（facilityDiversityFilter.ts）
// を適用した上で、本日新規A候補／既存ボード全体（持ち越し含む）それぞれの
// SWEETS・その他件数を数え、candidateFallbackPlan.ts の判定に渡す。
//
// 【重要】本スクリプト自体はSWEETS限定補完取得（matsuya-sweets-fetch等）を
// 自動実行しない——判定結果（stage:'needs_supplementary_fetch'）を提示するのみ。
// 実際にその補完取得を実行するかどうかは、呼び出し元
// （morningAutoRun.sh の新規フェーズ、または人間の手動判断）に委ねる
// （追加のネットワークアクセス・課金を伴う可能性がある操作を、この読み取り専用
// スクリプト単体の判断で自動発火させない設計）。
//
// 使用例:
//   cd cms && node --env-file=.env --import=tsx/esm src/scripts/candidateFallbackCheck.ts [date] [--after-supplementary]

import { getPayload } from 'payload'
import config from '../payload.config'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { getPayloadWithRetry } from '../lib/util/getPayloadWithRetry'
import { applyFacilityDiversityFilter } from '../lib/morning/facilityDiversityFilter'
import { planCandidateFallback } from '../lib/morning/candidateFallbackPlan'
import type { BoardEntry, CandidateBoard } from '../lib/morning/candidateBoard'

const ROOT = path.resolve(process.cwd(), '..')

function flattenOther(board: CandidateBoard): BoardEntry[] {
  const out: BoardEntry[] = [...board.unclassified]
  for (const list of Object.values(board.byCategory)) out.push(...list)
  return out
}

function todayJstBoundsISO(dateStr: string): { startISO: string; endISO: string } {
  // dateStr は 'YYYY-MM-DD'（Asia/Tokyo基準の日付、呼び出し元＝./p2 crawl等と同じ規約）。
  // JST00:00〜翌日00:00 をUTCに変換（JST=UTC+9固定、夏時間なし）。
  const start = new Date(`${dateStr}T00:00:00+09:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { startISO: start.toISOString(), endISO: end.toISOString() }
}

async function main() {
  const args = process.argv.slice(2)
  const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a))
  const date = dateArg ?? new Date().toISOString().slice(0, 10)
  const afterSupplementary = args.includes('--after-supplementary')

  const reportPath = path.join(ROOT, '.devlogs', 'morning', date, 'report.json')
  if (!existsSync(reportPath)) {
    console.log(JSON.stringify({ error: `report.jsonが見つかりません（先に ./p2 am-run を実行してください）: ${reportPath}` }))
    process.exit(1)
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  const board: CandidateBoard = report.report?.candidateBoard
  if (!board) {
    console.log(JSON.stringify({ error: 'report.jsonにcandidateBoardがありません（形式不一致）' }))
    process.exit(1)
  }

  // 「本日新規」＝DiscoveredContent.createdAtが本日（Asia/Tokyo）のもの。
  // 【重要】detectedAtは毎回の巡回で更新される（discoveryStatusがunchangedでも
  // 更新される、DiscoveredContent.tsのフィールド説明に明記）ため「本日新規」の
  // 判定には使えない——初回検知（first_seen）時にのみレコードが新規作成される
  // Payload標準の createdAt を使う（2026-09-22、実データ検証で誤り〈detectedAt
  // 使用〉を発見し是正。DB読み取りのみ（書き込みなし）。
  //
  // 施設多様性フィルタ（1施設グループにつき1件）を適用する“前”に、本日新規の
  // 候補を先頭へ寄せておく——そうしないと、同一施設グループ内に「本日新規」と
  // 「持ち越しの古い候補」が両方存在する場合、単純な配列連結の並び順しだいで
  // 古い方が枠を取ってしまい、本日新規の候補が不当に隠れる
  // （2026-09-22、DC#1336〈本日新規・教文館〉がDC#438〈9/4検知・教文館〉に
  // 枠を奪われて隠れる実例をテスト実行中に発見・是正）。
  const payload = await getPayloadWithRetry(() => getPayload({ config }))
  const { startISO, endISO } = todayJstBoundsISO(date)
  const rawSweets = board.sweets
  const rawOther = flattenOther(board)
  const allIds = [...rawSweets, ...rawOther].map((e) => e.discoveredContentId)
  const newTodayIds = new Set<number>()
  if (allIds.length > 0) {
    const { docs } = await payload.find({
      collection: 'discovered-content',
      where: {
        and: [{ id: { in: allIds } }, { createdAt: { greater_than_equal: startISO } }, { createdAt: { less_than: endISO } }],
      },
      limit: allIds.length,
      depth: 0,
      overrideAccess: true,
    })
    for (const d of docs) newTodayIds.add(d.id as number)
  }

  function prioritizeNewToday(entries: BoardEntry[]): BoardEntry[] {
    // 安定ソート：本日新規(0)を先に、持ち越し(1)を後に。各グループ内の
    // 既存優先順位（rankCandidatesByPriority適用済み）は保持される。
    return [...entries].sort((a, b) => {
      const aOld = newTodayIds.has(a.discoveredContentId) ? 0 : 1
      const bOld = newTodayIds.has(b.discoveredContentId) ? 0 : 1
      return aOld - bOld
    })
  }

  const boardSweetsFiltered = applyFacilityDiversityFilter(prioritizeNewToday(rawSweets))
  const boardOtherFiltered = applyFacilityDiversityFilter(prioritizeNewToday(rawOther))

  const newSweetsCount = boardSweetsFiltered.selected.filter((e) => newTodayIds.has(e.discoveredContentId)).length
  const newOtherCount = boardOtherFiltered.selected.filter((e) => newTodayIds.has(e.discoveredContentId)).length

  const planInput = {
    newSweetsCount,
    newOtherCount,
    boardSweetsCount: boardSweetsFiltered.selected.length,
    boardOtherCount: boardOtherFiltered.selected.length,
    supplementaryFetchAttempted: afterSupplementary,
    ...(afterSupplementary
      ? {
          boardSweetsCountAfterSupplementary: boardSweetsFiltered.selected.length,
          boardOtherCountAfterSupplementary: boardOtherFiltered.selected.length,
        }
      : {}),
  }
  const plan = planCandidateFallback(planInput)

  console.log(
    JSON.stringify({
      date,
      counts: {
        newSweets: newSweetsCount,
        newOther: newOtherCount,
        boardSweets: boardSweetsFiltered.selected.length,
        boardOther: boardOtherFiltered.selected.length,
        excludedForFacilityDiversity: boardSweetsFiltered.excluded.length + boardOtherFiltered.excluded.length,
      },
      plan,
    }),
  )
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
