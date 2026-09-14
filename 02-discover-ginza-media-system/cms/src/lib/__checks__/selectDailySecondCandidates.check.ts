// GINZA WHISKERS / Project 02 — selectDailySecondCandidates の回帰テスト
// （2026-09-14、マロン指示：候補抽出条件の修正）
//
//   ・本日既公開カテゴリーを除外する
//   ・終了済み（構造化日付／タイトル明記語）を除外する
//   ・重複（duplicate/alreadyPublished/alreadyDrafted）を除外する
//   ・価格・終了日・予約条件・在庫・営業時間の欠落では除外しない
//   ・公式URL・場所・内容・出典確認日のいずれか欠落では除外する
//   ・施設単位では除外しない（同一施設でも商品名が違えば両方候補になり得る）
//   ・基準を満たす候補が limit 未満なら水増ししない

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { selectDailySecondCandidates, type SecondCandidateInput } from '../pipeline/selectDailySecondCandidates'

const ROOT = resolve(process.cwd(), '..')

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const NOW = new Date('2026-09-14T06:10:00+09:00')

function base(overrides: Partial<SecondCandidateInput>): SecondCandidateInput {
  return {
    dcId: 1,
    title: 'テスト候補',
    sourceName: 'テスト出典',
    sourceUrl: 'https://example.com/test',
    venue: '銀座テスト会場',
    facilityKey: 'test-facility',
    facilityLabel: 'テスト施設',
    category: 'ART',
    whatHappens: 'テスト内容の説明文（8文字以上）',
    verifiedAt: '2026-09-13T21:00:00.000Z',
    ...overrides,
  }
}

