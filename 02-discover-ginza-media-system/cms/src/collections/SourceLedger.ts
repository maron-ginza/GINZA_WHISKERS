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
  SOURCE_LEDGER_VENUE_KINDS,
  SOURCE_LEDGER_VENUE_KIND_LABELS,
  SOURCE_LEDGER_EXTRACTION_METHODS,
  SOURCE_LEDGER_EXTRACTION_METHOD_LABELS,
} from '../lib/sourceLedger/types'
import { ARTICLE_18_CATEGORIES, ARTICLE_18_CATEGORY_LABELS } from '../lib/pipeline/articleCategories'

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
      name: 'venueKind',
      label: '種別（2026-09-17新設）',
      type: 'select',
      defaultValue: 'other',
      options: toOptions(SOURCE_LEDGER_VENUE_KINDS, SOURCE_LEDGER_VENUE_KIND_LABELS),
      admin: {
        description: '百貨店・デパ地下と個別店舗・ブランドを同じ台帳で管理するための種別。既存18カテゴリーの収集元を削除・縮小する目的では使わない。',
      },
    },
    {
      name: 'parentFacilityLabel',
      label: '親施設（2026-09-17新設）',
      type: 'text',
      admin: {
        description: '複合施設のテナント店舗である場合の親施設名（例：GINZA SIX内テナント→「GINZA SIX」）。単独路面店舗は空欄のままでよい（推測で埋めない）。',
      },
    },
    {
      name: 'article18Categories',
      label: '対応カテゴリー（2026-09-17新設・ヒントのみ）',
      type: 'select',
      hasMany: true,
      options: toOptions(ARTICLE_18_CATEGORIES, ARTICLE_18_CATEGORY_LABELS),
      admin: {
        description:
          'この情報源が典型的にどの18カテゴリーの候補を生むかのヒント（任意・複数可）。' +
          '実際の分類はderiveProvisionalCategoryが候補ごとの明記語から行う——この値で' +
          '分類を上書き・強制しない（分類不能な候補を無理にここへ寄せない）。',
      },
    },
    {
      name: 'extractionMethod',
      label: '抽出方式（2026-09-17新設）',
      type: 'select',
      defaultValue: 'generic_html',
      options: toOptions(SOURCE_LEDGER_EXTRACTION_METHODS, SOURCE_LEDGER_EXTRACTION_METHOD_LABELS),
      admin: {
        description:
          '6時収集がこの情報源をどの取得経路で処理するか。店舗追加のたびに朝処理へ' +
          '専用コードを継ぎ足さず、ページ構造が異なる場合だけこの値でアダプターを' +
          '切り替える（collectAll.ts参照）。generic_html以外はrunSourceLedgerCrawlの' +
          '対象から除外され、二重取得を防ぐ。',
      },
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
      name: 'healthStatus',
      label: 'ソースヘルス（2026-09-14新設）',
      type: 'select',
      defaultValue: 'unknown',
      options: [
        { label: '未確認', value: 'unknown' },
        { label: '正常', value: 'ok' },
        { label: '取得不能', value: 'unreachable' },
      ],
      admin: {
        description:
          '【2026-09-17改訂】直近の取得試行が成功したかを記録する。取得不能な情報源から' +
          '候補を生成しない（推測で埋めない）ためのゲートとして呼び出し元が参照・更新する。' +
          '2026-09-17より、通常HTML取得（generic_html）の情報源もrunSourceLedgerCrawlが' +
          '巡回のたびにここへ書き込む（従来は松屋銀座・銀座三越等の専用経路のみだったが、' +
          '「該当情報0件」と「収集元へ到達できず確認不能」を全収集元で一律に区別するため統一した）。',
      },
    },
    {
      name: 'healthCheckedAt',
      label: 'ソースヘルス確認日時',
      type: 'date',
      admin: { readOnly: true },
    },
    {
      name: 'healthNote',
      label: 'ソースヘルス詳細（試行した経路・失敗理由）',
      type: 'textarea',
      admin: { readOnly: true },
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
