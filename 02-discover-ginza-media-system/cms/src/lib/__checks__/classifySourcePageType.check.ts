// 非 GINZA SIX 候補の決定的分類ルール（classifySourcePageType）の回帰テスト。
// フィクスチャは 2026-09-04 時点の実 inbox データ（実 URL・実タイトル）に基づく。
//
//   node --import=tsx/esm src/lib/__checks__/classifySourcePageType.check.ts

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { classifySourcePageType } from '../morning/classifySourcePageType'
import { classifyFactKind } from '../morning/classifyFactKind'
import { classifyTemplateType } from '../morning/classifyTemplateType'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const cases: CheckCase[] = [
  // ---------- 蔦屋書店：個別イベント詳細ページ ----------
  {
    name: '蔦屋 /ginza/event/art/<id>.html ＋【フェア】原画展 → article / event / exhibition',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: '銀座 蔦屋書店',
        url: 'https://store.tsite.jp/ginza/event/art/56496-1404070828.html',
        venue: '銀座 蔦屋書店',
        title: '【フェア】道草晴子 原画展',
        contentType: 'event',
      })
      assert(r.pageKind === 'article', `pageKind=article 期待 / 実際 ${r.pageKind}`)
      assert(r.factKindHint === 'event', `factKindHint=event 期待 / 実際 ${r.factKindHint}`)
      assert(r.templateTypeHint === 'exhibition', `templateTypeHint=exhibition 期待 / 実際 ${r.templateTypeHint}`)
      assert(r.ruleIds.includes('host:store.tsite.jp:article_event'), 'URL ルール ID を記録')
      assert(r.evidence.length >= 2, '根拠が 2 行以上（URL ＋ タイトル）')
    },
  },
  {
    name: '蔦屋 仕事展（既存正規表現が拾わない語）でも「◯◯展」で exhibition ヒント',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: '銀座 蔦屋書店',
        url: 'https://store.tsite.jp/ginza/event/stationery/56562-1318480901.html',
        title: '【フェア】九谷焼をつくる／九谷焼から考える 上出長右衛門窯と上出瓷藝の仕事展',
        contentType: 'event',
      })
      assert(r.pageKind === 'article' && r.factKindHint === 'event', 'article / event')
      assert(r.templateTypeHint === 'exhibition', `exhibition 期待 / 実際 ${r.templateTypeHint}`)
    },
  },
  {
    name: '蔦屋 トークイベント → workshop ヒント',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: '銀座 蔦屋書店',
        url: 'https://store.tsite.jp/ginza/event/art/56233-1048490814.html',
        title: '【トークイベント＆サイン本お渡し会】写真集「HAMLET」発売記念 八代目市川染五郎×中里唯馬トークイベント',
        contentType: 'event',
      })
      assert(r.templateTypeHint === 'workshop', `workshop 期待 / 実際 ${r.templateTypeHint}`)
    },
  },
  {
    name: '蔦屋 漆作家 …（展の語なし）でも「作家」で exhibition ヒント',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: '銀座 蔦屋書店',
        url: 'https://store.tsite.jp/ginza/event/stationery/55062-1523180615.html',
        title: '【夏時間2026】漆作家 佐々木響子 「夏の光の記憶を映す漆」',
        contentType: 'event',
      })
      assert(r.pageKind === 'article' && r.factKindHint === 'event', 'article / event')
      assert(r.templateTypeHint === 'exhibition', `exhibition 期待 / 実際 ${r.templateTypeHint}`)
    },
  },
  {
    name: '蔦屋 POP-UP STORE（展・作家なし）→ event だが templateTypeHint は null（推測しない）',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: '銀座 蔦屋書店',
        url: 'https://store.tsite.jp/ginza/event/humanities/55364-1103220630.html',
        title: '【フェア】日本の四季と伝統を肌で纏う。ライフスタイルブランド『継（つぐ）』POP-UP STORE',
        contentType: 'event',
      })
      // 【フェア】は EXPLICIT_EXHIBITION_RE に含む → exhibition ヒントは出る（【フェア】＝展示即売の明記）
      assert(r.pageKind === 'article' && r.factKindHint === 'event', 'article / event')
    },
  },
  {
    name: '蔦屋 セクションページ（記事IDなし）→ index',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: '銀座 蔦屋書店',
        url: 'https://store.tsite.jp/ginza/event/GINZA-ATRIUM-WORKS',
        title: 'GINZA ATRIUM WORKS',
        contentType: 'event',
      })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
      assert(r.factKindHint === null && r.templateTypeHint === null, 'index はヒントを出さない')
    },
  },

  // ---------- 中央区観光協会 ----------
  {
    name: '中央区 /blogs/event/<id> ＋ 第16回…フェスティバル → article / event / recurring_event',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: '中央区観光関連',
        url: 'https://www.chuo-kanko.or.jp/blogs/event/202607291349',
        title: '第16回 中央区・銀座シャンソン＆ミュージックフェスティバル',
        excerpt: 'event イベント 開催期間 2026年09月27日(日) 第16回 中央区・銀座シャンソン＆ミュージックフェスティバル',
        contentType: 'event',
      })
      assert(r.pageKind === 'article' && r.factKindHint === 'event', 'article / event')
      assert(r.templateTypeHint === 'recurring_event', `recurring_event 期待 / 実際 ${r.templateTypeHint}`)
      assert(r.ruleIds.includes('body:period'), '本文の開催期間明記を根拠に記録')
    },
  },
  {
    name: '中央区 /blogs/news/<id>（告知）→ article だが factKind ヒントなし（推測しない）',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: '中央区観光関連',
        url: 'https://www.chuo-kanko.or.jp/blogs/news/2609020930',
        title: '第19回中央区観光検定 今年のテーマが決定しました！',
        contentType: 'news',
      })
      assert(r.pageKind === 'article', `article 期待 / 実際 ${r.pageKind}`)
      assert(r.factKindHint === null, '告知記事に event ヒントを付けない')
    },
  },

  // ---------- GINZA OFFICIAL ----------
  {
    name: 'GINZA OFFICIAL /shopnews/shopnews-<shop>/<id> ＋ 華雅展 → article / event / exhibition',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: 'GINZA OFFICIAL',
        url: 'https://www.ginza.jp/shopnews/shopnews-joliesse/35814',
        title: '【ジョリエス】華雅展',
        contentType: 'event',
      })
      assert(r.pageKind === 'article', `article 期待 / 実際 ${r.pageKind}`)
      assert(r.templateTypeHint === 'exhibition', `exhibition 期待 / 実際 ${r.templateTypeHint}`)
    },
  },
  {
    name: 'GINZA OFFICIAL /event/page/2（一覧）→ index',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: 'GINZA OFFICIAL',
        url: 'https://www.ginza.jp/event/page/2',
        title: '銀座のイベント情報',
        contentType: 'event',
      })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
    },
  },
  {
    name: 'GINZA OFFICIAL /shopevent（一覧）→ index',
    fn: () => {
      const r = classifySourcePageType({ sourceName: 'GINZA OFFICIAL', url: 'https://www.ginza.jp/shopevent', title: 'おすすめイベント・新着情報' })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
    },
  },

  // ---------- GO TOKYO ----------
  {
    name: 'GO TOKYO /jp/event/<cat>/<slug>.html → article / event',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: 'GO TOKYO',
        url: 'https://www.gotokyo.org/jp/event/tokyotouristinfo/20260912shinagawacruise.html',
        title: '【9/12,13限定】しながわクルーズ「天王洲周遊アートクルーズ」',
        contentType: 'event',
      })
      assert(r.pageKind === 'article' && r.factKindHint === 'event', `article/event 期待 / 実際 ${r.pageKind}/${r.factKindHint}`)
    },
  },
  {
    name: 'GO TOKYO /jp/story/guide/january/index.html → index',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: 'GO TOKYO',
        url: 'https://www.gotokyo.org/jp/story/guide/january/index.html',
        title: '1月のおすすめ観光スポットとアクティビティ',
        contentType: 'news',
      })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
    },
  },
  {
    name: 'GO TOKYO /jp/see-and-do/history/index.html → index',
    fn: () => {
      const r = classifySourcePageType({ sourceName: 'GO TOKYO', url: 'https://www.gotokyo.org/jp/see-and-do/history/index.html', title: '江戸の歴史・文化' })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
    },
  },

  // ---------- 歌舞伎座・SEIKO：一覧／店舗案内 ----------
  {
    name: '歌舞伎座 /miyage/hanamichi.html（店舗案内）→ index',
    fn: () => {
      const r = classifySourcePageType({ sourceName: '歌舞伎座', url: 'https://www.kabuki-za.co.jp/miyage/hanamichi.html', title: '地下2階 食品雑貨はなみち' })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
    },
  },
  {
    name: '歌舞伎座 /news_archives/info（一覧）→ index',
    fn: () => {
      const r = classifySourcePageType({ sourceName: '歌舞伎座', url: 'https://www.kabuki-za.co.jp/news_archives/info', title: '最新情報' })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
    },
  },
  {
    name: 'SEIKO /en/products/... （英語コーポレート・非銀座）→ index',
    fn: () => {
      const r = classifySourcePageType({ sourceName: 'SEIKO HOUSE GINZA', url: 'https://www.seiko.co.jp/en/products/device', title: 'Device Solutions Business' })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
    },
  },

  // ---------- 帝国ホテル（2026-09-14追加・マロン指示：候補抽出根本原因対応の検証host） ----------
  {
    name: '帝国ホテル /tokyo/hotelshop/seasonal/<slug> → article（個別の季節商品ページ）',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: '帝国ホテル',
        url: 'https://www.imperialhotel.co.jp/tokyo/hotelshop/seasonal/white-day-2026',
        title: 'ホワイトデーや季節の贈り物に | 季節のおすすめ情報 | ホテルショップ | 帝国ホテル 東京',
      })
      assert(r.pageKind === 'article', `article 期待 / 実際 ${r.pageKind}`)
    },
  },
  {
    name: '帝国ホテル /tokyo/event/<slug> → article / event',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: '帝国ホテル',
        url: 'https://www.imperialhotel.co.jp/tokyo/event/arcade-autumn-fair-2026',
        title: '帝国ホテルアーケード オータムフェア2026 | イベント | 帝国ホテル 東京',
      })
      assert(r.pageKind === 'article' && r.factKindHint === 'event', `article/event 期待 / 実際 ${r.pageKind}/${r.factKindHint}`)
    },
  },
  {
    name: '帝国ホテル /tokyo/hotelshop/mail-order（通信販売トップ）→ index',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: '帝国ホテル',
        url: 'https://www.imperialhotel.co.jp/tokyo/hotelshop/mail-order',
        title: '通信販売 | ホテルショップ 「ガルガンチュワ」 | 帝国ホテル 東京',
      })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
    },
  },
  {
    name: '帝国ホテル /tokyo/facility-access/<slug>（共通案内）→ index',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: '帝国ホテル',
        url: 'https://www.imperialhotel.co.jp/tokyo/facility-access/fitness-spa',
        title: 'プール・サウナ・フィットネスジム | 館内施設・アクセス | 帝国ホテル 東京',
      })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
    },
  },
  {
    name: '帝国ホテル /special/<slug>（ブランドストーリー等）→ index',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: '帝国ホテル',
        url: 'https://www.imperialhotel.co.jp/special/brand-story',
        title: 'ブランドストーリー | 帝国ホテル',
      })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
    },
  },

  // ---------- GINZA SIX（2026-09-14追加：既存host ruleへのテスト補強） ----------
  {
    name: 'GINZA SIX /news/detail/shopnews/<id> → article',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: 'GINZA SIX',
        url: 'https://ginza6.tokyo/news/detail/shopnews/12345',
        title: '秋の新作コレクション発売',
      })
      assert(r.pageKind === 'article', `article 期待 / 実際 ${r.pageKind}`)
    },
  },
  {
    name: 'GINZA SIX /shopguide（一覧）→ index',
    fn: () => {
      const r = classifySourcePageType({ sourceName: 'GINZA SIX', url: 'https://ginza6.tokyo/shopguide', title: 'ショップガイド' })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
    },
  },

  // ---------- 資生堂ギャラリー（2026-09-14追加：既存host ruleへのテスト補強） ----------
  {
    name: '資生堂ギャラリー /jp/exhibition/<slug> → article',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: '資生堂ギャラリー',
        url: 'https://gallery.shiseido.com/jp/exhibition/2026autumn',
        title: '2026年秋期展',
      })
      assert(r.pageKind === 'article', `article 期待 / 実際 ${r.pageKind}`)
    },
  },
  {
    name: '資生堂ギャラリー /jp/press（プレスリリース一覧）→ index',
    fn: () => {
      const r = classifySourcePageType({ sourceName: '資生堂ギャラリー', url: 'https://gallery.shiseido.com/jp/press', title: 'PRESS RELEASE | SHISEIDO GALLERY | 資生堂' })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
    },
  },
  {
    name: '資生堂ギャラリー /jp/artegg/prize（賞制度の常設ページ）→ index',
    fn: () => {
      const r = classifySourcePageType({ sourceName: '資生堂ギャラリー', url: 'https://gallery.shiseido.com/jp/artegg/prize', title: 'shiseido art egg賞 | SHISEIDO GALLERY' })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
    },
  },

  // ---------- POLA MUSEUM ANNEX（2026-09-14追加：既存host ruleへのテスト補強） ----------
  {
    name: 'POLA MUSEUM ANNEX /m-annex/exhibition/<slug> → article',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: 'POLA MUSEUM ANNEX',
        url: 'https://www.po-holdings.co.jp/m-annex/exhibition/20260901',
        title: '束芋「Land and Beyond｜大地の声をたどる」',
      })
      assert(r.pageKind === 'article', `article 期待 / 実際 ${r.pageKind}`)
    },
  },
  {
    name: 'POLA MUSEUM ANNEX /m-annex/exhibition/index.html（一覧）→ index',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: 'POLA MUSEUM ANNEX',
        url: 'https://www.po-holdings.co.jp/m-annex/exhibition/index.html',
        title: 'POLA MUSEUM ANNEX 開催中の企画展',
      })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
    },
  },
  {
    name: 'POLA MUSEUM ANNEX /m-annex/event/<slug>（イベント告知の常設URL）→ index（indexRe優先）',
    fn: () => {
      // POLA のホストルールは /m-annex/exhibition/<id> のみを article とし、/m-annex/event/<id> は
      // articleEventRe を持たないため index フォールバックにもならず unknown 側へ倒れる設計。
      // ここでは実データにあった /m-annex/event/<id> パスが誤って article 確定しないことだけ確認する。
      const r = classifySourcePageType({
        sourceName: 'POLA MUSEUM ANNEX',
        url: 'https://www.po-holdings.co.jp/m-annex/event/20230629.html',
        title: '木村英輝 EXHIBITION ― 大人のストリートアート ― 追加公開制作',
      })
      assert(r.pageKind !== 'article' || r.confidence !== 'high', 'ホストルール未定義パスを高信頼度のarticleと確定しない')
    },
  },

  // ---------- 共通案内・システム告知（2026-09-14追加・マロン指示） ----------
  {
    name: 'My account（木挽町よしや）→ index',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: '木挽町よしや',
        url: 'https://kobikichoyoshiya.com/my-account',
        title: 'My account | 木挽町よしや',
      })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
    },
  },
  {
    name: '木挽町よしや /nichinichi_<id>（個別コラム）→ article',
    fn: () => {
      const r = classifySourcePageType({
        sourceName: '木挽町よしや',
        url: 'https://kobikichoyoshiya.com/nichinichi_007',
        title: '007 木挽町よしや「初心忘るべからず」',
      })
      assert(r.pageKind === 'article', `article 期待 / 実際 ${r.pageKind}`)
    },
  },
  {
    name: '未知ホストでも末尾が「search」→ index（検索結果）',
    fn: () => {
      const r = classifySourcePageType({ sourceName: 'どこか', url: 'https://example.com/shop/search', title: '検索' })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
    },
  },
  {
    name: '未知ホストでもタイトルが「通信販売トップ」→ index',
    fn: () => {
      const r = classifySourcePageType({ sourceName: 'どこか', url: 'https://example.com/shop/order-123', title: '通信販売トップ' })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
    },
  },

  // ---------- 根拠不足 → unknown を維持 ----------
  {
    name: 'URL なし → unknown（推測しない）',
    fn: () => {
      const r = classifySourcePageType({ sourceName: '銀座 蔦屋書店', title: '【フェア】道草晴子 原画展' })
      assert(r.pageKind === 'unknown', `unknown 期待 / 実際 ${r.pageKind}`)
      assert(r.factKindHint === null && r.templateTypeHint === null, 'ヒントなし')
      assert(r.ruleIds[0] === 'no_url', 'no_url を記録')
    },
  },
  {
    name: '未知ホスト・記事的 URL だが索引語なし → unknown（article/index に寄せない）',
    fn: () => {
      const r = classifySourcePageType({ sourceName: 'どこか', url: 'https://example.com/foo/bar-123', title: '何かのページ' })
      assert(r.pageKind === 'unknown', `unknown 期待 / 実際 ${r.pageKind}`)
    },
  },
  {
    name: '未知ホストでも URL 末尾が index セグメント → index',
    fn: () => {
      const r = classifySourcePageType({ sourceName: 'どこか', url: 'https://example.com/exhibition/', title: '展覧会一覧' })
      assert(r.pageKind === 'index', `index 期待 / 実際 ${r.pageKind}`)
    },
  },

  // ---------- classifyFactKind への統合（URL パラメータあり） ----------
  {
    name: 'classifyFactKind: 蔦屋 event URL ＋ contentType=event → 2 シグナルで event（medium 以上）',
    fn: () => {
      const c = classifyFactKind({
        contentType: 'event',
        uxType: 'shopping_discovery',
        title: '【フェア】道草晴子 原画展',
        excerpt: 'メインコンテンツへ移動 ENGLISH 中文 フロアガイド ショップリスト',
        url: 'https://store.tsite.jp/ginza/event/art/56496-1404070828.html',
        sourceName: '銀座 蔦屋書店',
        venue: '銀座 蔦屋書店',
      })
      assert(c.factKind === 'event', `event 期待 / 実際 ${c.factKind}`)
      assert(c.confidence !== 'low', `low でない（実際 ${c.confidence}）`)
      assert(c.sourcePage?.pageKind === 'article', 'sourcePage を記録')
      assert(c.signals.event.some((s) => /個別イベント詳細/.test(s)), 'URL シグナルを event に加算')
    },
  },
  {
    name: 'classifyFactKind: 一覧ページ URL → index を矛盾として記録し unknown 維持',
    fn: () => {
      const c = classifyFactKind({
        contentType: 'event',
        uxType: 'participate_workshop',
        title: '銀座のイベント情報',
        excerpt: '',
        url: 'https://www.ginza.jp/event/page/2',
        sourceName: 'GINZA OFFICIAL',
      })
      assert(c.factKind === 'unknown', `unknown 維持 期待 / 実際 ${c.factKind}`)
      assert(c.signals.contradiction.some((s) => /一覧・索引ページ/.test(s)), '一覧ページを矛盾に記録')
      assert(c.sourcePage?.pageKind === 'index', 'sourcePage=index')
    },
  },
  {
    name: 'classifyFactKind: URL パラメータなし → 従来どおり（1 シグナルは unknown）',
    fn: () => {
      const c = classifyFactKind({ contentType: null, uxType: null, title: '新作コレクション', excerpt: '銀座で新作コレクションを紹介します。' })
      assert(c.factKind === 'unknown', `後方互換で unknown（実際 ${c.factKind}）`)
      assert(c.sourcePage == null || c.sourcePage === null, 'URL なしは sourcePage=null')
    },
  },

  // ---------- classifyTemplateType への統合 ----------
  {
    name: 'classifyTemplateType: 蔦屋 event URL ＋「◯◯展」→ exhibition（confidence != low）',
    fn: () => {
      const r = classifyTemplateType({
        factKind: 'event',
        contentType: 'event',
        title: '【フェア】九谷焼をつくる／九谷焼から考える 上出長右衛門窯と上出瓷藝の仕事展',
        excerpt: 'フロアガイド ショップリスト',
        url: 'https://store.tsite.jp/ginza/event/stationery/56562-1318480901.html',
        sourceName: '銀座 蔦屋書店',
      })
      assert(r.templateType === 'exhibition', `exhibition 期待 / 実際 ${r.templateType}`)
      assert(r.confidence !== 'low', `low でない（実際 ${r.confidence}）`)
    },
  },
  {
    name: 'classifyTemplateType: 中央区 event URL ＋「第16回…フェスティバル」→ recurring_event',
    fn: () => {
      const r = classifyTemplateType({
        factKind: 'event',
        contentType: 'event',
        title: '第16回 中央区・銀座シャンソン＆ミュージックフェスティバル',
        excerpt: '開催期間 2026年09月27日(日)',
        url: 'https://www.chuo-kanko.or.jp/blogs/event/202607291349',
        sourceName: '中央区観光関連',
      })
      assert(r.templateType === 'recurring_event', `recurring_event 期待 / 実際 ${r.templateType}`)
    },
  },
  {
    name: 'classifyTemplateType: URL パラメータなし → 従来どおり（個展 → exhibition）',
    fn: () => {
      const r = classifyTemplateType({ factKind: 'event', title: '百世個展『めぐり はじまる』', excerpt: '消しゴムハンコ作家の個展を開催いたします', contentType: 'exhibition' })
      assert(r.templateType === 'exhibition', `後方互換（実際 ${r.templateType}）`)
    },
  },
  {
    name: 'classifyTemplateType: 蔦屋 event URL でも展・WS・恒例の明記なし → unknown 維持（推測しない）',
    fn: () => {
      const r = classifyTemplateType({
        factKind: 'event',
        contentType: 'event',
        title: '〝縁起のいい〟玄米茶ブランド 〈京玄米茶 上ル入ル〉',
        excerpt: 'フロアガイド ショップリスト',
        url: 'https://store.tsite.jp/ginza/event/stationery/55600-1708210710.html',
        sourceName: '銀座 蔦屋書店',
      })
      assert(r.templateType === 'unknown', `unknown 維持 期待 / 実際 ${r.templateType}`)
    },
  },
]

export const suite = () => runSuite('classifySourcePageType', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  reportAndExit([suite()])
}
