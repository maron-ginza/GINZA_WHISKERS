// GINZA WHISKERS / Project 02 — CROSS CULTURE：情報源の市場視点カテゴリ（2026-09-04 v2）
//
// SOURCE LEDGER（cms/src/lib/sourceLedger/seedData.ts）の **構造・スキーマは一切変えず**、
// 「この情報源は、どの市場視点（UAE / France 等）の文化判定に使える情報源か」を
// 外付けのマッピングとして定義する。UAE / France は現行の情報源タイトルだけでは
// 語彙が出にくいため、**すでに巡回対象（enabled・無料・公開・信頼できる）**の情報源に
// 市場視点カテゴリを与えて、判定の二次シグナルにする。
//
// 【重要な安全設計】
//   ・情報源の affinity だけでは市場を「派生候補」にしない。
//     本文語彙で **その軸が最低1回ヒットしている場合にのみ** 小さく加点する
//     （= 情報源は「そのシグナルの信頼度を上げる」だけ・ゼロから作らない）。
//   ・取得不能な新規ソースは足さない。ここに書くのは既存 SOURCE LEDGER の id のみ。
//   ・UAE の luxury-hospitality / members-only 専門ソースは現行台帳に存在しない。
//     和光・SEIKO HOUSE・資生堂パーラーの quiet-luxury / craftsmanship / high-end
//     dining 面を UAE 軸へ寄せて補うに留める（§UAE_GAP 参照）。

import { activeMarkets } from './marketAxes'

/** SOURCE LEDGER の id（seedData.ts の `id`）→ その情報源が信頼できるレンズになる市場×軸 */
export interface SourceAffinityEntry {
  /** SOURCE LEDGER seedData.ts の安定 id */
  sourceId: string
  /** 情報源名（照合フォールバック用。seedData.ts の name と一致させる） */
  name: string
  /** ドメイン（sourceUrl からの照合フォールバック用） */
  hosts: string[]
  /** 市場名 → その市場で信頼できる軸キー（marketAxes.ts の axis.key と一致） */
  markets: Partial<Record<string, string[]>>
  /** なぜこの情報源がその視点に使えるか（監査用・一次情報の性格） */
  rationale: string
}

// UAE_GAP:
//   専用の「luxury hospitality / members-only experience」情報源（ホテル公式ニュース等）は
//   現行 SOURCE LEDGER に無い。公開・無料で巡回可能な個別記事一覧を確認できるものが
//   見つかった時点で seedData.ts へ追加し、ここに markets:{ UAE: [...] } を足す。
//   今回は推測でホテルソースを追加しない（「取得不能なソースを無理に追加しない」）。

