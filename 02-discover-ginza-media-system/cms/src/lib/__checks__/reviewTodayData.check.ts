// GINZA WHISKERS / Project 02 — 本日記事レビュー画面のデータ整形（reviewTodayData）回帰テスト。
//
//  ・Instagram 短文の決定的生成（本文から。Fact にない語を足さない）
//  ・リード文の抽出（マストヘッド固定文・見出しを除いた最初の実段落）
//  ・転記ゲート：承認された記事だけ true

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import {
  deriveInstagramCopy,
  extractLead,
  canTransfer,
  REVIEW_DECISIONS,
  type ReviewDecisionFile,
} from '../pipeline/reviewTodayData'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const MASTHEAD =
  'GINZA TIME EDIT\nby GINZA WHISKERS\n\n400年の銀座を、今日の私へ。\n\n新しい店、季節の味、アート、舞台、街に残る小さな物語。\n\n次の銀ブラに、私だけの銀座時間を。'
const BODY_327 = `${MASTHEAD}

なぜ今、この一軒か

平日の午後に「少し自分を整えたい」人に向けた期間限定の一軒です。

見どころ

韓国で親しまれてきた素材や味わいが主役です。公式に挙がっているスイーツは、五味子ヴェリーヌ、薬菓風 最中など。

出典

確認日：2026年9月11日

挿絵注釈

※画像は記事内容をもとに生成したイメージです。実際の商品・展示作品・会場とは異なります。`

const cases: CheckCase[] = [
  {
    name: 'deriveInstagramCopy: 「見どころ」直後の実文＋会期＋タグ1〜2個。note URL 誘導なし・新情報を足さない',
    fn: () => {
      const ig = deriveInstagramCopy({
        title: '銀座で「自分を整える」午後に。',
        bodyText: BODY_327,
        hashtags: ['#旬の銀座', '#銀座アフタヌーンティー', '#韓国ウェルネス', '#自分を整える時間'],
        period: '2026年9月1日（火）〜10月31日（土）',
      })
      assert(ig.includes('韓国で親しまれてきた素材'), `見どころ由来の情景: ${ig}`)
      assert(ig.includes('2026年9月1日'), `会期を含む: ${ig}`)
      assert(/#旬の銀座 #銀座アフタヌーンティー/.test(ig), `タグ1〜2個: ${ig}`)
      assert(!/#韓国ウェルネス|#自分を整える時間/.test(ig), 'タグは2個まで')
      assert(!/https?:\/\/|note\.com|記事はこちら/.test(ig), 'note URL 誘導なし')
      assert(!/GINZA TIME EDIT|次の銀ブラ/.test(ig), 'マストヘッド文を含まない')
      // 同じ入力なら同じ出力（決定的）
      const ig2 = deriveInstagramCopy({
        title: '銀座で「自分を整える」午後に。',
        bodyText: BODY_327,
        hashtags: ['#旬の銀座', '#銀座アフタヌーンティー'],
        period: '2026年9月1日（火）〜10月31日（土）',
      })
      assert(ig === ig2, '決定的（再実行で一致）')
    },
  },
  {
    name: 'deriveInstagramCopy: 会期が「公式記載なし」なら会期文を付けない',
    fn: () => {
      const ig = deriveInstagramCopy({ title: 't', bodyText: BODY_327, hashtags: ['#旬の銀座'], period: '公式記載なし' })
      assert(!/公式記載なし/.test(ig), `会期未確定を出さない: ${ig}`)
      const ig2 = deriveInstagramCopy({ title: 't', bodyText: BODY_327, hashtags: ['#旬の銀座'], period: null })
      assert(ig2.includes('#旬の銀座'), 'period 無しでも生成できる')
    },
  },
  {
    name: 'extractLead: マストヘッド固定文と見出しを飛ばし、最初の実段落を返す',
    fn: () => {
      const lead = extractLead(BODY_327)
      assert(lead === '平日の午後に「少し自分を整えたい」人に向けた期間限定の一軒です。', `lead: ${lead}`)
      assert(extractLead(MASTHEAD) === '', 'マストヘッドだけなら空')
    },
  },
  {
    name: 'canTransfer: 承認のみ true。修正・保留・未決定・ファイル無しは false',
    fn: () => {
      assert(REVIEW_DECISIONS.join(',') === 'approve,revise,hold', '判定は3値')
      const mk = (dec: Record<string, string>): ReviewDecisionFile => ({
        date: '2026-09-11',
        confirmedAt: 'x',
        decisions: Object.fromEntries(Object.entries(dec).map(([k, v]) => [k, { decision: v as never }])),
      })
      assert(canTransfer(mk({ '61': 'approve' }), 61).ok, '承認→転記可')
      assert(!canTransfer(mk({ '61': 'revise' }), 61).ok, '修正→不可')
      assert(!canTransfer(mk({ '61': 'hold' }), 61).ok, '保留→不可')
      assert(!canTransfer(mk({ '61': 'approve' }), 62).ok, '別記事は未決定→不可')
      assert(!canTransfer(null, 61).ok, 'decision ファイル無し→不可')
      assert(/承認のみ/.test(canTransfer(mk({ '61': 'hold' }), 61).reason), '理由に「承認のみ」')
    },
  },
]

export const suite = () => runSuite('reviewTodayData', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
