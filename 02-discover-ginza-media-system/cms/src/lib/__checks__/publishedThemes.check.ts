// GINZA WHISKERS / Project 02 — 既公開テーマの重複判定（publishedThemes）回帰テスト。
//
// 「同一URLだけでなく、イベント名・店舗名・期間・テーマの意味的重複」を判定できること、
// 過去7日ではなく全公開履歴を対象にすること、本日の #61/#62 実ケースを検証する。

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import {
  matchPublishedTheme,
  filterUnpublishedThemes,
  periodsOverlap,
  textSimilarity,
  normalizeThemeText,
  normalizeVenue,
  type PublishedTheme,
} from '../publish/publishedThemes'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

// 実データに即した既公開テーマ台帳（全公開履歴の縮図）
const PUBLISHED: PublishedTheme[] = [
  { noteUrl: 'https://note.com/ginza_whiskers/n/n525aa8ac0414', title: 'インドから世界へ。9月最後の週末、銀座で出会う『更紗展』', eventName: '更紗展 ～インドから世界へ世界を魅了した染めの美～', venue: '銀座もとじ 和染', period: '2026年9月25日〜27日', dcId: 549, source: 'db#58', publishedAt: '2026-09-10' },
  { noteUrl: 'https://note.com/ginza_whiskers/n/n694a116715bc', title: '九谷焼の絵付けを、目の前で。銀座の金沢で6日間だけの個展', eventName: '上端伸也 個展', venue: 'KOGEI Art Gallery 銀座の金沢', period: '2026年9月9日〜9月14日', dcId: 373, source: 'devlog:2026-09-01/dc-373', publishedAt: '2026-09-01T16:59:00+09:00' },
  { noteUrl: 'https://note.com/ginza_whiskers/n/nda78e93e375f', title: 'おばけたちのパーティを、銀座で。UNO YOSHIHIKO 個展「The Ghosts\' Party」', eventName: "UNO YOSHIHIKO個展「The Ghosts' Party」", venue: '銀座 蔦屋書店', period: '2026年8月28日〜9月15日', dcId: 368, source: 'devlog:2026-09-01/dc-368', publishedAt: '2026-09-01T17:51:00+09:00' },
  { noteUrl: null, title: '韓国ウェルネス アフタヌーンティー（NAMIKI667）', eventName: '韓国ウェルネス アフタヌーンティー', venue: 'NAMIKI667／ハイアット セントリック 銀座 東京', period: '2026年9月1日〜10月31日', dcId: 327, source: 'manual:seed', publishedAt: null },
]

