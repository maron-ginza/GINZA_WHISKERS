// GINZA WHISKERS / Project 02（2026-09-12）— スウィーツ公式情報Discovery層の
// キーワード設定（sweetsDiscoveryKeywords.ts）の回帰テスト。

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import {
  getSeasonalKeywords,
  hasNoveltySignal,
  hasGinzaLocationHint,
  buildDiscoveryKeywordSet,
  GINZA_LOCATION_KEYWORDS,
  NOVELTY_SIGNAL_KEYWORDS_JA,
} from '../crawler/sweetsDiscoveryKeywords'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const cases: CheckCase[] = [
  {
    name: 'getSeasonalKeywords：月ごとに異なる季節語を返す（9月＝栗・かぼちゃ系、2月＝バレンタイン系）',
    fn: () => {
      const sep = getSeasonalKeywords(new Date('2026-09-15'))
      assert(sep.includes('栗'), `9月に「栗」が無い: ${sep.join(',')}`)
      assert(sep.includes('かぼちゃ'), `9月に「かぼちゃ」が無い: ${sep.join(',')}`)
      const feb = getSeasonalKeywords(new Date('2026-02-01'))
      assert(feb.includes('バレンタイン'), `2月に「バレンタイン」が無い: ${feb.join(',')}`)
      assert(!feb.includes('栗'), `2月に9月の語が混入: ${feb.join(',')}`)
    },
  },
  {
    name: 'getSeasonalKeywords：全12ヶ月が定義済み（空配列の月がない）',
    fn: () => {
      for (let m = 1; m <= 12; m++) {
        const words = getSeasonalKeywords(new Date(2026, m - 1, 15))
        assert(words.length > 0, `${m}月の季節語が空`)
      }
    },
  },
  {
    name: 'hasNoveltySignal：新商品・季節限定・期間限定等のシグナル語を検出する',
    fn: () => {
      assert(hasNoveltySignal('秋の新商品フェア開催'), '新商品')
      assert(hasNoveltySignal('季節限定パフェ登場'), '季節限定')
      assert(hasNoveltySignal('数量限定、予約受付中'), '数量限定/予約受付')
      assert(hasNoveltySignal('Limited seasonal collection launch'), '英語シグナル')
      assert(hasNoveltySignal('栗のモンブラン', new Date('2026-09-15')), '9月の季節語（栗）で検出')
    },
  },
  {
    name: 'hasNoveltySignal：通常商品の説明文（シグナル語なし）は検出しない',
    fn: () => {
      assert(hasNoveltySignal('クッキー・サブレ') === false, '通常商品名だけでは検出しない')
      assert(hasNoveltySignal('') === false, '空文字')
      assert(hasNoveltySignal(null) === false, 'null')
    },
  },
  {
    name: 'hasGinzaLocationHint：銀座関連の場所語を検出する',
    fn: () => {
      assert(hasGinzaLocationHint('銀座本店限定'), '銀座本店')
      assert(hasGinzaLocationHint('松屋銀座にて販売'), '松屋銀座')
      assert(hasGinzaLocationHint('全国で販売中') === false, '銀座の語が無ければfalse')
    },
  },
  {
    name: 'buildDiscoveryKeywordSet：銀座語・新規性語・季節語がすべて含まれる',
    fn: () => {
      const set = buildDiscoveryKeywordSet(new Date('2026-09-15'))
      for (const w of GINZA_LOCATION_KEYWORDS) assert(set.includes(w), `銀座語が欠落: ${w}`)
      for (const w of NOVELTY_SIGNAL_KEYWORDS_JA) assert(set.includes(w), `新規性語が欠落: ${w}`)
      assert(set.includes('栗'), '9月の季節語が欠落')
    },
  },
]

export const suite = () => runSuite('sweetsDiscoveryKeywords', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
