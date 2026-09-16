// GINZA WHISKERS / Project 02（2026-09-16続き2）— 朝候補選定（純粋関数）の回帰テスト。
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

/** 確実に verdict='A' になる CandidateAssessment を作り、digestMeta（category/facilityKey）を上書きする。
 *  既定では baseDc() の構造化 eventStartAt/eventEndAt により「現在性の根拠=構造化データ」の
 *  安全な候補になる（isDateBackedCurrency:true）。 */
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

/** 現在性の根拠が「明記語のみ」（構造化データなし・タイトルに具体的な年月日なし）の
 *  “unsafe” な A 判定候補を作る（DC#294クラス：「好評開催中！」のような文言）。 */
function mkUnsafeA(id: number, category: string | null, facilityKey: string | null): CandidateAssessment {
  const a = assessCandidate({
    dc: baseDc({
      id,
      title: '好評開催中！新商品のご案内',
      excerpt: null,
      eventStartAt: null,
      eventEndAt: null,
    }),
    facts: undefined,
    dedup: { duplicate: false },
    imageInventory: [],
    now: NOW,
  })
  if (a.verdict !== 'A') throw new Error(`fixture 前提が崩れている: id=${id} は A のはずが ${a.verdict}（reasons=${a.reasons.join('|')}）`)
  assert(!a.reasons.some((r) => r.includes('構造化データ') || r.includes('具体的な開催日')), `unsafe fixture のはずが date-backed になっている: ${a.reasons.join('|')}`)
  a.digestMeta = {
    venue: null,
    officialFetch: null,
    priceHint: null,
    facilityKey,
    facilityLabel: facilityKey ?? '',
    parentFacilityKey: null,
    parentFacilityLabel: null,
    category,
    categoryBasis: category ? 'title' : null,
    publishedAt: null,
    origin: 'approved',
  }
  return a
}

