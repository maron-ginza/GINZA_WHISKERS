import type { SourceLedgerEntry } from './types'

// SOURCE LEDGER v1（2026-08-15）初期Core Source候補。
//
// 初期Core Source候補（14件）＋2026-09-04追加のprimary専門店/美術館7件＋2026-09-11追加の
// 収集カバレッジ補完6件（うち木村家・あけぼのの2件は同日中にWebSearchで実在確認しenabled化）
// ＋2026-09-11「スウィーツ候補の安定収集」追加分5件（千疋屋・HIGASHIYA・とらや・銀座ウエスト・
// 帝国ホテル）＋同日続き追加分3件（CAFE PAULISTA・銀座菊廼舎・空也、WebFetchでお知らせ一覧の
// 稼働実績まで確認しenabled:true）＋2026-09-12 BEAUTY母数補完1件（AYURA GINZA）。合計36件。
// urlは初期14件についてはWebSearchで
// 実際の検索結果リンク（AIによる要約文ではなく、検索結果に直接返ってきたURL）を根拠に
// 確認済み（確認日はnotesに記載）。「URLや取得方式が不確かなものを推測で埋めない」という
// 方針のため、複数の候補URLが見つかった情報源（銀座三越・松屋銀座・SEIKO HOUSE GINZA・
// Ginza Sony Park）は、検索結果に直接リンクとして現れ、タイトルとURLの対応が明確だった
// ものを採用し、判断根拠をnotesに残した。将来この判断を人間が見直す余地を残すため、
// 確定情報として無条件に扱わず、次回セッションでの目視確認を推奨する。
//
// このファイルがSOURCE LEDGERの正本（git管理・人間レビュー対象）。DB（source-ledger
// コレクション）へは`seedSourceLedger.ts`で投入し、以後の運用状態（enabled切替・
// lastCheckedAt/lastChangedAt）はDB側で更新していく想定。
export const SOURCE_LEDGER_SEED_DATA: SourceLedgerEntry[] = [
  {
    id: 'ginza-official',
    name: 'GINZA OFFICIAL',
    url: 'https://www.ginza.jp/',
    category: 'ginza_general',
    tier: 'core',
    language: 'ja_en',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      '銀座の公式ウェブサイト（銀座通連合会/GINZA Information Management運営）。街全体の' +
      'イベント・エリア情報を横断的に発信。2026-08-15 WebSearchで確認。',
  },
  {
    id: 'ginza-six',
    name: 'GINZA SIX',
    url: 'https://ginza6.tokyo/',
    category: 'commercial',
    tier: 'core',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes: '商業施設GINZA SIXの公式サイト。ニュース・イベント・店舗情報。2026-08-15 WebSearchで確認。',
  },
  {
    id: 'mitsukoshi-ginza',
    name: '銀座三越',
    url: 'https://www.mistore.jp/store/ginza.html',
    category: 'department_store',
    tier: 'core',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      '三越伊勢丹「銀座三越」店舗ページ。旧mitsukoshi.co.jpドメインの店舗ページも見つかったが、' +
      '三越伊勢丹公式の店舗情報ドメイン(mistore.jp)を正とした。2026-08-15 WebSearchで確認。' +
      '【source health・2026-09-11再確認】スイーツ催事の詳細ページ' +
      '（/shopping/event/ginza_e/sweets_collection_51、/shopping/feature/foods_f2/' +
      'event_ginza_f_test.html）を含め WebFetch で3URLとも接続タイムアウト（ETIMEDOUT）。' +
      '2026-08-16記載の「ブラウザ限定の接続レベルの選別」と同一原因が2026-09-11時点でも' +
      '継続していることを確認。mistore.jp ドメイン全体が単純HTTP取得に対し構造的に' +
      '取得不能——URLパスを変えても解消しないため、実ブラウザへのなりすましをしない方針の' +
      '範囲では解決不可（2026-08-16判断を再確認・変更なし）。',
  },
  {
    id: 'matsuya-ginza',
    name: '松屋銀座',
    url: 'https://www.matsuyaginza.com/jp/',
    category: 'department_store',
    tier: 'core',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      '松屋銀座公式サイト。企業サイト側の店舗ページ(matsuya.com/ginza/)候補もあったが、検索結果に' +
      '直接リンクとして現れタイトルが一致したmatsuyaginza.comを採用。2026-08-15 WebSearchで確認。' +
      '【source health・2026-09-11再確認】matsuyaginza.com/jp/ 自体は WebFetch で接続でき' +
      '「公式オンラインストア」のヘッダーは取得できたが、具体的な催事・商品情報は確認できず' +
      '（JS描画に依存している可能性）。100周年記念キャンペーンサイト' +
      '（ginza100th-matsuya.com、スイーツ催事情報を掲載）を代替候補として検討したが、' +
      'WebFetch で ENOTFOUND（名前解決不可）——期間限定キャンペーンサイトが既に閉鎖・' +
      '移転した可能性が高く、恒久的な情報源として source registry へ追加するのは見送った。' +
      '百貨店の食品・催事公式ページの安定収集は引き続き未解決の課題として残る。',
  },
  {
    id: 'wako-ginza',
    name: '和光',
    url: 'https://www.wako.co.jp/',
    category: 'brand',
    tier: 'core',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      '銀座4丁目交差点の老舗「和光」公式オンラインブティック。セイコーグループ。2026-08-15 WebSearchで確認。',
  },
  {
    id: 'seiko-house-ginza',
    name: 'SEIKO HOUSE GINZA',
    url: 'https://www.seiko.co.jp/en/seiko_house_ginza/',
    category: 'brand',
    tier: 'core',
    language: 'ja_en',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      '和光本館ビルを活用したセイコーのブランド発信拠点。日本語版URL(seiko.co.jp/ginza2020)は' +
      '検索結果でタイトルとURLの対応が不明瞭だったため、対応が明確だった英語版URLを暫定採用。' +
      '日本語ページのURL確定は次回人間が目視確認すること。2026-08-15 WebSearchで確認。',
  },
  {
    id: 'ginza-tsutaya-books',
    name: '銀座 蔦屋書店',
    url: 'https://store.tsite.jp/ginza/',
    category: 'art_culture',
    tier: 'core',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes: 'GINZA SIX 6階の銀座 蔦屋書店公式サイト。展覧会・イベント情報。2026-08-15 WebSearchで確認。',
  },
  {
    id: 'ginza-sony-park',
    name: 'Sony Park',
    url: 'https://www.ginzasonypark.com/',
    category: 'art_culture',
    tier: 'core',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      '旧ソニービル跡地の体験型施設Ginza Sony Park公式サイト。Sonyブランド全体のsonypark.comとは' +
      '別に施設固有ドメインが確認できたためこちらを採用。2026-08-15 WebSearchで確認。',
  },
  {
    id: 'shiseido-gallery',
    name: '資生堂ギャラリー',
    url: 'https://gallery.shiseido.com/jp/',
    category: 'art_culture',
    tier: 'core',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      '1919年開設、現存する日本最古の画廊とされる資生堂ギャラリーの公式サイト。展覧会情報。' +
      '2026-08-15 WebSearchで確認。',
  },
  {
    id: 'pola-museum-annex',
    name: 'POLA MUSEUM ANNEX',
    url: 'https://www.po-holdings.co.jp/m-annex/',
    category: 'art_culture',
    tier: 'core',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      'ポーラ銀座ビル3階、入場無料の展示施設。ポーラ・オルビスホールディングス運営。2026-08-15 WebSearchで確認。',
  },
  {
    id: 'kabukiza',
    name: '歌舞伎座',
    url: 'https://www.kabuki-za.co.jp/',
    category: 'art_culture',
    tier: 'core',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes: '歌舞伎座（松竹運営）公式サイト。公演情報・チケット。2026-08-15 WebSearchで確認。',
  },
  {
    id: 'chuo-city-tourism',
    name: '中央区観光関連',
    url: 'https://www.chuo-kanko.or.jp/',
    category: 'public_tourism',
    tier: 'core',
    language: 'ja',
    sourceType: 'government',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      '一般社団法人中央区観光協会の公式サイト。銀座・日本橋・築地・月島・人形町を含む中央区全体の' +
      '観光・グルメ・歴史情報。2026-08-15 WebSearchで確認。',
  },
  {
    id: 'go-tokyo',
    name: 'GO TOKYO',
    url: 'https://www.gotokyo.org/jp/index.html',
    category: 'public_tourism',
    tier: 'core',
    language: 'ja_en',
    sourceType: 'government',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      '東京都・公益財団法人東京観光財団運営の東京都観光公式サイト。多言語対応（9言語）。' +
      '2026-08-15 WebSearchで確認。',
  },
  {
    id: 'tokyo-metro',
    name: '東京メトロ',
    url: 'https://www.tokyometro.jp/',
    category: 'transport',
    tier: 'core',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes: '東京地下鉄株式会社（東京メトロ）公式サイト。銀座エリアへのアクセス・運行情報。2026-08-15 WebSearchで確認。',
  },
  // --- 2026-09-04 追加（非 GINZA SIX の公式情報源を広げる。マロン承認）---
  // 「トップページを登録しない／継続巡回できる一覧URLを登録／一覧から個別記事を取得できること
  //  を事前確認する」方針。巡回フェッチャー（fetchSourceContent）で HTTP 200・robots.txt 許可・
  //  抽出リンクのうち classifyUrlGranularity=individual が複数あることを実地確認したもののみ登録。
  //
  // 登録を見送った情報源（403／接続不能／一覧から個別記事を取得できない）：
  //   ・東急プラザ銀座 … 「GinzaNovo」へ改称。旧ドメイン全パスが改称告知へ302、
  //                        ginzanovo.tokyu-plaza.com は接続不可。有効な一覧URLなし。
  //   ・銀座メゾンエルメス フォーラム … maisonhermes.jp／hermes.com とも 403 Forbidden（WAF）。
  //   ・シャネル・ネクサス・ホール … chanelnexushall.jp 接続不能、nexushall.chanel.com 403。
  //   ・ギンザ・グラフィック・ギャラリー（ggg/DNP文化振興財団） … dnpfoundation.or.jp 全パス接続不能。
  //   ・とらや（虎屋） … /news/ は個別記事1件のみ（JS描画のページ送り）。安定した一覧取得不可。
  //   ・銀座菊廼舎／銀座あけぼの／博品館劇場 … /news/・/theater/ が 200 でも links=0（JS描画）。
  //   ・銀座千疋屋 … /news/ 404。トップのみ個別ありだが内容は EC 運用通知中心。
  //   ・銀座木村家 … /news/ から取れる個別リンクは各階レストラン・メニュー紹介（個別催事ではない）。
  //   ・王子ホール … /concert/・/concert/lineup/・/calendar/・/schedule/ が 403 または 404。
  //   ・ヤマハ銀座／森岡書店 銀座店 … 全URL fetch failed（接続不能）。
  {
    id: 'shiseido-parlour-ginza',
    name: '資生堂パーラー',
    url: 'https://parlour.shiseido.co.jp/news/',
    category: 'food',
    tier: 'primary',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      '資生堂パーラー（銀座本店・レストラン／洋菓子）の公式ニュースリリース一覧。' +
      'トップページではなく継続巡回できる /news/ 一覧を登録。2026-09-04、巡回フェッチャーで' +
      'HTTP 200・robots.txt 許可を確認。ただし当時のリンク抽出は年度ナビ中心だったため、' +
      '個別記事の取得はサイト側の投稿・抽出器の対応次第（アーカイブ誤取得の修正で年度ページは除外済み）。',
  },
  {
    id: 'aida-mitsuo-museum',
    name: '相田みつを美術館',
    url: 'https://www.mitsuo.co.jp/news/',
    category: 'art_culture',
    tier: 'primary',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      '相田みつを美術館（東京国際フォーラム地下1階・銀座至近）のニュース＆コラム一覧。' +
      '2026-09-04、巡回フェッチャーで HTTP 200・robots.txt 許可・個別記事リンク15件' +
      '（/news/detail_<日付>.html＝展覧会・コラム・ニュースの個別ページ）を実地確認。',
  },
  {
    id: 'kyobunkwan-ginza',
    name: '教文館',
    url: 'https://www.kyobunkwan.co.jp/event-news/',
    category: 'art_culture',
    tier: 'primary',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      '教文館（銀座・書店／児童書店「ナルニア国」／催事）の公式「催事情報」一覧。' +
      '2026-09-04、巡回フェッチャーで HTTP 200・robots.txt 許可・個別記事リンク10件' +
      '（/<売場>/event-news/event-event/entry-<id>.html＝日付つき催事）を実地確認。',
  },
  {
    id: 'gekkoso-ginza',
    name: '月光荘画材店',
    url: 'https://gekkoso.jp/news',
    category: 'art_culture',
    tier: 'primary',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      '月光荘画材店（銀座の老舗画材店・GEKKOSO GALLERY／画室・企画）の投稿一覧。' +
      '2026-09-04、巡回フェッチャーで HTTP 200・robots.txt 許可・個別記事リンク4件' +
      '（/<記事ID>＝レッスン・企画・GEKKOSO Presents 等の個別ページ、日付明記あり）を実地確認。',
  },
  {
    id: 'ginza-motoji',
    name: '銀座もとじ',
    url: 'https://www.motoji.co.jp/blogs/events',
    category: 'art_culture',
    tier: 'primary',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      '銀座もとじ（銀座の老舗きもの専門店。染織作家展・工芸催事）の「催事」一覧。' +
      '2026-09-04、巡回フェッチャーで HTTP 200・robots.txt 許可・個別記事リンク15件' +
      '（/blogs/events/<slug>＝◯月催事・作家展。日付／《開催終了》明記あり）を実地確認。',
  },
  {
    id: 'yamano-music-ginza',
    name: '山野楽器 銀座本店',
    url: 'https://www.yamano-music.co.jp/information/',
    category: 'art_culture',
    tier: 'primary',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      '山野楽器 銀座本店（1892年創業の銀座の楽器・音楽専門店。フェア・イベント・音楽教室）の' +
      '「インフォメーション」一覧。2026-09-04、巡回フェッチャーで HTTP 200・robots.txt 許可・' +
      '個別記事リンク15件（/information/<id>＝日付つきフェア・キャンペーン・イベント）を実地確認。',
  },
  {
    id: 'ginza-natsuno',
    name: '銀座夏野',
    url: 'https://www.e-ohashi.com/blog/news/',
    category: 'art_culture',
    tier: 'primary',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'daily',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      '銀座夏野（銀座の箸専門店。工芸・暮らし・ワークショップ・季節のギフト）の「お知らせ」一覧。' +
      '2026-09-04、巡回フェッチャーで HTTP 200・robots.txt 許可・個別記事リンク15件' +
      '（/blog/news/<id>＝日付つき記事・ワークショップ案内）を実地確認。',
  },
  // ───────────────────────────────────────────────────────────────
  // 2026-09-11 収集カバレッジ不足の補完（BEAUTY／FOOD／CULTURE が百貨店・蔦屋に偏り、
  // ビューティー専門・老舗・路面店・ギャラリーの母数が薄いため追加）。
  // URL は一般に公開されている公式トップ相当を暫定登録。**enabled:false のまま**にし、
  // 次回巡回前に「一覧ページの実在・robots.txt・個別記事リンク形式」を目視確認してから
  // enabled:true にすること（seedData の他エントリと同じ確認プロセス）。
  // ───────────────────────────────────────────────────────────────
  {
    id: 'shiseido-the-store-ginza',
    name: 'SHISEIDO THE STORE（銀座）',
    url: 'https://thestore.shiseido.co.jp/',
    category: 'brand',
    tier: 'secondary',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'weekly',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      'BEAUTY 母数の補完。資生堂の銀座フラッグシップ（コスメ・フレグランス・イベント・限定品）。銀座' +
      '単独立地（他都市に同名店舗なし）。2026-09-11 追加時は要目視確認としたが、2026-09-12の' +
      '「安定して3件以上」対応で WebFetch 再確認——「NEWS & TOPICS」が実際に稼働し、9月の新製品' +
      'キャンペーン（ザ・ギンザ リバイタライザーｎ、Narciso Rodriguezフレグランス等）を掲載して' +
      'いることを確認しenabled:true化。',
  },
  {
    id: 'itoya-ginza',
    name: '銀座・伊東屋',
    url: 'https://www.ito-ya.co.jp/ginza/',
    category: 'commercial',
    tier: 'secondary',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'weekly',
    enabled: false,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      'SHOPPING／WORKSHOP／GIFT 母数の補完。1904年創業の銀座の文具専門店（フェア・実演・ワークショップ・季節の品）。' +
      '2026-09-11 追加。一覧ページ URL・robots.txt・個別記事リンク形式を目視確認してから enabled 化する。',
  },
  {
    id: 'ginza-kimuraya-sohonten',
    name: '銀座木村家（木村屋總本店）',
    url: 'https://www.ginzakimuraya.jp/',
    category: 'food',
    tier: 'secondary',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'weekly',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      'SWEETS（老舗・あんぱん）母数の補完。1869年創業のあんぱん発祥の店（季節の菓子・限定品・催事）。' +
      '2026-09-11 追加時は enabled:false・要目視確認としたが、2026-09-11の「スウィーツ候補の安定収集」' +
      '実装セッションで WebSearch により公式サイトが稼働中であることを再確認し enabled:true へ変更。',
  },
  {
    id: 'ginza-akebono',
    name: '銀座あけぼの',
    url: 'https://www.ginza-akebono.co.jp/',
    category: 'food',
    tier: 'discovery',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'medium',
    crawlFrequency: 'weekly',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      'SWEETS／GIFT（老舗和菓子）母数の補完。1948年創業（季節の和菓子・ギフト・限定）。' +
      '2026-09-11 追加時は enabled:false・要目視確認としたが、同日の「スウィーツ候補の安定収集」' +
      '実装セッションで WebSearch により公式サイトが稼働中であることを再確認し enabled:true へ変更。',
  },
  {
    id: 'ggg-ginza-graphic-gallery',
    name: 'ギンザ・グラフィック・ギャラリー（ggg）',
    url: 'https://www.ggg.jp/',
    category: 'art_culture',
    tier: 'secondary',
    language: 'ja_en',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'weekly',
    enabled: false,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      'CULTURE／ART（デザイン専門ギャラリー）母数の補完。DNP 運営、グラフィックデザインの企画展。' +
      '2026-09-11 追加。展覧会一覧ページ URL・robots.txt・会期表記を目視確認してから enabled 化する。',
  },
  {
    id: 'maison-hermes-le-forum-ginza',
    name: '銀座メゾンエルメス フォーラム',
    url: 'https://www.maisonhermes.jp/ginza/le-forum/',
    category: 'art_culture',
    tier: 'discovery',
    language: 'ja_en',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'weekly',
    enabled: false,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      'ART（現代美術）母数の補完。銀座メゾンエルメス8・9階の展示スペース。' +
      '2026-09-11 追加。展覧会一覧ページ URL・robots.txt・会期表記を目視確認してから enabled 化する。',
  },
  // ───────────────────────────────────────────────────────────────
  // 2026-09-11（スウィーツ候補の安定収集）追加。特定施設・ブランドへの偏りを避けるため、
  // 路面洋菓子店・和菓子店・老舗菓子店・ホテル公式スイーツ情報の4種別から分散して選定。
  // 各 URL は WebSearch で実在・稼働中を確認したうえで enabled:true とした
  // （検索結果に直接返ってきたリンクを根拠に採用。まとめサイト・転載記事は不採用）。
  // ───────────────────────────────────────────────────────────────
  {
    id: 'ginza-sembikiya',
    name: '銀座千疋屋',
    url: 'https://ginza-sembikiya.jp/f/news_release',
    category: 'food',
    tier: 'primary',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'weekly',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      'SWEETS（銀座の路面洋菓子・フルーツ専門店）母数の補完。1894年創業。「お知らせ・新着情報」' +
      '一覧ページ https://ginza-sembikiya.jp/f/news_release を WebSearch で実在確認（2026-09-11、' +
      '季節スイーツフェア等の新着記事を掲載していることを確認）。',
  },
  {
    id: 'higashiya-ginza',
    name: 'HIGASHIYA GINZA',
    url: 'https://www.higashiya.com/news/?cat=3',
    category: 'food',
    tier: 'secondary',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'weekly',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      'SWEETS（現代和菓子・茶房）母数の補完。銀座の和菓子・茶房ブランド。「お知らせ」一覧ページ' +
      'https://www.higashiya.com/news/?cat=3 を WebSearch で実在確認（2026-09-11、季節の和菓子・' +
      '限定メニューの新着記事を掲載していることを確認）。',
  },
  {
    id: 'toraya-ginza',
    name: 'とらや（TORAYA GINZA）',
    url: 'https://www.toraya-group.co.jp/toraya/news/?cid%5B%5D=2',
    category: 'food',
    tier: 'primary',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'weekly',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      'SWEETS（老舗和菓子）母数の補完。1947年〜銀座、2024年に喫茶中心の「TORAYA GINZA」へ' +
      'リニューアル。株式会社虎屋の公式お知らせ一覧 https://www.toraya-group.co.jp/toraya/news/ ' +
      'を WebSearch で実在確認（2026-09-11、新商品・季節の和菓子情報を掲載していることを確認）。',
  },
  {
    id: 'ginza-west',
    name: '銀座ウエスト（GINZA WEST）',
    url: 'https://www.ginza-west.com/',
    category: 'food',
    tier: 'discovery',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'medium',
    crawlFrequency: 'weekly',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      'SWEETS（老舗喫茶・洋菓子）母数の補完。1947年創業、着色料・香料不使用の焼き菓子。公式サイト' +
      'https://www.ginza-west.com/ を WebSearch で実在確認（2026-09-11、季節限定商品の告知を確認）。' +
      '一覧ページの正確な URL 構造までは確認できていないため tier=discovery（自動発見に委ねる）。',
  },
  {
    id: 'imperial-hotel-tokyo-gargantua',
    name: '帝国ホテル 東京 ホテルショップ「ガルガンチュワ」',
    url: 'https://www.imperialhotel.co.jp/j/tokyo/news/hotelshop/column_index.html',
    category: 'hotel',
    tier: 'secondary',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'weekly',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      'SWEETS（ホテル公式スイーツ・ペストリー）母数の補完。帝国ホテル東京本館1階のペストリー・' +
      '洋菓子ショップ。公式コラムページ https://www.imperialhotel.co.jp/j/tokyo/news/hotelshop/' +
      'column_index.html を WebSearch で実在確認（2026-09-11、2024年8月のリニューアル情報等を確認）。',
  },
  // ───────────────────────────────────────────────────────────────
  // 2026-09-11 続き（マロン指示により次回優先種別への実接続）。WebSearch で実在確認した
  // うえで WebFetch により「お知らせ／ニュース一覧が実際に稼働しているか」まで確認できた
  // ものだけを enabled:true で追加（一覧ページの存在だけでなく更新実績を確認）。
  // ───────────────────────────────────────────────────────────────
  {
    id: 'cafe-paulista-ginza',
    name: 'CAFE PAULISTA（銀座カフェーパウリスタ）',
    url: 'https://www.paulista.co.jp/',
    category: 'food',
    tier: 'secondary',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'weekly',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      'SWEETS／喫茶店・カフェの公式季節メニュー母数の補完。1911年創業、日本最古級の喫茶店。' +
      '公式サイト https://www.paulista.co.jp/ を WebFetch で実地確認（2026-09-11、お知らせ' +
      'セクションが実際に稼働・季節メニュー「和栗のキャラメルチーズケーキ」等を掲載していることを確認）。',
  },
  {
    id: 'ginza-kikunoya',
    name: '銀座菊廼舎',
    url: 'https://www.ginza-kikunoya.co.jp/',
    category: 'food',
    tier: 'secondary',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'weekly',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      'SWEETS（老舗和菓子・登録商標「冨貴寄」）母数の補完。江戸和菓子の老舗。公式サイト' +
      'https://www.ginza-kikunoya.co.jp/ を WebFetch で実地確認（2026-09-11、ニュース一覧' +
      'が実際に稼働していることを確認）。',
  },
  {
    id: 'ginza-kuya-sorairo',
    name: '空也（ぎんざ空也／空いろ）',
    url: 'https://www.sorairo-kuya.jp/',
    category: 'food',
    tier: 'secondary',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'high',
    crawlFrequency: 'weekly',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      'SWEETS（老舗和菓子・空也最中）母数の補完。1884年創業、1949年〜銀座並木通り。公式' +
      '通販サイト「空いろ」https://www.sorairo-kuya.jp/ を WebFetch で実地確認（2026-09-11、' +
      '「9月　催事出店のご案内」「8-10月　季節限定商品のご案内」等の日付つき告知を掲載していることを確認）。',
  },
  // ───────────────────────────────────────────────────────────────
  // 2026-09-12（3件以上の安定生成に向けた BEAUTY 母数の追加補完）。
  // ───────────────────────────────────────────────────────────────
  {
    id: 'ayura-ginza',
    name: 'AYURA GINZA',
    url: 'https://www.ayura.co.jp/',
    category: 'brand',
    tier: 'discovery',
    language: 'ja',
    sourceType: 'official_site',
    reliability: 'medium',
    crawlFrequency: 'weekly',
    enabled: true,
    lastCheckedAt: null,
    lastChangedAt: null,
    notes:
      'BEAUTY／WELLNESS 母数の補完。アイングループのスキンケアブランド「アユーラ」が' +
      '2019年に開いた銀座フラッグシップ（1階ショップ＋2階ホリスティックサロン、銀座5-8-13）。' +
      'SHISEIDO系列とは別会社で施設分散に資する。公式サイト https://www.ayura.co.jp/ を' +
      'WebFetchで実地確認（2026-09-12。個別お知らせページ /news/215/ の実在は確認したが、' +
      '一覧ページの正確なURL構造〈/topics/news/ 等の候補あり〉までは確認できていないため' +
      'tier=discovery＝自動発見に委ねる）。',
  },
]