const cases: CheckCase[] = [
  {
    name: '【本日公開済みカテゴリーを除外】excludeCategoriesに含まれるカテゴリーは候補に出ない',
    fn: () => {
      const r = selectDailySecondCandidates(
        [base({ dcId: 1, category: 'SWEETS' }), base({ dcId: 2, category: 'ART' })],
        { excludeCategories: ['SWEETS', 'FOOD'], now: NOW },
      )
      assert(r.picked.every((p) => p.dcId !== 1), 'SWEETSカテゴリーが除外されていない')
      assert(r.picked.some((p) => p.dcId === 2), 'ARTカテゴリーの候補が出ていない')
      assert(r.excludedReasons['本日既に公開/確定済みのカテゴリー'] === 1, JSON.stringify(r.excludedReasons))
    },
  },
  {
    name: '【必須条件：価格・終了日・予約条件・在庫・営業時間は欠けても除外しない】',
    fn: () => {
      const r = selectDailySecondCandidates(
        [base({ dcId: 1, priceText: undefined, eventEndAt: undefined })],
        { now: NOW },
      )
      assert(r.picked.length === 1, `価格・終了日欠落だけで除外されている: ${JSON.stringify(r.excludedReasons)}`)
      assert(r.picked[0].priceText === '公式記載なし', 'priceTextが公式記載なしになっていない')
    },
  },
  {
    name: '【必須条件：公式URLが無いと除外】',
    fn: () => {
      const r = selectDailySecondCandidates([base({ dcId: 1, sourceUrl: '' })], { now: NOW })
      assert(r.picked.length === 0, 'sourceUrl欠落なのに候補に残っている')
    },
  },
  {
    name: '【必須条件：終了済み（構造化日付）は除外】',
    fn: () => {
      const r = selectDailySecondCandidates(
        [base({ dcId: 1, eventEndAt: '2026-09-10T00:00:00.000Z' })],
        { now: NOW },
      )
      assert(r.picked.length === 0, '終了済み（構造化日付）が除外されていない')
      assert(r.excludedReasons['開催・販売終了済み（構造化日付）'] === 1, JSON.stringify(r.excludedReasons))
    },
  },
  {
    name: '【必須条件：終了済み（タイトル明記語、構造化日付なし）は除外】マロン指示の実例（DC #433相当）',
    fn: () => {
      const r = selectDailySecondCandidates(
        [base({ dcId: 1, title: '【受付終了】紙とひかりで作るのぞける立体絵ワークショップ', eventEndAt: undefined })],
        { now: NOW },
      )
      assert(r.picked.length === 0, '【受付終了】タイトルが除外されていない')
      assert(r.excludedReasons['タイトルに終了の明記語あり'] === 1, JSON.stringify(r.excludedReasons))
    },
  },
  {
    name: '【重複判定：施設単位では除外しない】同一施設でも商品名が異なれば両方候補になり得る',
    fn: () => {
      const r = selectDailySecondCandidates(
        [
          base({ dcId: 1, facilityKey: 'cafe-paulista-ginza', title: '商品A' }),
          base({ dcId: 2, facilityKey: 'cafe-paulista-ginza', title: '商品B' }),
        ],
        { now: NOW },
      )
      assert(r.picked.length === 2, `同一施設という理由だけで除外されている: ${r.picked.length}件`)
    },
  },
  {
    name: '【重複判定：duplicateフラグが立っている候補は除外】',
    fn: () => {
      const r = selectDailySecondCandidates([base({ dcId: 1, duplicate: true })], { now: NOW })
      assert(r.picked.length === 0, 'duplicate:trueの候補が除外されていない')
    },
  },
  {
    name: '【水増ししない】基準を満たす候補がlimit未満ならその実数のみ返す',
    fn: () => {
      const r = selectDailySecondCandidates([base({ dcId: 1 })], { now: NOW, limit: 3 })
      assert(r.picked.length === 1, `1件しか有効候補が無いのに水増しされている: ${r.picked.length}件`)
    },
  },
  {
    name: '【7日間カテゴリー不足ボーナス】categoryCounts7dで0件のカテゴリーは、多く出ているカテゴリーより上位に来る',
    fn: () => {
      const r = selectDailySecondCandidates(
        [
          base({ dcId: 1, category: 'ART' }),
          base({ dcId: 2, category: 'WELLNESS' }),
        ],
        { now: NOW, categoryCounts7d: { ART: 5, WELLNESS: 0 } },
      )
      assert(r.picked[0]?.dcId === 2, `7日間0件のWELLNESSが優先されていない: ${JSON.stringify(r.picked.map((p) => p.dcId))}`)
    },
  },
  {
    name: '【施設集中ペナルティ】facilityCounts7dで採用実績のある施設は減点される',
    fn: () => {
      const r = selectDailySecondCandidates(
        [
          base({ dcId: 1, facilityKey: 'ginza-six', category: 'ART' }),
          base({ dcId: 2, facilityKey: 'unknown-shop', category: 'ART' }),
        ],
        { now: NOW, facilityCounts7d: { 'ginza-six': 4 } },
      )
      assert(r.picked[0]?.dcId === 2, `施設集中ペナルティが働いていない: ${JSON.stringify(r.picked.map((p) => p.dcId))}`)
    },
  },
  {
    name: '【importの副作用防止】dailySecondCandidates.tsがexport経由で再利用するmorningRun.tsは、importされただけでmain()を実行しない（実機発見・2026-09-14修正）',
    fn: () => {
      // 実機で「loadArticleRecords/buildNoteRecordsをdailySecondCandidates.tsから
      // importしただけで、morningRun.tsのmain()が無条件に走り
      // .devlogs/morning/<date>/report.txtを現在のDB状態で上書きしてしまう」事故が
      // 発生した。他の全スクリプトと同じ「直接実行されたときだけmain()を呼ぶ」
      // ガードが入っていることを確認する（CLIとしての直接実行時の挙動は無変更）。
      const src = readFileSync(resolve(ROOT, 'cms/src/scripts/morningRun.ts'), 'utf8')
      const tail = src.slice(-400)
      assert(
        /if\s*\(\s*import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`\s*\)\s*main\(\)/.test(tail),
        'morningRun.tsの末尾にimport.meta.urlガードが無い（importされただけでmain()が走る状態に戻っている）',
      )
      assert(!/^main\(\)\s*$/m.test(src.replace(tail, '')), 'ガードより前に無条件のmain()呼び出しが残っている')
    },
  },
  {
    name: '【AI/ネットワーク非依存】selectDailySecondCandidates.tsはfetch/anthropic/claude/payloadを参照しない',
    fn: () => {
      const src = readFileSync(resolve(ROOT, 'cms/src/lib/pipeline/selectDailySecondCandidates.ts'), 'utf8')
      assert(!/\bfetch\s*\(/.test(src), 'fetch呼び出しが含まれている')
      assert(!/from\s+['"]@anthropic-ai/.test(src), '@anthropic-aiのimportが含まれている')
      assert(!/payload\./.test(src), 'Payload（DB）呼び出しが含まれている')
    },
  },
]

export const suite = () => runSuite('selectDailySecondCandidates', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
