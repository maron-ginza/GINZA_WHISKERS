import assert from 'node:assert/strict'

import { evaluateProperNounGrounding, extractProperNounCandidates } from '../curation/properNounGroundingGate'
import { runSuite, type CheckCase } from './_harness'

const cases: CheckCase[] = [
  {
    name: '括弧で囲まれた固有名詞候補を抽出する（「」『』＜＞）',
    fn: () => {
      const c = extractProperNounCandidates(['ISHIYA Gが「アイガトー」を案内。写真集『HAMLET』の発売記念。＜西洋菓子 しろたえ＞が出店。'])
      const texts = c.map((x) => x.text)
      assert.ok(texts.includes('アイガトー'), JSON.stringify(texts))
      assert.ok(texts.includes('HAMLET'), JSON.stringify(texts))
      assert.ok(texts.includes('西洋菓子 しろたえ'), JSON.stringify(texts))
    },
  },
  {
    name: '英字ブランド名らしき大文字始まりの連続を抽出する',
    fn: () => {
      const c = extractProperNounCandidates(['CAFE PAULISTAの新作。GODIVAとのコラボ商品。'])
      const texts = c.map((x) => x.text)
      assert.ok(texts.includes('CAFE PAULISTA'), JSON.stringify(texts))
      assert.ok(texts.includes('GODIVA'), JSON.stringify(texts))
    },
  },
  {
    name: '一般的な定型句（税込・期間限定等）は固有名詞候補から除外する',
    fn: () => {
      const c = extractProperNounCandidates(['本商品は「期間限定」「税込」で販売されます。'])
      assert.equal(c.length, 0, JSON.stringify(c))
    },
  },
  {
    // マロン指示の「失敗テスト」：バッキングテキストに存在しない固有名詞が
    // 生成本文に含まれる場合、下書き生成をblockすることを確認する。
    name: '【失敗テスト】バッキングテキストに存在しない固有名詞があれば blocked:true（下書き生成を止める）',
    fn: () => {
      const backing = [
        'ISHIYA Gが焼き菓子「アイガトー」を案内。GINZA SIX B2Fにて。',
        'プレーン・ショコラは1個237円、5個入1,188円（税込）。',
      ]
      // 本文に、出典に一切登場しない架空の店舗名「銀座スイーツ工房」を捏造したケース。
      const body = ['ISHIYA Gの「アイガトー」が人気だが、隣接する「銀座スイーツ工房」でも類似商品が販売中だ。']
      const r = evaluateProperNounGrounding(body, backing)
      assert.equal(r.blocked, true, JSON.stringify(r))
      assert.ok(r.ungroundedCandidates.some((c) => c.text === '銀座スイーツ工房'), JSON.stringify(r.ungroundedCandidates))
    },
  },
  {
    name: 'バッキングテキストに全ての固有名詞候補が実在すれば blocked:false',
    fn: () => {
      const backing = [
        'ISHIYA Gが焼き菓子「アイガトー」を案内。GINZA SIX B2Fにて。',
        '銀座 清月堂本店の抹茶クラッシュゼリーラテ、990円。',
      ]
      const body = ['ISHIYA Gの「アイガトー」に加え、銀座 清月堂本店の抹茶クラッシュゼリーラテも今週の注目だ。']
      const r = evaluateProperNounGrounding(body, backing)
      assert.equal(r.blocked, false, JSON.stringify(r))
      assert.equal(r.ungroundedCandidates.length, 0, JSON.stringify(r.ungroundedCandidates))
    },
  },
  {
    name: '固有名詞候補が本文に無い場合は checkedCandidates が空でblocked:false（対象外）',
    fn: () => {
      const r = evaluateProperNounGrounding(['本日は晴天なり。'], ['何らかの出典テキスト'])
      assert.equal(r.blocked, false)
      assert.equal(r.checkedCandidates.length, 0)
    },
  },
  {
    name: '複数の根拠のない固有名詞をすべて検出する',
    fn: () => {
      const backing = ['実在するのは「本物商品A」だけ。']
      const body = ['「架空商品B」と「架空商品C」、それに「本物商品A」を紹介する。']
      const r = evaluateProperNounGrounding(body, backing)
      assert.equal(r.blocked, true)
      const names = r.ungroundedCandidates.map((c) => c.text)
      assert.ok(names.includes('架空商品B') && names.includes('架空商品C'), JSON.stringify(names))
      assert.ok(!names.includes('本物商品A'), JSON.stringify(names))
    },
  },
]

export const suite = () => runSuite('properNounGroundingGate', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} properNounGroundingGate (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
