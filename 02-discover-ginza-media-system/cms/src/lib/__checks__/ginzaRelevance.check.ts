// 銀座関連性判定（assessGinzaRelevance）の回帰テスト。
// 「銀座本店のサイトに載る他店舗情報」を除外できること・推測で通さないこと。
import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { assessGinzaRelevance, isSingleGinzaVenueSource } from '../morning/ginzaRelevance'
import { SOURCE_LEDGER_SEED_DATA } from '../sourceLedger/seedData'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const cases: CheckCase[] = [
  {
    name: '山野楽器 銀座本店サイトの「たまプラーザ テラス店」記事 → 銀座外（除外）',
    fn: () => {
      const r = assessGinzaRelevance({
        title: 'たまプラーザ テラス店 リニューアルオープン記念フェア開催！ | 山野楽器',
        sourceName: '山野楽器 銀座本店',
        articleUrl: 'https://www.yamano-music.co.jp/information/60638',
        sourceIsSingleGinzaVenue: isSingleGinzaVenueSource('山野楽器 銀座本店', 'https://www.yamano-music.co.jp/'),
      })
      assert(r.ginzaRelevant === false, `除外されること（実際: ${r.ginzaRelevant} / ${r.basis}）`)
      assert(/たまプラーザ/.test(r.offGinzaMatch ?? ''), `根拠語に「たまプラーザ」（実際: ${r.offGinzaMatch}）`)
    },
  },
  {
    name: '銀座夏野サイトの「〈銀座夏野 スカイツリー店〉POPUP」記事 → 銀座外（ブランド名の銀座より支店を優先）',
    fn: () => {
      const r = assessGinzaRelevance({
        title: '照明陶芸作家・大野哲さん箸置 POPUP開催のお知らせ〈銀座夏野 スカイツリー店〉',
        sourceName: '銀座夏野',
        articleUrl: 'https://www.e-ohashi.com/blog/news/5086',
        sourceIsSingleGinzaVenue: isSingleGinzaVenueSource('銀座夏野', 'https://www.e-ohashi.com/'),
      })
      assert(r.ginzaRelevant === false, `除外されること（実際: ${r.ginzaRelevant} / ${r.basis}）`)
      assert(/スカイツリー/.test(r.offGinzaMatch ?? ''), `根拠語に「スカイツリー店」（実際: ${r.offGinzaMatch}）`)
    },
  },
  {
    name: '山野楽器「弦楽器フェア 2026【銀座本店 3F 弦楽器サロン】」→ 銀座（タイトルに銀座本店の明記）',
    fn: () => {
      const r = assessGinzaRelevance({
        title: '弦楽器フェア 2026 【銀座本店 3F 弦楽器サロン】 | 山野楽器',
        sourceName: '山野楽器 銀座本店',
        sourceIsSingleGinzaVenue: false,
      })
      assert(r.ginzaRelevant === true, `銀座（実際: ${r.ginzaRelevant} / ${r.basis}）`)
    },
  },
  {
    name: '山野楽器の場所無記載の記事 → 根拠不足で除外（推測で通さない）',
    fn: () => {
      const r = assessGinzaRelevance({
        title: '秋の音楽教室 入会キャンペーン | 山野楽器',
        sourceName: '山野楽器 銀座本店',
        sourceIsSingleGinzaVenue: false,
      })
      assert(r.ginzaRelevant === false, `根拠不足で除外（実際: ${r.ginzaRelevant} / ${r.basis}）`)
      assert(/根拠不足|銀座の根拠がない/.test(r.basis), r.basis)
    },
  },
  {
    name: '銀座 蔦屋書店の記事（単独施設）は場所明記なしでも銀座',
    fn: () => {
      const r = assessGinzaRelevance({
        title: '【展示】HAYATO MACHIDA「lonely never more」',
        sourceName: '銀座 蔦屋書店',
        articleUrl: 'https://store.tsite.jp/ginza/event/art/56437-1351120826.html',
        sourceIsSingleGinzaVenue: isSingleGinzaVenueSource('銀座 蔦屋書店', 'https://store.tsite.jp/ginza/'),
      })
      assert(r.ginzaRelevant === true, `銀座（実際: ${r.ginzaRelevant} / ${r.basis}）`)
    },
  },
  {
    name: 'GINZA SIX / GINZA OFFICIAL 等はタイトルの銀座明記で通る',
    fn: () => {
      const a = assessGinzaRelevance({ title: 'follow×JAPAN DENIM「WORK STRAIGHT JEANS」 – GINZA SIX | 銀座シックス', sourceName: 'GINZA SIX' })
      assert(a.ginzaRelevant === true, `GINZA SIX（${a.basis}）`)
      const b = assessGinzaRelevance({ title: 'アニメ天官賜福展 -天地流光- | 銀座のイベント情報 | GINZA OFFICIAL – 銀座公式ウェブサイト', sourceName: 'GINZA OFFICIAL', articleUrl: 'https://www.ginza.jp/shopnews/shopnews-matsuya-ginza/35702' })
      assert(b.ginzaRelevant === true, `GINZA OFFICIAL（${b.basis}）`)
    },
  },
  {
    name: '中央区の「銀座シャンソン」は銀座、日本橋座の公演は銀座外',
    fn: () => {
      const a = assessGinzaRelevance({ title: '第16回 中央区・銀座シャンソン＆ミュージックフェスティバル', sourceName: '中央区観光関連' })
      assert(a.ginzaRelevant === true, `銀座シャンソン（${a.basis}）`)
      const b = assessGinzaRelevance({ title: '芝居小屋「日本橋座」 公演「廓三番叟」', sourceName: '中央区観光関連' })
      assert(b.ginzaRelevant === false, `日本橋座は銀座外（実際: ${b.ginzaRelevant} / ${b.basis}）`)
    },
  },
  {
    name: 'しながわクルーズ（天王洲）→ 銀座外',
    fn: () => {
      const r = assessGinzaRelevance({ title: 'しながわクルーズ「天王洲周遊アートクルーズ」', sourceName: 'GO TOKYO', articleUrl: 'https://www.gotokyo.org/jp/event/tokyotouristinfo/20260912.html' })
      assert(r.ginzaRelevant === false, `銀座外（実際: ${r.ginzaRelevant} / ${r.basis}）`)
    },
  },
  {
    name: 'isSingleGinzaVenueSource：単独施設は true、チェーン本店・箸ECは false',
    fn: () => {
      assert(isSingleGinzaVenueSource('GINZA SIX') === true, 'GINZA SIX')
      assert(isSingleGinzaVenueSource('銀座 蔦屋書店') === true, '蔦屋')
      assert(isSingleGinzaVenueSource('相田みつを美術館') === true, '相田みつを')
      assert(isSingleGinzaVenueSource('山野楽器 銀座本店') === false, '山野楽器はチェーン本店＝false')
      assert(isSingleGinzaVenueSource('銀座夏野') === false, '銀座夏野は多店舗＝false')
      assert(isSingleGinzaVenueSource('GINZA OFFICIAL') === false, '集約サイト＝false')
    },
  },
  {
    // 2026-09-12：GODIVA/DALLOYAU/ピエール・エルメ・パリ/フレデリック・カッセル/ルノートル/
    // 銀座若菜のnameに説明目的で「（松屋銀座）」「（銀座三越）」を含めていたため、
    // isSingleGinzaVenueSourceがsourceName文字列への部分一致で誤って単独施設と
    // 判定していた実バグの再発防止。全国複数店舗ブランドの`name`にはSINGLE_GINZA_VENUE_RE
    // に載る語（銀座三越・松屋銀座 等）を含めてはならない。
    name: '複数店舗ブランドのnameに他の単独施設名（松屋銀座／銀座三越）を含めても単独施設と誤判定しない',
    fn: () => {
      const multiLocationBrandsWithDeptStoreParenthetical = [
        'ピエール・エルメ・パリ（PIERRE HERMÉ PARIS）',
        'DALLOYAU（ダロワイヨ）',
        'GODIVA（ゴディバ）',
        'フレデリック・カッセル（Frédéric Cassel）',
        'ルノートル（LENÔTRE）',
        '銀座若菜（株式会社若菜）',
      ]
      for (const name of multiLocationBrandsWithDeptStoreParenthetical) {
        assert(isSingleGinzaVenueSource(name) === false, `${name} は複数店舗ブランドなのでfalseであるべき`)
      }
    },
  },
  {
    name: 'SOURCE_LEDGER_SEED_DATA全件：意図せず単独施設と判定されるものが無い（命名バグの回帰防止）',
    fn: () => {
      // 「単独施設として扱ってよい」と明示的に意図されているID一覧（notesで確認済みのもの）。
      // ここに無いIDがisSingleGinzaVenueSource===trueになったら、name変更等による
      // 意図しない部分一致（2026-09-12のデパ地下ブランド命名バグと同種）を疑うこと。
      const intendedSingleVenueIds = new Set([
        'ginza-six', 'mitsukoshi-ginza', 'matsuya-ginza', 'wako-ginza', 'seiko-house-ginza',
        'ginza-tsutaya-books', 'ginza-sony-park', 'shiseido-gallery', 'pola-museum-annex',
        'kabukiza', 'aida-mitsuo-museum', 'kyobunkwan-ginza', 'gekkoso-ginza', 'ginza-motoji',
        'shiseido-parlour-ginza', 'ginza-sembikiya', 'cafe-paulista-ginza', 'ginza-kikunoya',
        'ginza-kimuraya-sohonten', 'shiseido-the-store-ginza', 'boulmich-ginza',
      ])
      for (const s of SOURCE_LEDGER_SEED_DATA) {
        const single = isSingleGinzaVenueSource(s.name, s.url)
        const expected = intendedSingleVenueIds.has(s.id)
        assert(
          single === expected,
          `${s.id}（"${s.name}"）: isSingleGinzaVenueSource=${single} だが意図は${expected}（想定外の単独施設判定＝命名衝突の疑い）`,
        )
      }
    },
  },
]

export const suite = () => runSuite('ginzaRelevance', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