const cases: CheckCase[] = [
  {
    name: '正規化：見出し・かっこ・記号・空白を落とす／会場のブレを吸収',
    fn: () => {
      // かっこ・全角空白・句読点を落とす
      assert(normalizeThemeText('【展示】九谷焼　個展') === '展示九谷焼個展', `norm1: ${normalizeThemeText('【展示】九谷焼　個展')}`)
      assert(normalizeThemeText('A, B. C！') === 'abc', `norm2: ${normalizeThemeText('A, B. C！')}`)
      // 「〜展。」と「〜展」を同一視
      assert(normalizeThemeText('更紗展。') === normalizeThemeText('更紗展'), '展。と展')
      assert(normalizeVenue('KOGEI Art Gallery 銀座の金沢').includes('kogei'), 'KOGEI→kogei')
      assert(normalizeVenue('ハイアット セントリック 銀座 東京') === normalizeVenue('ハイアット セントリック 銀座'), '東京の有無を吸収')
    },
  },
  {
    name: 'textSimilarity：完全一致=1、無関係≈0、言い換えは中間',
    fn: () => {
      assert(textSimilarity('更紗展', '更紗展') === 1, '完全一致')
      assert(textSimilarity('更紗展', 'ネイルエス ホロスコープ') < 0.15, '無関係')
      assert(textSimilarity('韓国ウェルネス アフタヌーンティー', '韓国ウェルネスのアフタヌーンティー') > 0.7, '言い換え')
    },
  },
  {
    name: 'periodsOverlap：重なる/重ならない/日付が拾えない',
    fn: () => {
      assert(periodsOverlap('2026年9月9日〜9月14日', '2026年9月12日〜13日'), '内包は重なる')
      assert(periodsOverlap('2026-09-01 〜 2026-09-15', '2026年9月10日'), '単日が範囲内')
      assert(!periodsOverlap('2026年9月1日〜9月5日', '2026年10月1日〜10月10日'), '離れていれば重ならない')
      assert(!periodsOverlap('通年', '2026年9月10日'), '日付が拾えなければ false')
    },
  },
  {
    name: '重複①：同一 DiscoveredContent id',
    fn: () => {
      const m = matchPublishedTheme({ dcId: 373, title: '別タイトルでも', eventName: 'ちがう名前' }, PUBLISHED)
      assert(m.match && /同一 DiscoveredContent #373/.test(m.reason), m.reason)
      assert(m.matchedUrl === 'https://note.com/ginza_whiskers/n/n694a116715bc', m.matchedUrl ?? 'null')
    },
  },
  {
    name: '重複②：同一 note URL',
    fn: () => {
      const m = matchPublishedTheme({ dcId: 999, title: 'x', noteUrl: 'https://note.com/ginza_whiskers/n/nda78e93e375f' }, PUBLISHED)
      assert(m.match && /同一 note URL/.test(m.reason), m.reason)
    },
  },
  {
    name: '重複③：イベント名の意味的一致（URL も DC も一致しない）',
    fn: () => {
      const m = matchPublishedTheme(
        { dcId: null, title: '銀座で「自分を整える」午後に', eventName: '韓国ウェルネスのアフタヌーンティー', venue: null, period: null },
        PUBLISHED,
      )
      assert(m.match && /イベント名が意味的に一致/.test(m.reason), m.reason)
      assert(m.matchedTitle?.includes('韓国ウェルネス'), m.matchedTitle ?? 'null')
    },
  },
  {
    name: '重複④：同一会場＋開催期間が重なる',
    fn: () => {
      const m = matchPublishedTheme(
        { dcId: null, title: '陶芸の週末', eventName: '上端伸也 展', venue: 'KOGEI Art Gallery 銀座の金沢', period: '2026年9月12日〜13日' },
        PUBLISHED,
      )
      assert(m.match, m.reason)
      assert(/同一会場|イベント名/.test(m.reason), m.reason)
    },
  },
  {
    name: '重複⑤：同一会場＋テーマが近い（期間の記述が弱くても）',
    fn: () => {
      const m = matchPublishedTheme(
        { dcId: null, title: '九谷焼の個展、銀座の金沢で', eventName: '九谷焼 個展', venue: '銀座の金沢', period: null },
        PUBLISHED,
      )
      assert(m.match, m.reason)
    },
  },
  {
    name: '重複⑥：別サイトの同一イベント告知（会場サフィックス違い・タイトル長短違い）',
    fn: () => {
      // 既公開: 蔦屋書店の「UNO YOSHIHIKO個展「The Ghosts\' Party」」（長いタイトル）
      // 候補:   GINZA SIX 掲載の「UNO YOSHIHIKO個展「The Ghosts\' Party」 – GINZA SIX」
      const m = matchPublishedTheme(
        { dcId: 596, title: 'UNO YOSHIHIKO個展「The Ghosts\' Party」 – GINZA SIX', eventName: 'UNO YOSHIHIKO個展「The Ghosts\' Party」 – GINZA SIX', venue: 'GINZA SIX', period: '2026-08-28〜2026-09-15' },
        PUBLISHED,
      )
      assert(m.match, `別サイトの同一告知が取りこぼされた: ${m.reason}`)
      assert(m.matchedUrl === 'https://note.com/ginza_whiskers/n/nda78e93e375f', m.matchedUrl ?? 'null')
    },
  },
  {
    name: '非重複：会場が同じでも期間が離れ・テーマも別（別の展示）',
    fn: () => {
      const m = matchPublishedTheme(
        { dcId: 700, title: '来春の書道展、銀座の金沢で', eventName: '田中太郎 書展', venue: 'KOGEI Art Gallery 銀座の金沢', period: '2027年3月1日〜3月10日' },
        PUBLISHED,
      )
      assert(!m.match, `別展示なのに重複扱い: ${m.reason}`)
    },
  },
  {
    name: '非重複：まったく別テーマ（新規ビューティー候補）',
    fn: () => {
      const m = matchPublishedTheme(
        { dcId: 605, title: 'JIL SANDERフレグランスコレクションから新たに6つの香り', eventName: 'JIL SANDER フレグランス新6種', venue: 'GINZA SIX', period: null },
        PUBLISHED,
      )
      assert(!m.match, `別テーマなのに重複扱い: ${m.reason}`)
    },
  },
  {
    name: '本日の実ケース：#61（DC#327 韓国ウェルネス）と #62（DC#373 上端伸也）は既公開重複、#62 の URL も取れる',
    fn: () => {
      const a61 = matchPublishedTheme(
        { dcId: 327, title: '銀座で「自分を整える」午後に。NAMIKI667の韓国ウェルネス アフタヌーンティー（10月末まで）', eventName: '韓国ウェルネス アフタヌーンティー', venue: 'NAMIKI667／ハイアット セントリック 銀座 東京 3階', period: '2026年9月1日（火）〜10月31日（土）' },
        PUBLISHED,
      )
      assert(a61.match, `#61 が重複判定されない: ${a61.reason}`)

      const a62 = matchPublishedTheme(
        { dcId: 373, title: '九谷焼を、上絵付けの実演とともに。銀座の金沢で「上端伸也 個展」（9月14日まで）', eventName: '上端伸也 個展', venue: 'KOGEI Art Gallery 銀座の金沢', period: '2026年9月9日（水）〜9月14日（月）' },
        PUBLISHED,
      )
      assert(a62.match, `#62 が重複判定されない: ${a62.reason}`)
      assert(a62.matchedUrl === 'https://note.com/ginza_whiskers/n/n694a116715bc', `#62 の既公開URL: ${a62.matchedUrl}`)
    },
  },
  {
    name: '全公開履歴が対象：数か月前の公開でも除外される（過去7日ではない）',
    fn: () => {
      const old: PublishedTheme[] = [
        { noteUrl: 'https://note.com/ginza_whiskers/n/nOLD0000000', title: '春の銀座で出会う山下麻登香 展', eventName: '山下麻登香 展', venue: '月光荘画材店', period: '2026年3月1日〜3月10日', dcId: 111, source: 'db#12', publishedAt: '2026-03-02T10:00:00+09:00' },
      ]
      const m = matchPublishedTheme(
        { dcId: null, title: '銀座・月光荘で「山下麻登香 展」', eventName: '山下麻登香 展', venue: '月光荘画材店', period: '2026年3月1日〜3月10日' },
        old,
      )
      assert(m.match, `古い公開でも除外されるべき: ${m.reason}`)
    },
  },
  {
    name: 'filterUnpublishedThemes：kept と excluded に分かれ、理由が付く',
    fn: () => {
      const cands = [
        { dcId: 327, title: '韓国ウェルネス アフタヌーンティー', eventName: '韓国ウェルネス アフタヌーンティー' },
        { dcId: 605, title: 'JIL SANDER フレグランス新6種', eventName: 'JIL SANDER フレグランス' },
        { dcId: 373, title: '上端伸也 個展', eventName: '上端伸也 個展' },
      ]
      const { kept, excluded } = filterUnpublishedThemes(cands, PUBLISHED)
      assert(kept.length === 1 && kept[0].dcId === 605, `kept: ${kept.map((k) => k.dcId)}`)
      assert(excluded.length === 2, `excluded: ${excluded.length}`)
      assert(excluded.every((e) => e.reason.length > 0), '除外理由が付く')
    },
  },
]

export const suite = () => runSuite('publishedThemes', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
