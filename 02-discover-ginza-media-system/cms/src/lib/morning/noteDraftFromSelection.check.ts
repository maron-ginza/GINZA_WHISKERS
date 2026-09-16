// GINZA WHISKERS / Project 02（2026-09-16続き6）— Stage 5 中核（純粋関数）の回帰テスト。
// AI / DB / 外部fetch はこのテストでも一切使わない（fixtureは全て固定オブジェクト）。
//
//   node --import=tsx/esm src/lib/morning/noteDraftFromSelection.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { prepareNoteDraftFromSelection } from './noteDraftFromSelection'
import type { SelectionPick } from './selectionRecord'
import type { ArticleFactsLike, DiscoveredContentLike } from '../template/mapDiscoveredContentToEventFields'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

// verifyStage2.check.ts の #386 相当フィクスチャ（実データ由来・DB読み取りなし）を
// SWEETS候補向けに流用する（既に templateEligible:true になることが確認済みの組み合わせ）。
const dcReady: DiscoveredContentLike = {
  id: 9001,
  title: '銀茶会イベント申し込み | 公式イベント情報 | 銀座のイベント情報 | GINZA OFFICIAL',
  excerpt: '（サイトナビ混在の長いexcerpt。mapperは本文から推測しない）',
  articleUrl: 'https://www.ginza.jp/event/35565',
  sourceSiteName: 'GINZA OFFICIAL',
  eventStartAt: null,
  eventEndAt: null,
  venue: null,
  contentType: 'event',
  uxType: 'participate_workshop',
  lastCheckedAt: '2026-09-01T21:33:15.201Z',
  detectedAt: '2026-09-01T21:33:15.201Z',
  dateExtraction: null,
}

const factsReady: ArticleFactsLike = {
  enrichmentStatus: 'ready',
  season: '秋',
  eventName: '銀茶会',
  editionLabel: '第24回',
  theme: '和（わ）',
  whatHappens: 'オリジナルのお菓子と一服のお茶を楽しむ催しです。',
  eventDate: '2026年10月25日（日）',
  eventDateISO: '2026-10-25T00:00:00.000Z',
  eventTime: '13時から16時まで',
  venues: [{ name: '濃茶体験会', place: '植松ビル地下1階の茶室「銀座慶庵」' }],
  areaLead: '全銀座エリアに対応した企画',
  audienceNote: '銀座で茶の湯に触れる時間を探している方に向いています。',
  paid: 'paid',
  applyRequired: 'yes',
  applyDeadline: '2026年10月7日（水）',
  resultDate: '2026年10月15日（木）',
  resultRule: '当選された方へのご連絡をもって発表に代えられます',
  applyRule: 'お申し込みは2名様分まで、お一人様1回限り',
  officialInfoNote: '当日のより詳しい内容は公式ウェブサイトで案内されます。',
  editorsNoteSeed: '銀座の秋は、街を歩くだけでなく、受け継がれてきた文化に触れることで少し違って見えてきます。',
  hashtags: [{ tag: '#銀茶会' }, { tag: '#銀座' }, { tag: '#お茶会' }],
  sourceProvenanceFacts: [
    { fact: '開催日は2026年10月25日（日）13時から16時まで', sourceType: 'official', factType: 'date', verificationStatus: 'confirmed' },
  ],
}

function mkPick(over: Partial<SelectionPick> = {}): SelectionPick {
  return {
    discoveredContentId: 9001,
    title: 'テスト候補',
    category: 'SWEETS',
    facilityLabel: '菓子店',
    sourceUrl: 'https://www.ginza.jp/event/35565',
    rank: 1,
    ...over,
  }
}

const cases: CheckCase[] = [
  {
    name: '必須情報が揃った候補（templateEligible:true）はstatus:preparedでnote本文が生成される',
    fn: () => {
      const r = prepareNoteDraftFromSelection({
        pick: mkPick(),
        currentArticleUrl: dcReady.articleUrl ?? null,
        dc: dcReady,
        facts: factsReady,
      })
      assert(r.status === 'prepared', `prepared（実際 ${r.status}／${r.status === 'stopped' ? r.reason : ''}）`)
      if (r.status === 'prepared') {
        assert(typeof r.draft.title === 'string' && r.draft.title.length > 0, 'タイトルが生成される')
        assert(typeof r.draft.noteBody === 'string' && r.draft.noteBody.length > 0, 'note本文が生成される')
        assert(r.draft.hashtags.length > 0, 'ハッシュタグが含まれる')
        assert(r.draft.category === 'SWEETS', '選定時のカテゴリーを保持')
      }
    },
  },
  {
    name: 'ArticleFactsがready化されていない（未確認）候補はstatus:stopped（推測しない）',
    fn: () => {
      const draftFacts: ArticleFactsLike = { ...factsReady, enrichmentStatus: 'draft' }
      const r = prepareNoteDraftFromSelection({
        pick: mkPick({ discoveredContentId: 9002 }),
        currentArticleUrl: dcReady.articleUrl ?? null,
        dc: { ...dcReady, id: 9002 },
        facts: draftFacts,
      })
      assert(r.status === 'stopped', `stopped（実際 ${r.status}）`)
    },
  },
  {
    name: 'ArticleFactsが存在しない候補もstatus:stopped（推測で補完しない）',
    fn: () => {
      const r = prepareNoteDraftFromSelection({
        pick: mkPick({ discoveredContentId: 9003 }),
        currentArticleUrl: dcReady.articleUrl ?? null,
        dc: { ...dcReady, id: 9003 },
        facts: undefined,
      })
      assert(r.status === 'stopped', `stopped（実際 ${r.status}）`)
    },
  },
  {
    name: '選定時のsourceUrlと現在のarticleUrlが食い違う場合はstatus:stopped（データ不整合。再調査しない）',
    fn: () => {
      const r = prepareNoteDraftFromSelection({
        pick: mkPick({ sourceUrl: 'https://www.ginza.jp/event/OLD-URL' }),
        currentArticleUrl: dcReady.articleUrl ?? null, // 現在は別URL
        dc: dcReady,
        facts: factsReady,
      })
      assert(r.status === 'stopped', `stopped（実際 ${r.status}）`)
      if (r.status === 'stopped') assert(r.reason.includes('データ不整合'), 'データ不整合の理由が明記される')
    },
  },
  {
    name: '任意項目（editorsNoteSeed等・テンプレ必須リストに無い項目）の欠落だけでは停止しない——必須が揃っていればprepared',
    fn: () => {
      // editorsNoteSeed / closing / callToAction は readyGate.ts の必須リストに無い任意項目。
      // これらを空にしても、他の必須項目が揃っていれば prepared になることを確認する。
      const factsNoOptional: ArticleFactsLike = { ...factsReady, editorsNoteSeed: null, closing: null, callToAction: null }
      const r = prepareNoteDraftFromSelection({
        pick: mkPick({ discoveredContentId: 9004 }),
        currentArticleUrl: dcReady.articleUrl ?? null,
        dc: { ...dcReady, id: 9004 },
        facts: factsNoOptional,
      })
      assert(r.status === 'prepared', `任意項目欠落だけならprepared（実際 ${r.status}／${r.status === 'stopped' ? r.reason : ''}）`)
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('noteDraftFromSelection', cases)
