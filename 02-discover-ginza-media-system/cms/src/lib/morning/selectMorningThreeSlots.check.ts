// GINZA WHISKERS / Project 02（2026-09-16）— 朝の3枠選出（純粋関数）の回帰テスト。
//
//   node --import=tsx/esm src/lib/morning/selectMorningThreeSlots.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { assessCandidate, type AssessCandidateInput } from './assessCandidate'
import { selectMorningThreeSlots } from './selectMorningThreeSlots'
import type { CandidateAssessment } from './types'
import type { DiscoveredContentLike } from '../template/mapDiscoveredContentToEventFields'
import type { FacilityActivityRecord } from './facilityActivityHistory'

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
  parentFacilityKey: string | null = null,
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
    parentFacilityKey,
    parentFacilityLabel: parentFacilityKey,
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

  // ---------- 施設単位の14日間抑制（2026-09-16追加・マロン指示） ----------
  {
    // 実例＝DC#313（GINZA SIXの「アクシージア×mika ninagawaコラボ」）。GINZA SIX施設で
    // 直近にArticleが作成されている場合、facilityCooldownSkipとして繰り上げ対象になる
    // （候補自体は削除しない・次点候補が選ばれる）。
    name: 'DC#313回帰: GINZA SIX施設で直近にArticle作成があれば facilityCooldownSkip（同カテゴリーの次点が繰り上がる）',
    fn: () => {
      const dc313 = mkA(313, 'SHOPPING', 'ginza-six', {}, 'PARENT_GINZA_SIX')
      const altBeauty = mkA(999, 'BEAUTY', 'wako-ginza')
      const history: FacilityActivityRecord[] = [
        {
          groupKey: 'PARENT_GINZA_SIX',
          facilityKey: 'ginza-six',
          facilityLabel: 'GINZA SIX',
          date: '2026-09-14T00:00:00.000Z', // NOW=2026-09-16の2日前
          source: 'article',
          detail: 'Article #70 作成',
        },
      ]
      const r = selectMorningThreeSlots([dc313, altBeauty], { facilityHistory: history, now: NOW })
      const slot = r.slots.find((s) => s.bucketKey === 'BEAUTY_FASHION')
      assert(slot?.candidate?.discoveredContentId === 999, `DC#313は抑制され次点999が選ばれる（実際 ${slot?.candidate?.discoveredContentId}）`)
      assert(
        r.facilityCooldownSkips.some((s) => s.discoveredContentId === 313),
        'DC#313はfacilityCooldownSkipとして理由付きで記録される（削除はしない）',
      )
    },
  },
  {
    // 実例＝DC#532（山野楽器「ASTURIASクラシックギターフェア」）。同じ山野楽器
    // （parentFacilityKey='PARENT_YAMANO_GINZA'）で5日前にArticle作成済み（Article #63
    // 「弦楽器フェア2026」）→ facilityCooldownSkip。
    name: 'DC#532回帰: 山野楽器の5日前のArticle作成によりfacilityCooldownSkip（parentFacilityKeyで一致判定）',
    fn: () => {
      const dc532 = mkA(532, 'MUSIC', 'yamano-music-ginza', {}, 'PARENT_YAMANO_GINZA')
      const altArt = mkA(998, 'ART', 'ginza-tsutaya')
      const history: FacilityActivityRecord[] = [
        {
          groupKey: 'PARENT_YAMANO_GINZA',
          facilityKey: 'yamano-music-ginza',
          facilityLabel: '山野楽器 銀座本店',
          date: '2026-09-11T01:12:04.668Z', // NOW=2026-09-16の5日前（Article #63実績）
          source: 'article',
          detail: 'Article #63 作成',
        },
      ]
      const r = selectMorningThreeSlots([dc532, altArt], { facilityHistory: history, now: NOW })
      const slot = r.slots.find((s) => s.bucketKey === 'CULTURE_ART')
      assert(slot?.candidate?.discoveredContentId === 998, `DC#532は抑制され次点998が選ばれる（実際 ${slot?.candidate?.discoveredContentId}）`)
      assert(
        r.facilityCooldownSkips.some((s) => s.discoveredContentId === 532 && s.reason.includes('山野楽器')),
        'DC#532はfacilityCooldownSkipとして理由（山野楽器）付きで記録される',
      )
    },
  },
  {
    name: '施設クールダウンは14日を超えると解除される（15日前の活動は抑制しない）',
    fn: () => {
      const dc = mkA(41, 'ART', 'ginza-tsutaya', {}, 'PARENT_GINZA_SIX')
      const history: FacilityActivityRecord[] = [
        {
          groupKey: 'PARENT_GINZA_SIX',
          facilityKey: 'ginza-six',
          facilityLabel: 'GINZA SIX',
          date: '2026-09-01T00:00:00.000Z', // NOW=2026-09-16の15日前
          source: 'article',
          detail: 'Article #1 作成',
        },
      ]
      const r = selectMorningThreeSlots([dc], { facilityHistory: history, now: NOW })
      const slot = r.slots.find((s) => s.bucketKey === 'CULTURE_ART')
      assert(slot?.candidate?.discoveredContentId === 41, `15日前は抑制対象外（実際 ${slot?.candidate?.discoveredContentId}）`)
      assert(r.facilityCooldownSkips.length === 0, '15日前はfacilityCooldownSkipに記録されない')
    },
  },
  {
    name: '同一親施設（parentFacilityKey）も3枠を通じて1件まで——facilityKeyが異なっても同一親なら2件目はスキップ',
    fn: () => {
      // ginza-six と ginza-tsutaya は facilityKey は別だが同じ PARENT_GINZA_SIX
      const beauty = mkA(71, 'BEAUTY', 'ginza-six', {}, 'PARENT_GINZA_SIX')
      const art = mkA(72, 'ART', 'ginza-tsutaya', {}, 'PARENT_GINZA_SIX')
      const altArt = mkA(73, 'ART', 'kabukiza')
      const r = selectMorningThreeSlots([beauty, art, altArt])
      const artSlot = r.slots.find((s) => s.bucketKey === 'CULTURE_ART')
      assert(artSlot?.candidate?.discoveredContentId === 73, `同一親施設72はスキップされ73が選ばれる（実際 ${artSlot?.candidate?.discoveredContentId}）`)
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('selectMorningThreeSlots', cases)
