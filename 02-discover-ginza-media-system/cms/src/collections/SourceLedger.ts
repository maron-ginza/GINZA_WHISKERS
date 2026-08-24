import type { CollectionConfig } from 'payload'

import {
  crawlSourceLedgerEndpoint,
  generateSourceCandidatesEndpoint,
} from '../endpoints/crawlSourceLedger'
import {
  SOURCE_LEDGER_CATEGORIES,
  SOURCE_LEDGER_CATEGORY_LABELS,
  SOURCE_LEDGER_CRAWL_FREQUENCIES,
  SOURCE_LEDGER_CRAWL_FREQUENCY_LABELS,
  SOURCE_LEDGER_LANGUAGES,
  SOURCE_LEDGER_LANGUAGE_LABELS,
  SOURCE_LEDGER_RELIABILITY_LEVELS,
  SOURCE_LEDGER_RELIABILITY_LABELS,
  SOURCE_LEDGER_SOURCE_TYPES,
  SOURCE_LEDGER_SOURCE_TYPE_LABELS,
  SOURCE_LEDGER_TIERS,
  SOURCE_LEDGER_TIER_LABELS,
} from '../lib/sourceLedger/types'

function toOptions<T extends string>(values: readonly T[], labels: Record<T, string>) {
  return values.map((value) => ({ label: labels[value], value }))
}

// SOURCE LEDGER v1（2026-08-15）。毎朝AIが「旬の銀座」を自動収集するための情報源台帳。
// 将来の自動巡回ジョブ（enabledな情報源を巡回しlastCheckedAtを更新）・差分検知ジョブ
// （変化を検知しlastChangedAtを更新）・Morning Board・GINZA Conciergeが参照する基盤データ。
//
// 既存の`Sources`コレクション（記事化のために人間/AIが集めた個別コンテンツ片、Sources.ts）
// とは目的が異なる——あちらは「集めた情報そのもの」、こちらは「どこを巡回対象にするか」の
// マスタ台帳。両者の関係（例：SourceLedgerの巡回結果からSourcesを自動生成するか）はv1では
// 未設計（CLAUDE.md未決事項として記録）。
//
// 初期データの正本はgit管理の`cms/src/lib/sourceLedger/seedData.ts`。このコレクションは
// `seedSourceLedger.ts`で投入した運用状態（enabled切替・巡回結果）を持つ実行時ストア。
export const SourceLedger: CollectionConfig = {
  slug: 'source-ledger',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['tier', 'category', 'name', 'enabled', 'crawlFrequency', 'lastCheckedAt'],
    description:
      '情報源台帳（SOURCE LEDGER）。将来の自動巡回・差分検知の対象となる情報源を管理する。' +
      'urlが未確定の情報源はenabledをfalseのままにすること（beforeValidateで強制）。',
  },
  access: {
    // 機密性のないメタデータであり、将来の巡回ワーカー・GINZA Conciergeからの読み取りも
    // 想定するため、Tags/ImageAssetsと同様の方針で匿名読み取りを許可する。
    read: () => true,
  },
  // POST /api/source-ledger/crawl・/api/source-ledger/generate-candidates。
  // コレクション自身のendpointsとして登録する理由はcrawlSourceLedger.tsのコメント参照
  // （ルートconfig.endpointsに置くとPayloadのルーティングでこのコレクションのslugと
  // 衝突し、常に404になるため）。
  endpoints: [crawlSourceLedgerEndpoint, generateSourceCandidatesEndpoint],
  fields: [
    {
      name: 'sourceId',
      label: 'Source ID',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description:
          '安定した英数字ID（kebab-case）。Payloadの内部id（DB自動採番）とは別に、環境をまたいだ' +
          'seedスクリプトの冪等性判定・将来の巡回ジョブからの参照キーとして使う。',
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'url',
      type: 'text',
      admin: {
        description:
          '未確定の場合は空欄のままにし、notesにTODO理由を記載してenabledをfalseにすること。',
      },
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      options: toOptions(SOURCE_LEDGER_CATEGORIES, SOURCE_LEDGER_CATEGORY_LABELS),
    },
    {
      name: 'tier',
      type: 'select',
      required: true,
      defaultValue: 'discovery',
      options: toOptions(SOURCE_LEDGER_TIERS, SOURCE_LEDGER_TIER_LABELS),
    },
    {
      name: 'language',
      type: 'select',
      required: true,
      defaultValue: 'ja',
      options: toOptions(SOURCE_LEDGER_LANGUAGES, SOURCE_LEDGER_LANGUAGE_LABELS),
    },
    {
      name: 'sourceType',
      type: 'select',
      required: true,
      defaultValue: 'official_site',
      options: toOptions(SOURCE_LEDGER_SOURCE_TYPES, SOURCE_LEDGER_SOURCE_TYPE_LABELS),
    },
    {
      name: 'reliability',
      type: 'select',
      required: true,
      defaultValue: 'medium',
      options: toOptions(SOURCE_LEDGER_RELIABILITY_LEVELS, SOURCE_LEDGER_RELIABILITY_LABELS),
    },
    {
      name: 'crawlFrequency',
      type: 'select',
      required: true,
      defaultValue: 'weekly',
      options: toOptions(SOURCE_LEDGER_CRAWL_FREQUENCIES, SOURCE_LEDGER_CRAWL_FREQUENCY_LABELS),
    },
    {
      name: 'enabled',
      type: 'checkbox',
      required: true,
      defaultValue: false,
      admin: {
        description: 'trueにするには有効なurl（http(s)://始まり）が必要（beforeValidateで強制）。',
      },
    },
    {
      name: 'lastCheckedAt',
      label: '最終巡回日時',
      type: 'date',
      admin: {
        description: '将来の自動巡回ジョブが書き込む想定のフィールド。v1時点では手動更新しない。',
      },
    },
    {
      name: 'lastChangedAt',
      label: '最終差分検知日時',
      type: 'date',
      admin: {
        description: '将来の差分検知ジョブが書き込む想定のフィールド。v1時点では手動更新しない。',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
    },
    {
      name: 'listingPageOverrides',
      label: '一覧ページ 手動指定（Source Coverage拡張、2026-08-17）',
      type: 'array',
      admin: {
        description:
          'NEWS/EVENT/EXHIBITION等の一覧ページは通常トップページから自動発見される' +
          '（discoverListingPages.ts）。自動発見が失敗する・別のページを優先させたい等、' +
          'サイト固有の事情がある場合のみここに手動でURLを追加する（拡張ポイント）。' +
          '自動発見された候補を置き換えるのではなく、追加分として合算される。',
      },
      fields: [{ name: 'url', type: 'text', required: true }],
    },
    {
      name: 'discoveredListingPages',
      label: '自動発見済み一覧ページ（直近の巡回結果、参考情報）',
      type: 'json',
      admin: {
        readOnly: true,
        description:
          '直近の巡回でトップページから自動発見された一覧ページ候補（url/anchorText/' +
          'matchedKeyword）。実際に巡回対象となったのはこのうち一部（1サイトあたりの' +
          '上限あり、runCrawl.tsのlistingPagesPerSiteBudget）。監査・目視確認用。',
      },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data?.enabled && !/^https?:\/\//.test(data?.url ?? '')) {
          throw new Error(
            'enabledをtrueにするには、http(s)://で始まる有効なurlが必要です' +
              '（未確定の情報源はurlを空欄にしdisabledのままにしてください）',
          )
        }
        return data
      },
    ],
  },
  timestamps: true,
}
