import type { CollectionConfig } from 'payload'

import {
  INTEREST_CONFIDENCE_LABELS,
  INTEREST_CONFIDENCE_VALUES,
  INTEREST_FRESHNESS_LABELS,
  INTEREST_FRESHNESS_VALUES,
  INTEREST_SOURCE_PLATFORM_LABELS,
  INTEREST_SOURCE_PLATFORMS,
  INTEREST_SOURCE_TYPE_LABELS,
  INTEREST_SOURCE_TYPES,
  INTEREST_THEME_STATUS_LABELS,
  INTEREST_THEME_STATUSES,
  OFFICIAL_CATEGORY_LABELS,
  OFFICIAL_CATEGORY_VALUES,
  type InterestThemeStatus,
} from '../lib/interestDiscovery/types'

function toOptions<T extends string>(values: readonly T[], labels: Record<T, string>) {
  return values.map((value) => ({ label: labels[value], value }))
}

const HUMAN_GATED_STATES: InterestThemeStatus[] = ['approved', 'rejected']

// Project 02-2 Phase A「Interest Discovery」最小実装（2026-08-27）。
//
// 【目的】note利用者が実際に何に関心を持っているかを示す公開情報（テーマ名・
// 順位・URL・取得日時）を、構造化データとして正しく取得・保存できるかを検証する
// 試験実装。今回対象とするのはnote.com/trend（サイト全体の急上昇タグ、上位5件）
// のみ——note_popular/note_official_topic/external_trendは将来のPriority 2・3
// 拡張用にスキーマのみ用意し、今回のスクリプトからは書き込まない。
//
// 【重要原則（マロン指示）】
// - noteの「人気」「急上昇」の内部判定基準（非公開）は推測・再現しない。
// - 取得できる公開情報そのものだけを事実として保存する——articleCount・
//   engagementSignal・monetizationScore・ginzaRelevance等、今回確認できて
//   いない・Phase A以降のスコープの項目は一切作らない。
// - Project 02-1（core→多角度記事生成）・既存Sources/DiscoveredContentの
//   スキーマ・フックには一切触れない、独立した並行コレクションとして追加する。
//
// 【永続化の単位】DiscoveredContentと異なり「1URL=1行の最新状態」ではなく、
// 「1回の観測=1行」の時系列ログとして扱う——同じテーマが別日に再上昇した場合、
// 新しい行として追加する（themeだけで永久重複排除しない、マロン指示）。
export const InterestThemes: CollectionConfig = {
  slug: 'interest-themes',
  admin: {
    useAsTitle: 'theme',
    defaultColumns: ['theme', 'sourceType', 'rankPosition', 'capturedAt', 'confidence', 'status'],
    description:
      'Project 02-2 Phase A「Interest Discovery」——note利用者の興味関心テーマの' +
      '観測ログ（1回の観測=1行）。今回はnote.com/trend（急上昇タグ上位5件）のみ取得。' +
      '取得ロジック：cms/src/lib/interestDiscovery/',
  },
  // 機密性のないメタデータであり、既存のDiscoveredContent/SourceLedger等と
  // 同じ方針で匿名読み取りを許可する。
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'theme',
      label: 'テーマ名',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'noteが表示している文字列そのまま（正規化は最小限）' },
    },
    {
      name: 'sourcePlatform',
      label: 'Source Platform',
      type: 'select',
      required: true,
      options: toOptions(INTEREST_SOURCE_PLATFORMS, INTEREST_SOURCE_PLATFORM_LABELS),
    },
    {
      name: 'sourceType',
      label: 'Source Type',
      type: 'select',
      required: true,
      index: true,
      options: toOptions(INTEREST_SOURCE_TYPES, INTEREST_SOURCE_TYPE_LABELS),
    },
    {
      name: 'sourceURL',
      label: 'Source URL',
      type: 'text',
      required: true,
      admin: { description: '取得元ページの正規URL（例：https://note.com/tag/...）' },
    },
    {
      name: 'capturedAt',
      label: '取得日時',
      type: 'date',
      required: true,
      index: true,
      admin: { readOnly: true, description: 'このテーマを観測した日時。サーバー側で自動設定（自己申告させない）' },
    },
    {
      name: 'rankPosition',
      label: '順位',
      type: 'number',
      min: 1,
      admin: {
        description:
          '取得元ページがnoteによって明示的に番号付けされている場合のみ設定（例：/trendの1〜5位）。' +
          '番号のない表示順（並び替えUIの結果順など）はここに入れない——推測混入防止',
      },
    },
    {
      name: 'articleCount',
      label: 'Article Count（ハッシュタグページ用）',
      type: 'number',
      min: 0,
      admin: {
        description:
          'note_hashtag_popularのみ設定——このtheme自身のハッシュタグページに表示される' +
          '総記事数（例：「337,601件」）をそのまま保存。取得できない場合は空欄のまま',
      },
    },
    {
      name: 'tagCount',
      label: 'Tag Count（関連タグ用）',
      type: 'number',
      min: 0,
      admin: {
        description:
          'note_hashtag_popularのみ設定——このthemeが別のハッシュタグページの' +
          '「関連タグ」欄に表示された際の件数（例：「#日記 (5,766,665)」の数字部分）を' +
          'そのまま保存。取得できない場合は空欄のまま',
      },
    },
    {
      name: 'freshness',
      label: 'Freshness',
      type: 'select',
      required: true,
      defaultValue: 'observed_now',
      options: toOptions(INTEREST_FRESHNESS_VALUES, INTEREST_FRESHNESS_LABELS),
      admin: {
        description:
          'v1は複数回取得の比較ロジック未実装のため簡易値のみ。継続観測が始まれば' +
          '「前回比変化」等へ拡張する（今回は作らない）',
      },
    },
    {
      name: 'confidence',
      label: 'Confidence',
      type: 'select',
      required: true,
      options: toOptions(INTEREST_CONFIDENCE_VALUES, INTEREST_CONFIDENCE_LABELS),
      admin: {
        description:
          'noteの内部基準の確からしさではなく、私たちの読み取りの確からしさを表す。' +
          '明示的な順位表示があればhigh、順序のみならmedium、間接推定を含む場合はlow',
      },
    },
    {
      name: 'startDate',
      label: '開始日（Priority 2用）',
      type: 'date',
      admin: {
        description:
          'note_official_topicのみ設定——RSSのpubDate（告知日）をそのまま使用する。' +
          'noteが明示的な募集開始日を別途公開しているわけではなく、告知日を開始日の' +
          'proxyとして扱っている点に注意（推測ではなく実際の告知日時そのもの）',
      },
    },
    {
      name: 'endDate',
      label: '終了日（Priority 2用）',
      type: 'date',
      admin: {
        description:
          '取得元ページ上で終了日が確認できた場合のみ設定。noteのお題／コンテスト' +
          '告知は終了日を明記しないことが多く、2026-08-27時点のnote_official_topic' +
          '取得ロジックでは一切設定していない（未確認のまま推測で埋めない）',
      },
    },
    {
      name: 'officialCategory',
      label: 'Official Category（Priority 2用）',
      type: 'select',
      options: toOptions(OFFICIAL_CATEGORY_VALUES, OFFICIAL_CATEGORY_LABELS),
      admin: {
        description:
          'タイトルに「コンテスト」「お題（企画）」のいずれかが明示的に含まれる場合のみ設定。' +
          'どちらも含まない場合は空欄のまま（推測しない）',
      },
    },
    {
      name: 'campaignType',
      label: 'Campaign Type（将来の情報源用、予約フィールド）',
      type: 'text',
      admin: {
        description:
          '現時点（2026-08-27、note_rising/note_official_topicいずれの取得ロジックからも）' +
          'この項目は一切設定されていない——将来、企業コラボ／note単独企画等の分類が' +
          'ページ上で確認できる情報源が追加された際のための予約フィールド',
      },
    },
    {
      name: 'status',
      label: "Maron Editor's Choice ステータス",
      type: 'select',
      required: true,
      defaultValue: 'inbox',
      options: toOptions(INTEREST_THEME_STATUSES, INTEREST_THEME_STATUS_LABELS),
      admin: {
        description: '「承認済み」「却下」への移行はログイン済みの人間のみ実行可（AI・自動化は取得・保存のみ）',
      },
    },
    {
      name: 'humanReviewed',
      label: '人間レビュー済み',
      type: 'checkbox',
      required: true,
      defaultValue: false,
      admin: { readOnly: true, description: 'statusがapproved/rejectedへ変更された時点で自動的にtrueになる（手動入力不可）' },
    },
  ],
  hooks: {
    // DiscoveredContent.tsと同じ人間ゲートパターン。人間ゲート判定に使うのは
    // statusのみのため、editorial（Sources.ts）ほど複雑なマージ処理は不要。
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        const prevStatus: InterestThemeStatus | undefined = originalDoc?.status
        const nextStatus: InterestThemeStatus | undefined = data.status ?? prevStatus

        const isEnteringHumanGate =
          !!nextStatus && nextStatus !== prevStatus && HUMAN_GATED_STATES.includes(nextStatus)

        if (isEnteringHumanGate) {
          if (!req.user) {
            throw new Error(
              `statusを「${nextStatus}」に変更するには、ログイン済みの人間による操作が必要です（AI・自動化スクリプトからの直接遷移は不可）`,
            )
          }
          data.humanReviewed = true
        }

        return data
      },
    ],
  },
  timestamps: true,
}
