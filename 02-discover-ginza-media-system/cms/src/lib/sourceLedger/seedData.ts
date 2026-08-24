import type { SourceLedgerEntry } from './types'

// SOURCE LEDGER v1（2026-08-15）初期Core Source候補。
//
// 全14件、CLAUDE.md記載の初期Core Source候補と一致させている。urlはすべてWebSearchで
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
      '三越伊勢丹公式の店舗情報ドメイン(mistore.jp)を正とした。2026-08-15 WebSearchで確認。',
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
      '直接リンクとして現れタイトルが一致したmatsuyaginza.comを採用。2026-08-15 WebSearchで確認。',
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
]
