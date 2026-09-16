// GINZA WHISKERS / Project 02（2026-09-16）— 朝の3枠選出（純粋関数）の回帰テスト。
//
//   node --import=tsx/esm src/lib/morning/selectMorningThreeSlots.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { assessCandidate, type AssessCandidateInput } from './assessCandidate'
import { selectMorningThreeSlots } from './selectMorningThreeSlots'
import type { CandidateAssessment } from './types'
import type { DiscoveredContentLike } from '../template/mapDiscoveredContentToEventFields'

const NOW = new Date('2026-09-16T00:00:00Z')
const FUTURE_ISO = '2026-10-25T04:00:00Z'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

function baseDc(over: Partial<DiscoveredContentLike> = {}): DiscoveredContentLike {
  return {
    id: 999,
    title: '銀座で新作コレクション発売',
    excerpt: '季節限定・只今発売中です。',
    articleUrl: 'https://www.ginza.jp/event/99999',
    sourceSiteName: 'GINZA OFFICIAL',
    publishedAt: null,
    contentUpdatedAt: null,
    eventStartAt: FUTURE_ISO,
    eventEndAt: FUTURE_ISO,
    venue: '銀座中央通り',
    contentType: 'event',
    uxType: null,
    lastCheckedAt: '2026-09-15T21:00:00Z',
    detectedAt: '2026-09-15T21:00:00Z',
    dateExtraction: null,
    ...over,
  }
}

/** 確実に verdict='A' になる CandidateAssessment を作り、digestMeta（category/facilityKey）を上書きする */
function mkA(
  id: number,
  category: string | null,
  facilityKey: string | null,
  over: Partial<AssessCandidateInput> = {},
): CandidateAssessment {
  const a = assessCandidate({
    dc: baseDc({ id, ...over.dc }),
    facts: undefined,
    dedup: { duplicate: false },
    imageInventory: [],
    now: NOW,
    ...over,
  })
  if (a.verdict !== 'A') throw new Error(`fixture 前提が崩れている: id=${id} は A のはずが ${a.verdict}`)
  a.digestMeta = {
    venue: null,
    officialFetch: null,
    priceHint: null,
    facilityKey,
    facilityLabel: facilityKey ?? '',
    category,
    categoryBasis: category ? 'title' : null,
    publishedAt: null,
    origin: 'approved',
  }
  return a
}

const cases: CheckCase[] = [
  {
    name: '各バケットから1件ずつ選ばれる（3枠すべて埋まる）',
    fn: () => {
      const beauty = mkA(1, 'BEAUTY', 'shiseido-ginza')
      const gourmet = mkA(2, 'SWEETS', 'kyobunkwan-ginza')
      const art = mkA(3, 'ART', 'ginza-tsutaya')
      const r = selectMorningThreeSlots([beauty, gourmet, art])
      assert(r.slots.length === 3, '3枠')
      assert(r.slots[0].bucketKey === 'BEAUTY_FASHION' && r.slots[0].candidate?.discoveredContentId === 1, 'ビューティー・ファッション枠')
      assert(r.slots[1].bucketKey === 'GOURMET_SWEETS' && r.slots[1].candidate?.discoveredContentId === 2, 'グルメ・スウィーツ枠')
      assert(r.slots[2].bucketKey === 'CULTURE_ART' && r.slots[2].candidate?.discoveredContentId === 3, '文化・アート枠')
    },
  },
  {
    name: 'SHOPPING はビューティー・ファッション枠、FOOD/CAFE はグルメ・スウィーツ枠、PHOTO/MUSIC は文化・アート枠に入る',
    fn: () => {
      const shopping = mkA(11, 'SHOPPING', 'wako-ginza')
      const food = mkA(12, 'FOOD', 'ginza-motoji')
      const photo = mkA(13, 'PHOTO', 'pola-annex-ginza')
      const r = selectMorningThreeSlots([shopping, food, photo])
      assert(r.slots[0].candidate?.discoveredContentId === 11, 'SHOPPING→ビューティー・ファッション')
      assert(r.slots[1].candidate?.discoveredContentId === 12, 'FOOD→グルメ・スウィーツ')
      assert(r.slots[2].candidate?.discoveredContentId === 13, 'PHOTO→文化・アート')
    },
  },
  {
    name: '未分類（category null）はA判定でも3枠に入らない（推測で分類しない）',
    fn: () => {
      const unclassified = mkA(21, null, 'some-facility')
      const art = mkA(22, 'ART', 'ginza-tsutaya')
      const r = selectMorningThreeSlots([unclassified, art])
      assert(r.slots[2].candidate?.discoveredContentId === 22, '文化・アートにはARTが入る')
      assert(!r.slots.some((s) => s.candidate?.discoveredContentId === 21), '未分類候補はどの枠にも入らない')
    },
  },
  {
    name: '同一施設は3枠を通じて1件まで——2枠目の同施設候補はスキップし次点を選ぶ',
    fn: () => {
      const beauty = mkA(31, 'BEAUTY', 'ginza-six')
      // ART候補がginza-six施設で先に来る（idが小さい）が、BEAUTYが既にginza-sixを使用済みなのでスキップされ、
      // 次点の別施設ART候補が選ばれるはず
      const artSameFacility = mkA(32, 'ART', 'ginza-six')
      const artOtherFacility = mkA(33, 'ART', 'kabukiza')
      const r = selectMorningThreeSlots([beauty, artSameFacility, artOtherFacility])
      assert(r.slots[0].candidate?.discoveredContentId === 31, 'ビューティー・ファッションは31')
      assert(r.slots[2].candidate?.discoveredContentId === 33, '文化・アートは同一施設32をスキップし33を選ぶ')
    },
  },
  {
    name: '該当A候補が無いバケットは candidate:null・emptyReason つきで返す（Bで埋めない）',
    fn: () => {
      const art = mkA(41, 'ART', 'ginza-tsutaya')
      const r = selectMorningThreeSlots([art])
      const beautySlot = r.slots.find((s) => s.bucketKey === 'BEAUTY_FASHION')
      assert(beautySlot?.candidate === null, 'ビューティー・ファッションは該当なし')
      assert(!!beautySlot?.emptyReason, 'emptyReason が付く')
    },
  },
  {
    name: 'B・C判定の候補は3枠の対象外（Aのみ対象）',
    fn: () => {
      const bCandidate = mkA(51, 'ART', 'ginza-tsutaya')
      bCandidate.verdict = 'B' // 疑似的にB化
      const r = selectMorningThreeSlots([bCandidate])
      const artSlot = r.slots.find((s) => s.bucketKey === 'CULTURE_ART')
      assert(artSlot?.candidate === null, 'B判定はA専用の3枠には入らない')
    },
  },
  {
    name: '開催・販売期間が構造化データで確認済みの候補を優先する（eventPeriod!==不明を優先）',
    fn: () => {
      const confirmed = mkA(61, 'ART', 'a-facility')
      confirmed.eventPeriod = '2026-10-01'
      const unconfirmed = mkA(62, 'ART', 'b-facility')
      unconfirmed.eventPeriod = '不明'
      const r = selectMorningThreeSlots([unconfirmed, confirmed])
      const artSlot = r.slots.find((s) => s.bucketKey === 'CULTURE_ART')
      assert(artSlot?.candidate?.discoveredContentId === 61, '期間確認済みの61が優先される')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('selectMorningThreeSlots', cases)
