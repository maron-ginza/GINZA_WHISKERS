import type { CollectionConfig } from 'payload'

import { DIFF_STATUSES, DIFF_STATUS_LABELS } from '../lib/crawler/diff'

// SOURCE LEDGER 自動巡回（2026-08-16）：SourceLedger（cms/src/collections/SourceLedger.ts）の
// enabledな情報源を実際にHTTP取得した結果を1回の巡回＝1件として記録する実行ログ。
// SourceLedger.lastCheckedAt/lastChangedAt（v1時点では「将来の自動巡回ジョブが書き込む想定」
// とだけコメントされていたフィールド）を実際に書き込むのはこのコレクションを生成する
// runCrawl.ts（cms/src/lib/crawler/runCrawl.ts）。
//
// 生HTML全文は保存しない——contentHash（差分判定用）とtitle/excerpt（将来の
// 「旬の銀座候補抽出」に使う軽量テキスト、上限あり）のみを保持する。
export const SourceSnapshots: CollectionConfig = {
  slug: 'source-snapshots',
  admin: {
    useAsTitle: 'sourceName',
    defaultColumns: ['sourceName', 'fetchedAt', 'diffStatus', 'httpStatus', 'success'],
    description:
      'SOURCE LEDGER自動巡回の実行ログ。1回のHTTP取得＝1件。生HTML全文は保存せず、' +
      'contentHash・簡易テキスト抜粋（上限あり）のみ保持する。',
  },
  fields: [
    {
      name: 'sourceLedger',
      label: 'Source Ledger',
      type: 'relationship',
      relationTo: 'source-ledger',
      required: true,
      index: true,
    },
    {
      name: 'sourceId',
      label: 'Source ID（巡回時点）',
      type: 'text',
      required: true,
      index: true,
      admin: {
        readOnly: true,
        description:
          '巡回実行時点のSourceLedger.sourceIdのコピー。集計・冪等diff判定を' +
          'relationshipの解決なしに行うための非正規化フィールド。',
      },
    },
    {
      name: 'sourceName',
      label: '情報源名（巡回時点）',
      type: 'text',
      required: true,
      admin: { readOnly: true },
    },
    {
      name: 'url',
      type: 'text',
      required: true,
      admin: { description: '巡回時点でSourceLedgerに設定されていたURL' },
    },
    {
      name: 'fetchedAt',
      label: '取得日時',
      type: 'date',
      required: true,
    },
    {
      name: 'httpStatus',
      label: 'HTTPステータス',
      type: 'number',
    },
    {
      name: 'success',
      label: '取得成功',
      type: 'checkbox',
      required: true,
      defaultValue: false,
    },
    {
      name: 'contentHash',
      label: 'Content Hash (SHA-256, 生バイト列)',
      type: 'text',
      index: true,
      admin: {
        description:
          'レスポンス本文（生バイト列）そのもののSHA-256。完全一致の検証用の参考値であり、' +
          '差分ステータス(diffStatus)の判定には使用しない（並び替え等のノイズに弱いため。' +
          '判定にはnormalizedContentHashを使用）。',
      },
    },
    {
      name: 'normalizedContentHash',
      label: 'Normalized Content Hash (SHA-256, 正規化後)',
      type: 'text',
      index: true,
      admin: {
        description:
          '汎用HTML正規化（script/style除去→ブロック分割→href/src/alt/title等の抽出→' +
          'ソート→結合）後のテキストのSHA-256。要素の並び替え（回転バナー等）に対して' +
          '不変になるよう設計しており、diffStatusの判定はこちらを使用する。' +
          '2026-08-16より前のSnapshotにはこのフィールドが存在しない（値なし）。',
      },
    },
    {
      name: 'contentLength',
      label: 'Content Length (bytes)',
      type: 'number',
    },
    {
      name: 'contentType',
      label: 'Content-Type',
      type: 'text',
    },
    {
      name: 'title',
      type: 'text',
      maxLength: 400,
      admin: { description: '<title>から抽出（ベストエフォート、UTF-8前提）' },
    },
    {
      name: 'excerpt',
      type: 'textarea',
      maxLength: 2100,
      admin: {
        description:
          'タグ除去・空白正規化後のテキストを先頭2000文字までに切り詰めたもの。' +
          '生HTML全文は保存しない（将来の候補抽出のための軽量な下書き素材）。',
      },
    },
    {
      name: 'errorMessage',
      type: 'text',
      admin: { description: '取得失敗時のエラー内容（タイムアウト・HTTPエラー・サイズ超過・robots.txt禁止等）' },
    },
    {
      name: 'blockedByRobots',
      label: 'robots.txtにより禁止',
      type: 'checkbox',
      required: true,
      defaultValue: false,
      admin: {
        description:
          'trueの場合、robots.txtのDisallowルールにより実際のHTTPリクエストを送信せずスキップした' +
          '（2026-08-16追加、cms/src/lib/crawler/robotsTxt.ts）。',
      },
    },
    {
      name: 'attemptCount',
      label: '試行回数',
      type: 'number',
      admin: {
        description:
          'タイムアウト・5xx等の一時的エラーに対する限定リトライ（最大2回）を含む実際の試行回数' +
          '（2026-08-16追加）。403等の意図的アクセス拒否・robots.txt禁止時はリトライしない。',
      },
    },
    {
      name: 'diffStatus',
      label: '差分ステータス',
      type: 'select',
      required: true,
      options: DIFF_STATUSES.map((value) => ({ label: DIFF_STATUS_LABELS[value], value })),
      admin: {
        description:
          'unchanged=前回成功時から変化なし / changed=変化あり / first_seen=' +
          'この情報源の初回成功取得 / fetch_error=今回の取得が失敗',
      },
    },
    {
      name: 'previousSnapshot',
      label: '比較対象Snapshot',
      type: 'relationship',
      relationTo: 'source-snapshots',
      admin: {
        readOnly: true,
        description:
          'diffStatus判定の比較対象にした、直近で取得に成功したSnapshot（なければ空欄=初回）。',
      },
    },
  ],
  // 機密性のない巡回ログであり、かつ自動巡回ジョブ（人間ユーザーなしで動く想定）が
  // 書き込む主体になるため、SourceLedgerと同様に匿名読み取りを許可する。書き込みは
  // Payload標準の認証必須デフォルトのまま（Local API経由はoverrideAccess:trueで実行）。
  access: {
    read: () => true,
  },
  timestamps: true,
}