export const SOURCE_AFFINITY: SourceAffinityEntry[] = [
  {
    sourceId: 'wako-ginza',
    name: '和光',
    hosts: ['wako.co.jp'],
    markets: {
      UAE: ['Quiet Luxury', 'Craft'],
      France: ['Heritage', 'Culture'],
      Italy: ['Design', 'Craft'],
    },
    rationale:
      '銀座のランドマーク（時計塔＝近代建築・歴史）。ハイジュエリー／別誂え＝quiet luxury・craftsmanship。公式サイト・一次情報。',
  },
  {
    sourceId: 'seiko-house-ginza',
    name: 'SEIKO HOUSE GINZA',
    hosts: ['seiko.co.jp'],
    markets: {
      UAE: ['Quiet Luxury'],
      France: ['Heritage'],
      Italy: ['Design', 'Material', 'Craft'],
    },
    rationale: '時計塔の歴史・近代建築、時計製造の職人技（craftsmanship / material / design）。公式・一次情報。',
  },
  {
    sourceId: 'shiseido-gallery',
    name: '資生堂ギャラリー',
    hosts: ['gallery.shiseido.com', 'shiseido.com'],
    markets: {
      France: ['Culture', 'Heritage'],
      'United States': ['Story', 'Specialist Culture'],
    },
    rationale: '現存する日本最古の画廊（1919〜）。現代美術の企画展＝culture / heritage。公式・一次情報。',
  },
  {
    sourceId: 'shiseido-parlour-ginza',
    name: '資生堂パーラー',
    hosts: ['parlour.shiseido.co.jp'],
    markets: {
      UAE: ['Quiet Luxury'],
      France: ['Heritage', 'Culture'],
      'United States': ['Story', 'Experience'],
    },
    rationale: '1902 年創業の銀座の洋食・菓子（gastronomy × heritage）。高級ダイニングの歴史。公式ニュースリリース。',
  },
  {
    sourceId: 'ginza-motoji',
    name: '銀座もとじ',
    hosts: ['motoji.co.jp'],
    markets: {
      Singapore: ['Craft', 'Authenticity'],
      Italy: ['Craft', 'Material', 'Cultural Exchange'],
      France: ['Heritage', 'Culture'],
    },
    rationale: '染織・きものの専門店。作家との協働、産地・技法（craft / material）、和の伝統。公式イベントページ。',
  },
  {
    sourceId: 'kabukiza',
    name: '歌舞伎座',
    hosts: ['kabuki-za.co.jp', 'kabuki-bito.jp'],
    markets: {
      France: ['Heritage', 'Culture'],
      'United States': ['Story', 'Specialist Culture'],
    },
    rationale: '歌舞伎の劇場（隈研吾設計の現建築＝tradition × contemporary、日本文化の解釈）。公式・一次情報。',
  },
  {
    sourceId: 'aida-mitsuo-museum',
    name: '相田みつを美術館',
    hosts: ['mitsuo.co.jp'],
    markets: {
      France: ['Culture'],
      'United States': ['Story'],
    },
    rationale: '書家・詩人の個人美術館。日本語・書の文化の解釈。公式ニュース。',
  },
  {
    sourceId: 'kyobunkwan-ginza',
    name: '教文館',
    hosts: ['kyobunkwan.co.jp'],
    markets: {
      France: ['Culture', 'Heritage'],
    },
    rationale: '1885 年創業の書店・出版（銀座の文化史）。公式イベント／ニュース一覧。',
  },
  {
    sourceId: 'gekkoso-ginza',
    name: '月光荘画材店',
    hosts: ['gekkoso.jp'],
    markets: {
      France: ['Heritage', 'Culture'],
      Italy: ['Material', 'Craft'],
      Singapore: ['Craft'],
    },
    rationale: '1917 年創業の画材店（自社製造の絵具・紙＝material / craft、銀座の芸術史）。公式ニュース。',
  },
  {
    sourceId: 'chuo-city-tourism',
    name: '中央区観光関連',
    hosts: ['chuo-kanko.or.jp', 'chuo-city.tokyo'],
    markets: {
      France: ['Heritage', 'Culture'],
    },
    rationale: '中央区観光協会（銀座・京橋・日本橋の歴史・史跡・年中行事）。行政系・公開。',
  },
  {
    sourceId: 'ginza-tsutaya-books',
    name: '銀座 蔦屋書店',
    hosts: ['store.tsite.jp', 'tsite.jp'],
    markets: {
      'United States': ['Specialist Culture', 'Story'],
      France: ['Culture'],
    },
    rationale: 'アート書・専門書に強い書店。作家個展・トーク＝specialist culture / story。公式イベントページ。',
  },
  {
    sourceId: 'pola-museum-annex',
    name: 'POLA MUSEUM ANNEX',
    hosts: ['po-holdings.co.jp'],
    markets: {
      France: ['Culture'],
      'United States': ['Story'],
    },
    rationale: '現代美術の無料企画展スペース。公式・一次情報。',
  },
]

const BY_ID = new Map(SOURCE_AFFINITY.map((e) => [e.sourceId.toLowerCase(), e]))

/** sourceName / sourceUrl から affinity エントリを引く（id 一致 → name 一致 → host 一致） */
export function lookupSourceAffinity(
  sourceName?: string | null,
  sourceUrl?: string | null,
): SourceAffinityEntry | null {
  const name = (sourceName ?? '').trim()
  const url = (sourceUrl ?? '').trim().toLowerCase()
  if (name) {
    const byName = SOURCE_AFFINITY.find((e) => e.name === name)
    if (byName) return byName
  }
  if (url) {
    const byHost = SOURCE_AFFINITY.find((e) => e.hosts.some((h) => url.includes(h)))
    if (byHost) return byHost
  }
  if (name) {
    const idGuess = BY_ID.get(name.toLowerCase().replace(/\s+/g, '-'))
    if (idGuess) return idGuess
  }
  return null
}

/**
 * 情報源 affinity による軸ボーナス（市場名 → 軸キー → 加点）。
 * **ヒット済みの軸にしか効かない**運用は呼び出し側（crossCultureFilter）で担保する。
 */
export function sourceAxisBonuses(
  sourceName?: string | null,
  sourceUrl?: string | null,
): { entry: SourceAffinityEntry | null; perMarketAxis: Map<string, Set<string>> } {
  const entry = lookupSourceAffinity(sourceName, sourceUrl)
  const perMarketAxis = new Map<string, Set<string>>()
  if (!entry) return { entry, perMarketAxis }
  const known = new Set(activeMarkets().map((m) => m.market))
  for (const [market, axes] of Object.entries(entry.markets)) {
    if (!known.has(market) || !axes) continue
    perMarketAxis.set(market, new Set(axes))
  }
  return { entry, perMarketAxis }
}
