// SOURCE LEDGER v1（2026-08-15）
//
// 毎朝AIが「旬の銀座」を自動収集するための情報源台帳の型定義。
// 将来の自動巡回・差分検知・Morning Board・GINZA Conciergeが参照する基盤データであり、
// 既存の`Sources`コレクション（記事化のために人間/AIが収集した個別コンテンツ片）とは
// 別軸——こちらは「どこを巡回対象にするか」というマスタ台帳。
//
// Payloadに依存しない純粋な型定義。seedデータ（seedData.ts）・Payloadコレクション定義
// （collections/SourceLedger.ts）・CLIステータス表示の3箇所から共有する。

export const SOURCE_LEDGER_CATEGORIES = [
  'ginza_general',
  'department_store',
  'commercial',
  'art_culture',
  'food',
  'hotel',
  'brand',
  'public_tourism',
  'transport',
  'news_media',
  'global',
] as const
export type SourceLedgerCategory = (typeof SOURCE_LEDGER_CATEGORIES)[number]

export const SOURCE_LEDGER_CATEGORY_LABELS: Record<SourceLedgerCategory, string> = {
  ginza_general: '銀座総合',
  department_store: '百貨店',
  commercial: '商業施設',
  art_culture: 'アート・文化',
  food: '飲食',
  hotel: 'ホテル',
  brand: 'ブランド',
  public_tourism: '公共・観光',
  transport: '交通',
  news_media: 'ニュース・メディア',
  global: '海外・グローバル',
}

export const SOURCE_LEDGER_TIERS = ['core', 'primary', 'secondary', 'discovery'] as const
export type SourceLedgerTier = (typeof SOURCE_LEDGER_TIERS)[number]

export const SOURCE_LEDGER_TIER_LABELS: Record<SourceLedgerTier, string> = {
  core: 'Core（最重要・毎日巡回）',
  primary: 'Primary（主要）',
  secondary: 'Secondary（準主要）',
  discovery: 'Discovery（発見・調査中）',
}

export const SOURCE_LEDGER_LANGUAGES = ['ja', 'en', 'ja_en'] as const
export type SourceLedgerLanguage = (typeof SOURCE_LEDGER_LANGUAGES)[number]

export const SOURCE_LEDGER_LANGUAGE_LABELS: Record<SourceLedgerLanguage, string> = {
  ja: '日本語',
  en: '英語',
  ja_en: '日英バイリンガル',
}

export const SOURCE_LEDGER_SOURCE_TYPES = [
  'official_site',
  'news_media',
  'sns',
  'rss',
  'government',
  'other',
] as const
export type SourceLedgerSourceType = (typeof SOURCE_LEDGER_SOURCE_TYPES)[number]

export const SOURCE_LEDGER_SOURCE_TYPE_LABELS: Record<SourceLedgerSourceType, string> = {
  official_site: '公式サイト',
  news_media: 'ニュース・メディア',
  sns: 'SNS公式アカウント',
  rss: 'RSSフィード',
  government: '行政・公的機関',
  other: 'その他',
}

export const SOURCE_LEDGER_RELIABILITY_LEVELS = ['high', 'medium', 'low'] as const
export type SourceLedgerReliability = (typeof SOURCE_LEDGER_RELIABILITY_LEVELS)[number]

export const SOURCE_LEDGER_RELIABILITY_LABELS: Record<SourceLedgerReliability, string> = {
  high: '高（一次情報・公式）',
  medium: '中（二次情報・要確認）',
  low: '低（未検証）',
}

export const SOURCE_LEDGER_CRAWL_FREQUENCIES = ['daily', 'weekly', 'monthly', 'manual'] as const
export type SourceLedgerCrawlFrequency = (typeof SOURCE_LEDGER_CRAWL_FREQUENCIES)[number]

export const SOURCE_LEDGER_CRAWL_FREQUENCY_LABELS: Record<SourceLedgerCrawlFrequency, string> = {
  daily: '毎日',
  weekly: '週次',
  monthly: '月次',
  manual: '手動のみ',
}

export interface SourceLedgerEntry {
  /**
   * 安定した英数字ID（kebab-case）。Payload側では一意な`sourceId`フィールドとして保持する
   * （Payloadの内部`id`は自動採番のDB主キーのため、環境をまたいだseedの冪等性判定や
   * 将来の巡回ジョブからの参照キーには、こちらの安定IDを使う）。
   */
  id: string
  name: string
  /** 未確定の場合はnull。nullの場合はenabled:falseとし、notesにTODO理由を残すこと。 */
  url: string | null
  category: SourceLedgerCategory
  tier: SourceLedgerTier
  language: SourceLedgerLanguage
  sourceType: SourceLedgerSourceType
  reliability: SourceLedgerReliability
  crawlFrequency: SourceLedgerCrawlFrequency
  enabled: boolean
  /** 将来の自動巡回ジョブが書き込む想定。v1時点では常にnull。 */
  lastCheckedAt: string | null
  /** 将来の差分検知ジョブが書き込む想定。v1時点では常にnull。 */
  lastChangedAt: string | null
  notes: string
}