const cases: CheckCase[] = [
  {
    name: '18カテゴリー全体から最も価値の高い最大3件を選ぶ（固定枠なし）。自然な上位3件が最低1件の必須カテゴリーを含む場合はそのまま',
    fn: () => {
      const beauty = mkA(1, 'BEAUTY', 'shiseido-ginza')
      const art = mkA(2, 'ART', 'ginza-tsutaya')
      const music = mkA(3, 'MUSIC', 'yamano-music-ginza')
      const r = selectMorningThreeSlots([beauty, art, music])
      assert(r.picks.length === 3, `3件選出（実際 ${r.picks.length}）`)
      assert(r.picks.map((p) => p.candidate.discoveredContentId).join(',') === '1,2,3', 'id昇順（価値の代理指標）で1,2,3が選ばれる')
      assert(r.requiredCategorySatisfied === true, '必須カテゴリー（BEAUTY）を含む')
    },
  },
  {
    name: '文化・アートは必須にしない——ART候補が無くても3件選出できる',
    fn: () => {
      const beauty = mkA(11, 'BEAUTY', 'shiseido-ginza')
      const food = mkA(12, 'FOOD', 'ginza-motoji')
      const shopping = mkA(13, 'SHOPPING', 'wako-ginza')
      const r = selectMorningThreeSlots([beauty, food, shopping])
      assert(r.picks.length === 3, `ART無しでも3件（実際 ${r.picks.length}）`)
      assert(!r.picks.some((p) => p.candidate.digestMeta?.category === 'ART'), 'ARTは含まれない')
    },
  },
  {
    name: '自然な上位3件に必須カテゴリー（BEAUTY/SHOPPING/FOOD/CAFE/SWEETS）が無ければ、最良の該当候補を1件確保する',
    fn: () => {
      // 上位3件を占めるのは ART/MUSIC/PHOTO（id 21,22,23）。必須カテゴリーのSWEETS(id 24)は
      // idが一番大きい＝価値の代理指標では最下位だが、必須枠確保のため優先的に含まれるはず。
      const art = mkA(21, 'ART', 'ginza-tsutaya')
      const music = mkA(22, 'MUSIC', 'yamano-music-ginza')
      const photo = mkA(23, 'PHOTO', 'pola-annex-ginza')
      const sweets = mkA(24, 'SWEETS', 'ginza-kikunoya')
      const r = selectMorningThreeSlots([art, music, photo, sweets])
      assert(r.picks.length === 3, `3件選出（実際 ${r.picks.length}）`)
      assert(r.requiredCategorySatisfied === true, '必須カテゴリーを満たす')
      assert(r.picks.some((p) => p.candidate.discoveredContentId === 24), `SWEETS(24)が確保される（実際 ${r.picks.map((p) => p.candidate.discoveredContentId)}）`)
    },
  },
  {
    name: '必須カテゴリーに該当する安全な候補が1件も無ければ requiredCategorySatisfied:false のまま（無理に作らない）',
    fn: () => {
      const art = mkA(31, 'ART', 'ginza-tsutaya')
      const music = mkA(32, 'MUSIC', 'yamano-music-ginza')
      const r = selectMorningThreeSlots([art, music])
      assert(r.picks.length === 2, `2件のみ選出（実際 ${r.picks.length}）`)
      assert(r.requiredCategorySatisfied === false, '必須カテゴリー該当候補が無いのでfalse')
    },
  },
  {
    name: '未分類（category null）は選定対象外',
    fn: () => {
      const unclassified = mkA(41, null, 'some-facility')
      const art = mkA(42, 'ART', 'ginza-tsutaya')
      const r = selectMorningThreeSlots([unclassified, art])
      assert(!r.picks.some((p) => p.candidate.discoveredContentId === 41), '未分類は選ばれない')
      assert(r.picks.some((p) => p.candidate.discoveredContentId === 42), '分類済みは選ばれる')
    },
  },
  {
    // 実例＝DC#294「好評開催中！「北海道物産展」のおすすめ品」。現在性の根拠が
    // 「開催中」の明記語のみ（構造化期間もタイトル中の具体的な年月日も無い）ため、
    // A判定候補ではあるが選定対象から除外する（unsafeSkips）。
    name: 'DC#294回帰: 現在性の根拠が明記語のみ（構造化データ・具体的な開催日いずれも無し）の候補は選定対象外（unsafeSkips）',
    fn: () => {
      const unsafe = mkUnsafeA(294, 'ART', 'kabukiza')
      const safe = mkA(50, 'ART', 'ginza-tsutaya')
      const r = selectMorningThreeSlots([unsafe, safe])
      assert(!r.picks.some((p) => p.candidate.discoveredContentId === 294), 'DC#294は選定対象から除外される')
      assert(r.picks.some((p) => p.candidate.discoveredContentId === 50), '構造化データを持つ50は選定される')
      assert(r.unsafeSkips.some((s) => s.discoveredContentId === 294), 'DC#294はunsafeSkipsに理由付きで記録される（削除はしない）')
    },
  },
  {
    name: '施設14日間クールダウン中の候補は選定対象外（facilityCooldownSkips・削除はしない）',
    fn: () => {
      const onCooldown = mkA(61, 'ART', 'ginza-six', {}, 'PARENT_GINZA_SIX')
      const alt = mkA(62, 'ART', 'kabukiza')
      const history: FacilityActivityRecord[] = [
        { groupKey: 'PARENT_GINZA_SIX', facilityKey: 'ginza-six', facilityLabel: 'GINZA SIX', date: '2026-09-14T00:00:00.000Z', source: 'article', detail: 'Article #70 作成' },
      ]
      const r = selectMorningThreeSlots([onCooldown, alt], { facilityHistory: history, now: NOW })
      assert(!r.picks.some((p) => p.candidate.discoveredContentId === 61), 'DC#61はクールダウンで除外される')
      assert(r.picks.some((p) => p.candidate.discoveredContentId === 62), '代替の62は選定される')
      assert(r.facilityCooldownSkips.some((s) => s.discoveredContentId === 61), 'facilityCooldownSkipsに記録される')
    },
  },
  {
    name: '同一（親）施設は3件を通じて1件まで',
    fn: () => {
      const a1 = mkA(71, 'ART', 'ginza-six', {}, 'PARENT_GINZA_SIX')
      const a2 = mkA(72, 'MUSIC', 'ginza-tsutaya', {}, 'PARENT_GINZA_SIX')
      const a3 = mkA(73, 'PHOTO', 'kabukiza')
      const r = selectMorningThreeSlots([a1, a2, a3])
      assert(r.picks.length === 2, `同一親施設72は除外され2件のみ（実際 ${r.picks.length}）`)
      assert(r.picks.some((p) => p.candidate.discoveredContentId === 71), '71は選ばれる')
      assert(!r.picks.some((p) => p.candidate.discoveredContentId === 72), '同一親施設の72は選ばれない')
      assert(r.picks.some((p) => p.candidate.discoveredContentId === 73), '73は選ばれる')
    },
  },
  {
    name: '安全な候補が3件未満なら無理に埋めない',
    fn: () => {
      const only = mkA(81, 'SWEETS', 'ginza-motoji')
      const r = selectMorningThreeSlots([only])
      assert(r.picks.length === 1, `1件のみ（実際 ${r.picks.length}）`)
    },
  },
  {
    name: '安全な候補が0件なら空配列を返す（無理に選出しない）',
    fn: () => {
      const unsafe = mkUnsafeA(295, 'ART', 'kabukiza')
      const r = selectMorningThreeSlots([unsafe])
      assert(r.picks.length === 0, `0件（実際 ${r.picks.length}）`)
      assert(r.requiredCategorySatisfied === false, '必須カテゴリーも当然false')
    },
  },
  {
    name: 'B・C判定の候補は選定対象外（Aのみ対象・A/B/C判定ロジック自体は呼び出さない）',
    fn: () => {
      const bCandidate = mkA(91, 'ART', 'ginza-tsutaya')
      bCandidate.verdict = 'B' // 疑似的にB化（判定ロジックは変更しない・表示専用フィルターのテスト）
      const r = selectMorningThreeSlots([bCandidate])
      assert(r.picks.length === 0, 'B判定は選定対象に入らない')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('selectMorningThreeSlots', cases)
