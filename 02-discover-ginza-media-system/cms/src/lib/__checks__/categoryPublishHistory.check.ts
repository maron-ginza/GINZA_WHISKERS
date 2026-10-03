// GINZA WHISKERS / Project 02 — categoryPublishHistory（直近N日間のカテゴリー別
// 検証済み公開本数の集計）の回帰テスト。
//
// 実データで発見した2件の既存不整合（Article #2＝publishHistory無しのpublished、
// Article #62＝publishedAt<createdAtという物理的に不可能な記録）を再現したテストを含む。

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import {
  resolveVerifiedPublication,
  computeCategoryPublishCounts,
  type ArticleForCategoryHistory,
} from '../pipeline/categoryPublishHistory'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const cases: CheckCase[] = [
  {
    name: 'reviewStatus=published かつ note publishHistory あり（createdAt以降）のみ検証済みとする',
    fn: () => {
      const a: ArticleForCategoryHistory = {
        id: 1,
        reviewStatus: 'published',
        createdAt: '2026-10-01T00:00:00Z',
        primaryCategory8: 'SWEETS',
        publishHistory: [{ channel: 'note', publishedAt: '2026-10-02T00:00:00Z' }],
      }
      const v = resolveVerifiedPublication(a)
      assert(v !== null, 'should resolve')
      assert(v!.category === 'SWEETS', `category: ${v!.category}`)
      assert(v!.categoryBasis === 'primaryCategory8Field', `basis: ${v!.categoryBasis}`)
    },
  },
  {
    // 実データ：Article #2（seed）。reviewStatus=published だが publishHistory 0件。
    name: '実障害再発防止（Article #2型）：reviewStatus=published でも publishHistory が無ければ検証済みにしない',
    fn: () => {
      const a: ArticleForCategoryHistory = { id: 2, reviewStatus: 'published', createdAt: '2026-07-22T00:00:00Z', publishHistory: [] }
      assert(resolveVerifiedPublication(a) === null, '#2型：publishHistory無しは検証済みにならない')
    },
  },
  {
    // 実データ：Article #62。publishedAt(2026-09-01) < createdAt(2026-09-10) という
    // 物理的に不可能な記録。reviewStatusもdraftのまま（この場合は①の条件でも弾かれるが、
    // 仮にreviewStatusがpublishedだったとしても日付の矛盾で弾かれることを確認する）。
    name: '実障害再発防止（Article #62型）：publishedAt が createdAt より前の記録は検証済みにしない',
    fn: () => {
      const aDraft: ArticleForCategoryHistory = {
        id: 62,
        reviewStatus: 'draft',
        createdAt: '2026-09-10T23:45:24Z',
        publishHistory: [{ channel: 'note', publishedAt: '2026-09-01T07:59:00Z' }],
      }
      assert(resolveVerifiedPublication(aDraft) === null, '#62型：reviewStatus=draftのため検証済みにならない')

      const aPublishedButBadDate: ArticleForCategoryHistory = {
        id: 999,
        reviewStatus: 'published',
        createdAt: '2026-09-10T23:45:24Z',
        publishHistory: [{ channel: 'note', publishedAt: '2026-09-01T07:59:00Z' }],
      }
      assert(
        resolveVerifiedPublication(aPublishedButBadDate) === null,
        'publishedAt<createdAtの矛盾は、reviewStatus=publishedでも検証済みにしない',
      )
    },
  },
  {
    name: 'primaryCategory8未設定の既存記事は、タイトルに明記語があれば後方互換フォールバックで分類する',
    fn: () => {
      const a: ArticleForCategoryHistory = {
        id: 999,
        reviewStatus: 'published',
        createdAt: '2026-09-11T00:00:00Z',
        primaryCategory8: null,
        title: '山野楽器銀座本店、秋のクラシック音楽フェスティバル開催',
        publishHistory: [{ channel: 'note', publishedAt: '2026-09-11T02:07:00Z' }],
      }
      const v = resolveVerifiedPublication(a)
      assert(v !== null, 'should resolve')
      assert(v!.category === 'MUSIC_STAGE', `category: ${v!.category}`)
      assert(v!.categoryBasis === 'titleFallback', `basis: ${v!.categoryBasis}`)
    },
  },
  {
    // 実データで発見：Article #63「銀座で、音色を選ぶ。山野楽器「弦楽器フェア2026」は
    // 10月18日まで」は primaryCategory8 が未設定（NULL）で、かつタイトルに
    // deriveProvisionalCategory の明記語（フェスティバル／コンサート／音楽等）を
    // 含まない（「フェア」はMUSIC語彙に無い）。推測で「山野楽器＝音楽店だからMUSIC」
    // と補わない設計のため、この記事は現時点では unclassified として扱われる
    // （カテゴリー別集計からは除外されるが、全体の検証済み件数には含まれる）。
    name: '実データ（Article #63型）：店名から推測せず、明記語が無ければ unclassified のまま（過剰推測をしない）',
    fn: () => {
      const a: ArticleForCategoryHistory = {
        id: 63,
        reviewStatus: 'published',
        createdAt: '2026-09-11T00:00:00Z',
        primaryCategory8: null,
        title: '銀座で、音色を選ぶ。山野楽器「弦楽器フェア2026」は10月18日まで',
        publishHistory: [{ channel: 'note', publishedAt: '2026-09-11T02:07:00Z' }],
      }
      const v = resolveVerifiedPublication(a)
      assert(v !== null, 'publication自体は検証済み')
      assert(v!.category === null, `店名からの推測はしない設計のため category は null のはず: ${v!.category}`)
      assert(v!.categoryBasis === 'unclassified', `basis: ${v!.categoryBasis}`)
    },
  },
  {
    name: 'どちらの分類方法でも解決できない場合は未分類（unclassified）とし、特定カテゴリーへ加算しない',
    fn: () => {
      const a: ArticleForCategoryHistory = {
        id: 70,
        reviewStatus: 'published',
        createdAt: '2026-09-11T00:00:00Z',
        title: '銀座の話題', // カテゴリー明記語を含まない
        publishHistory: [{ channel: 'note', publishedAt: '2026-09-11T02:07:00Z' }],
      }
      const v = resolveVerifiedPublication(a)
      assert(v !== null, 'should resolve (publication itself is verified)')
      assert(v!.category === null, `category should be null: ${v!.category}`)
      assert(v!.categoryBasis === 'unclassified', `basis: ${v!.categoryBasis}`)
    },
  },
  {
    name: 'computeCategoryPublishCounts：window内のみ集計し、window外・未検証はカウントしない',
    fn: () => {
      const now = new Date('2026-10-03T00:00:00Z')
      const articles: ArticleForCategoryHistory[] = [
        { id: 1, reviewStatus: 'published', createdAt: '2026-10-01T00:00:00Z', primaryCategory8: 'SWEETS', publishHistory: [{ channel: 'note', publishedAt: '2026-10-02T00:00:00Z' }] }, // window内
        { id: 2, reviewStatus: 'published', createdAt: '2026-09-01T00:00:00Z', primaryCategory8: 'ART_CULTURE', publishHistory: [{ channel: 'note', publishedAt: '2026-09-05T00:00:00Z' }] }, // window外（8日前超）
        { id: 3, reviewStatus: 'published', createdAt: '2026-07-22T00:00:00Z', publishHistory: [] }, // #2型：未検証
        { id: 62, reviewStatus: 'draft', createdAt: '2026-09-10T23:45:24Z', publishHistory: [{ channel: 'note', publishedAt: '2026-09-01T07:59:00Z' }] }, // #62型：矛盾
      ]
      const r = computeCategoryPublishCounts(articles, { now, windowDays: 7 })
      assert(r.totalVerifiedInWindow === 1, `window内は1件のはず: ${r.totalVerifiedInWindow}`)
      assert(r.counts.SWEETS === 1, `SWEETS: ${r.counts.SWEETS}`)
      assert(r.counts.ART_CULTURE === 0, `ART_CULTURE（window外）は0のはず: ${r.counts.ART_CULTURE}`)
      assert(r.unverifiedPublishedCount === 1, `未検証published（#2型）は1件: ${r.unverifiedPublishedCount}`)
      // allVerifiedはwindow外（id=2, ART_CULTURE）も含む「検証済み公開」全件（#62型・#2型は含まない）
      assert(r.allVerified.length === 2, `allVerifiedはid=1,2の2件のはず（#62型・#2型は含まない）: ${r.allVerified.length}`)
    },
  },
]

export const suite = () => runSuite('categoryPublishHistory', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
