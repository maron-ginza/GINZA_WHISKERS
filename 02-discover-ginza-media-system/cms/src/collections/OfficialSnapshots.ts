import type { CollectionConfig } from 'payload'

// GINZA WHISKERS / Project 02（2026-09-03、自動制作パイプライン step 2）
//
// マロンがテーマを承認したあと、公式ページから取得した本文を「取得した時点の
// スナップショット」として保存する。裏取り・確認日の根拠・再現性のため。
//
// 【マロン承認（2026-09-03）】
//   ・保存項目：sourceUrl / sourceName / capturedAt / verifiedAt / contentHash /
//     rawSnapshot（取得本文テキスト）/ normalizedFacts（決定的抽出の結果）
//   ・原則 **追記型**（既存行の書き換えをしない）
//   ・同一内容は contentHash で重複保存しない
//   ・既存 ArticleFacts / DiscoveredContent との関連を保持する
//
// 生 HTML は保存しない（タグ除去済み本文のみ・上限あり）。認証情報・Cookie は
// 取得側（fetchOfficialSignals）で送らない。
export const OfficialSnapshots: CollectionConfig = {
  slug: 'official-snapshots',
  admin: {
    useAsTitle: 'sourceName',
    defaultColumns: ['sourceName', 'sourceUrl', 'capturedAt', 'contentHash'],
    description:
      'テーマ承認後に取得した公式ページ本文のスナップショット。追記型・contentHash 重複排除。' +
      '生 HTML は保存せず、タグ除去済み本文（上限あり）と決定的抽出結果のみ保持する。',
  },
  access: {
    // 匿名は不可。ログイン済み編集者・自動化スクリプト（overrideAccess）から作成/参照。
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: () => false, // 追記型：更新しない
    delete: ({ req }) => !!req.user,
  },
  fields: [
    {
      name: 'sourceUrl',
      type: 'text',
      required: true,
      index: true,
      admin: { description: '取得元の公式 URL（正規化前の入力どおり）' },
    },
    {
      name: 'sourceName',
      type: 'text',
      required: true,
      admin: { description: '情報源名（DiscoveredContent.sourceSite.name など）' },
    },
    {
      name: 'capturedAt',
      label: '取得日時',
      type: 'date',
      required: true,
      index: true,
      admin: { description: 'このスナップショットを取得した日時（fetch 実行時刻）' },
    },
    {
      name: 'verifiedAt',
      label: '確認日時',
      type: 'date',
      admin: {
        description:
          'この内容を「確認済み」とみなす日時。通常は capturedAt と同じ。記事の出典表示「確認 YYYY-MM-DD」に使う。',
      },
    },
    {
      name: 'contentHash',
      type: 'text',
      required: true,
      index: true,
      admin: {
        readOnly: true,
        description:
          '正規化済み本文の SHA-256（先頭16バイトを hex）。同一 sourceUrl で同じ contentHash の行は重複保存しない。',
      },
    },
    {
      name: 'httpStatus',
      type: 'number',
      admin: { description: 'HTTP ステータス（取得できた場合）' },
    },
    {
      name: 'rawSnapshot',
      label: '取得本文（タグ除去済み）',
      type: 'textarea',
      admin: {
        description: 'fetchOfficialSignals が返したタグ除去済み本文。生 HTML は保存しない。上限あり（既定 20,000 字）。',
      },
    },
    {
      name: 'normalizedFacts',
      label: '決定的抽出結果',
      type: 'json',
      admin: {
        description:
          'extractArticleFactsCandidate / extractOfficialEventFacts / extractProductNewsFacts の出力（confirmationStatus つき）。AI 非依存。',
      },
    },
    {
      name: 'articleFacts',
      label: '関連 ArticleFacts',
      type: 'relationship',
      relationTo: 'article-facts',
      index: true,
      admin: { description: 'このスナップショットの裏取り対象となった ArticleFacts' },
    },
    {
      name: 'discoveredContent',
      label: '関連 DiscoveredContent',
      type: 'relationship',
      relationTo: 'discovered-content',
      index: true,
    },
    {
      name: 'fetchNotes',
      type: 'textarea',
      admin: { readOnly: true, description: '取得時の注記（rejected 理由・タイムアウト・切り詰め等）' },
    },
  ],
}
