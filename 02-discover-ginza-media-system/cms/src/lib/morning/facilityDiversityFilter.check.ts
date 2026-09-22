// GINZA WHISKERS / Project 02（2026-09-22）— facilityDiversityFilter の回帰テスト。
//
//   node --import=tsx/esm src/lib/morning/facilityDiversityFilter.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { applyFacilityDiversityFilter } from './facilityDiversityFilter'
import type { BoardEntry } from './candidateBoard'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

function entry(
  id: number,
  facilityLabel: string,
  opts: { recentlyUsed?: boolean; parentFacilityLabel?: string } = {},
): BoardEntry {
  return {
    discoveredContentId: id,
    title: `候補${id}`,
    facilityLabel,
    category: 'SHOPPING',
    eventPeriod: '2026-09-01 〜 2026-09-30',
    sourceUrl: `https://example.com/${id}`,
    reasons: [],
    facilityNotice: opts.recentlyUsed
      ? {
          recentlyUsed: true,
          parentFacilityLabel: opts.parentFacilityLabel ?? null,
          lastUsedDate: '2026-09-20T00:00:00.000Z',
          lastArticleId: 1,
          daysSince: 1,
          message: 'test',
        }
      : undefined,
  }
}

const cases: CheckCase[] = [
  {
    name: '施設グループが全て異なれば全件選ばれる',
    fn: () => {
      const entries = [entry(1, '歌舞伎座'), entry(2, '松屋銀座'), entry(3, '教文館')]
      const r = applyFacilityDiversityFilter(entries)
      assert(r.selected.length === 3, '3件とも選ばれるはず')
      assert(r.excluded.length === 0, '除外はないはず')
    },
  },
  {
    name: 'GINZA SIXと銀座蔦屋書店は facilityNotice が無くても（直近未使用でも）同一施設グループとして1件しか選ばれない（2026-09-22発見の欠落の再発防止）',
    fn: () => {
      const entries = [entry(1, 'GINZA SIX'), entry(2, '銀座 蔦屋書店')]
      const r = applyFacilityDiversityFilter(entries)
      assert(r.selected.length === 1, `1件のみ選ばれるはず（実際 ${r.selected.length}）`)
      assert(r.excluded.length === 1, '1件は除外されるはず')
      assert(r.excluded[0].entry.discoveredContentId === 2, '後順位の候補（2件目）が除外されるはず')
    },
  },
  {
    name: 'GINZA SIXと銀座蔦屋書店（facilityNotice直近使用ありの場合も）は1件しか選ばれない',
    fn: () => {
      const entries = [
        entry(1, 'GINZA SIX', { recentlyUsed: true, parentFacilityLabel: 'GINZA SIX（蔦屋書店含む）' }),
        entry(2, '銀座 蔦屋書店', { recentlyUsed: true, parentFacilityLabel: 'GINZA SIX（蔦屋書店含む）' }),
      ]
      const r = applyFacilityDiversityFilter(entries)
      assert(r.selected.length === 1, `1件のみ選ばれるはず（実際 ${r.selected.length}）`)
    },
  },
  {
    name: '同一施設グループが3件あればmaxPerFacilityGroup=2で2件まで選ばれる',
    fn: () => {
      const entries = [entry(1, '歌舞伎座'), entry(2, '歌舞伎座'), entry(3, '歌舞伎座')]
      const r = applyFacilityDiversityFilter(entries, { maxPerFacilityGroup: 2 })
      assert(r.selected.length === 2, `2件のはず（実際 ${r.selected.length}）`)
      assert(r.excluded.length === 1, '1件は除外されるはず')
    },
  },
  {
    name: '直近使用済み（facilityNotice.recentlyUsed）の候補は同点内で後方へ回される',
    fn: () => {
      const entries = [
        entry(1, '教文館', { recentlyUsed: true, parentFacilityLabel: '教文館' }), // 直近使用済み
        entry(2, '歌舞伎座'), // 未使用
      ]
      const r = applyFacilityDiversityFilter(entries)
      assert(r.selected.length === 2, '両方とも施設グループが異なるので2件とも選ばれる')
      assert(r.selected[0].discoveredContentId === 2, `未使用の候補が先に来るはず（実際 ${r.selected[0].discoveredContentId}）`)
      assert(r.selected[1].discoveredContentId === 1, '直近使用済みの候補は後ろに回るはず')
    },
  },
  {
    name: '他に代替が無い場合、直近使用済みの候補でも除外はされず選ばれる（過度な不足を防ぐ）',
    fn: () => {
      const entries = [entry(1, '松屋銀座', { recentlyUsed: true, parentFacilityLabel: '松屋銀座' })]
      const r = applyFacilityDiversityFilter(entries)
      assert(r.selected.length === 1, '唯一の候補は除外されず選ばれるはず')
      assert(r.excluded.length === 0, '除外はないはず')
    },
  },
  {
    name: 'facilityKey.tsで解決できない施設名は施設ラベル自体をグループキーとして扱う',
    fn: () => {
      const entries = [entry(1, '未知の店舗XYZ'), entry(2, '未知の店舗XYZ')]
      const r = applyFacilityDiversityFilter(entries)
      assert(r.selected.length === 1, '同一ラベルなら同一グループ扱いで1件のみ選ばれるはず')
    },
  },
  {
    name: '除外理由に施設グループ名が含まれる（マロンへの透明性）',
    fn: () => {
      const entries = [entry(1, '歌舞伎座'), entry(2, '歌舞伎座')]
      const r = applyFacilityDiversityFilter(entries)
      assert(r.excluded[0].reason.includes('kabukiza') || r.excluded[0].reason.includes('歌舞伎座'), '除外理由に施設グループ名が含まれるはず')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('facilityDiversityFilter', cases)
