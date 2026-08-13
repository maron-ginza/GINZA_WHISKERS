import type { CollectionConfig } from 'payload'

// CONTENT_MODEL.md 3節。Phase 1は人間による手動登録が前提（自動収集はPhase 3）。
//
// 編集パイプライン（情報収集→AI整理・評価→Editor's Choice候補→人間の最終承認→公開）の
// 状態管理。`status`（untouched/in_progress/used、既存）は「この情報源が記事化に使われたか」
// という別軸の管理であり、意味が異なるため温存し重複定義はしない。新設の`editorial`グループが
// このソースが編集パイプライン上どこにいるかを表す正本となる。
const EDITORIAL_STATES = [
  { label: '受信箱 (Inbox)', value: 'inbox' },
  { label: 'レビュー中 (Review)', value: 'review' },
  { label: "Editor's Choice候補", value: 'editors-choice' },
  { label: '承認済み (Approved)', value: 'approved' },
  { label: '公開済み (Published)', value: 'published' },
  { label: '却下 (Rejected)', value: 'rejected' },
] as const

type EditorialState = (typeof EDITORIAL_STATES)[number]['value']

// Phase 14（2026-08-10）：AIはevaluateSourceById経由でinbox→review／
// editors-choiceまでしか動かさない設計のため、approved/publishedに加えて
// rejected（却下の最終確定）も人間ゲート対象にする。AIの役割は評価・候補
// 提示までであり、否定的な最終判断（却下の確定）も人間のみが行う。
const HUMAN_GATED_STATES: EditorialState[] = ['approved', 'published', 'rejected']

export const Sources: CollectionConfig = {
  slug: 'sources',
  admin: {
    useAsTitle: 'contentRef',
    defaultColumns: ['type', 'editorial.editorialStatus', 'status', 'contentRef', 'createdAt'],
  },
  fields: [
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'URL', value: 'url' },
        { label: 'テキストメモ', value: 'text_note' },
        { label: '画像', value: 'image' },
        { label: 'PDF', value: 'pdf' },
      ],
    },
    {
      name: 'contentRef',
      label: 'Content Reference',
      type: 'text',
      required: true,
      admin: {
        description: 'URL、またはテキストメモ本文。画像/PDFの場合はアップロード先の参照',
      },
    },
    {
      name: 'pillars',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      filterOptions: {
        type: { equals: 'pillar' },
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'untouched',
      options: [
        { label: '未着手', value: 'untouched' },
        { label: '進行中', value: 'in_progress' },
        { label: '使用済み', value: 'used' },
      ],
      admin: {
        description:
          '記事化の進捗のみを表す（記事執筆に着手したか）。編集パイプライン上の状態は下の「編集パイプライン」欄を参照',
      },
    },
    {
      name: 'editorial',
      label: '編集パイプライン',
      type: 'group',
      admin: {
        description:
          '情報収集→AI整理・評価→Editor\'s Choice候補→人間の最終承認→公開、の状態管理。' +
          '「承認済み」「公開済み」「却下」への移行はログイン済みの人間のみ実行可' +
          '（AIはinbox→review／editors-choiceまでの評価・候補提示のみ行う）',
      },
      fields: [
        {
          name: 'editorialStatus',
          label: 'ステータス',
          type: 'select',
          required: true,
          defaultValue: 'inbox',
          options: EDITORIAL_STATES.map(({ label, value }) => ({ label, value })),
        },
        {
          name: 'retrievedAt',
          label: '取得日時',
          type: 'date',
          admin: {
            description: '情報源を取得した日時。未入力の場合は初回登録時刻を自動採用',
          },
        },
        {
          name: 'aiSummary',
          label: 'AI要約',
          type: 'textarea',
        },
        {
          name: 'aiEvaluationReason',
          label: 'AI評価理由',
          type: 'textarea',
          admin: {
            description: 'AIがこの情報源をどう評価したか（採否・優先度判断の根拠）',
          },
        },
        {
          name: 'editorsChoiceReason',
          label: "Editor's Choice判定理由",
          type: 'textarea',
          admin: {
            description: 'Editor\'s Choice候補として選定した理由',
            condition: (_, siblingData) =>
              ['editors-choice', 'approved', 'published'].includes(
                siblingData?.editorialStatus,
              ),
          },
        },
        {
          name: 'rejectionReason',
          label: '却下理由',
          type: 'textarea',
          admin: {
            condition: (_, siblingData) => siblingData?.editorialStatus === 'rejected',
          },
        },
        {
          name: 'decisionBy',
          label: '最終承認/却下者',
          type: 'relationship',
          relationTo: 'users',
          admin: {
            readOnly: true,
            description: '承認済み・公開済み・却下への変更時に操作者を自動記録（手動入力不可）',
          },
        },
        {
          name: 'decisionAt',
          label: '最終承認/却下日時',
          type: 'date',
          admin: {
            readOnly: true,
          },
        },
      ],
    },
  ],
  timestamps: true,
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        const isCreate = !originalDoc
        const editorialTouched = data.editorial !== undefined

        // このグループに触れない部分更新（例：statusだけをAPI経由で変更）で
        // 既存のeditorial値を消さないよう、未着手の更新は素通りさせる。
        if (!isCreate && !editorialTouched) {
          return data
        }

        // 部分的なeditorial更新（例：editorialStatusのみ送信）でも他の
        // サブフィールド（aiSummary等）を失わないよう、既存値とマージする。
        const editorial = { ...(originalDoc?.editorial ?? {}), ...(data.editorial ?? {}) }

        if (isCreate && !editorial.retrievedAt) {
          editorial.retrievedAt = new Date().toISOString()
        }

        const prevStatus: EditorialState | undefined = originalDoc?.editorial?.editorialStatus
        const nextStatus: EditorialState | undefined = editorial.editorialStatus

        const isEnteringHumanGate =
          !!nextStatus && nextStatus !== prevStatus && HUMAN_GATED_STATES.includes(nextStatus)

        if (isEnteringHumanGate) {
          if (!req.user) {
            throw new Error(
              `editorialStatusを「${nextStatus}」に変更するには、ログイン済みの人間による操作が必要です（AI・自動化スクリプトからの直接遷移は不可）`,
            )
          }
          editorial.decisionBy = req.user.id
          editorial.decisionAt = new Date().toISOString()
        }

        data.editorial = editorial
        return data
      },
    ],
  },
}
