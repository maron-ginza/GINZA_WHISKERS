import type { CollectionConfig } from 'payload'

import { DIFF_STATUSES, DIFF_STATUS_LABELS } from '../lib/crawler/diff'
import { CONTENT_RICHNESS_TIER_LABELS, CONTENT_RICHNESS_TIERS } from '../lib/curation/contentRichness'
import {
  EDITORIAL_SCORE_MAX,
  GENDER_AFFINITY_LABELS,
  GENDER_AFFINITY_VALUES,
  GENERATION_LABELS,
  GENERATION_VALUES,
  INTERSECTIONALITY_DIMENSIONS,
  INTERSECTIONALITY_LABELS,
  SCORING_METHOD_LABELS,
  SCORING_METHODS,
  VISIT_STYLE_LABELS,
  VISIT_STYLE_VALUES,
} from '../lib/curation/types'

function toOptions<T extends string>(values: readonly T[], labels: Record<T, string>) {
  return values.map((value) => ({ label: labels[value], value }))
}

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
    {
      name: 'crawlOrigin',
      label: '自動収集元（SOURCE LEDGER）',
      type: 'group',
      admin: {
        description:
          'SOURCE LEDGER自動巡回（source-snapshots）の差分検知（changed/first_seen）から' +
          '自動生成されたSourceの場合のみ設定される（2026-08-17）。手動登録のSourceは空欄のまま。' +
          '生成ロジック：cms/src/lib/sourceLedger/generateSourceCandidates.ts',
      },
      fields: [
        {
          name: 'sourceSnapshot',
          label: '生成元Snapshot',
          type: 'relationship',
          relationTo: 'source-snapshots',
          admin: {
            readOnly: true,
            description: 'この候補生成のトリガーになったSnapshot（冪等判定のキーにも使用）',
          },
        },
        {
          name: 'sourceLedger',
          label: 'Source Ledger',
          type: 'relationship',
          relationTo: 'source-ledger',
          admin: { readOnly: true },
        },
        {
          name: 'diffStatus',
          label: '生成時の差分ステータス',
          type: 'select',
          options: DIFF_STATUSES.map((value) => ({ label: DIFF_STATUS_LABELS[value], value })),
          admin: { readOnly: true },
        },
      ],
    },
    {
      name: 'editorialScore',
      label: 'Editorial Score（旬の銀座、合計100点）',
      type: 'group',
      admin: {
        description:
          '「旬の銀座」編集判断レイヤー（2026-08-17）。AI（Editorial Desk）が付与する' +
          '構造化スコア——採否を決めるものではなく、順位付けのための参考情報。' +
          '最終採用は人間（Maron Editor\'s Choice）がeditorialStatusの承認フローで行う。' +
          'ロジック：cms/src/lib/curation/scoreSource.ts（本番）／heuristicScore.ts（ローカル検証用）',
      },
      fields: [
        {
          name: 'now',
          label: `NOW / 今だけ性（0〜${EDITORIAL_SCORE_MAX.now}）`,
          type: 'number',
          min: 0,
          max: EDITORIAL_SCORE_MAX.now,
        },
        { name: 'nowReason', label: 'NOW 判定理由', type: 'text' },
        {
          name: 'ginza',
          label: `GINZA / 銀座固有性（0〜${EDITORIAL_SCORE_MAX.ginza}）`,
          type: 'number',
          min: 0,
          max: EDITORIAL_SCORE_MAX.ginza,
        },
        { name: 'ginzaReason', label: 'GINZA 判定理由', type: 'text' },
        {
          name: 'ux',
          label: `UX / 体験価値（0〜${EDITORIAL_SCORE_MAX.ux}）`,
          type: 'number',
          min: 0,
          max: EDITORIAL_SCORE_MAX.ux,
        },
        { name: 'uxReason', label: 'UX 判定理由', type: 'text' },
        {
          name: 'story',
          label: `STORY / 文化・物語性（0〜${EDITORIAL_SCORE_MAX.story}）`,
          type: 'number',
          min: 0,
          max: EDITORIAL_SCORE_MAX.story,
        },
        { name: 'storyReason', label: 'STORY 判定理由', type: 'text' },
        {
          name: 'discovery',
          label: `DISCOVERY / 発見性（0〜${EDITORIAL_SCORE_MAX.discovery}）`,
          type: 'number',
          min: 0,
          max: EDITORIAL_SCORE_MAX.discovery,
        },
        { name: 'discoveryReason', label: 'DISCOVERY 判定理由', type: 'text' },
        {
          name: 'rawTotal',
          label: '本文情報量ペナルティ適用前の合計（0〜100）',
          type: 'number',
          min: 0,
          max: 100,
          admin: {
            readOnly: true,
            description:
              '5項目の合計そのもの（本文情報量ペナルティ適用前）。ランキングが実際に使うのは' +
              '下記totalの方——差があれば本文情報量ペナルティが働いたことを意味する（2026-08-18）',
          },
        },
        {
          name: 'total',
          label: '合計（自動計算・本文情報量ペナルティ適用後、0〜100）',
          type: 'number',
          min: 0,
          max: 100,
          admin: {
            readOnly: true,
            description:
              '5項目の合計にcontentRichnessPenaltyFactorを乗算した値。AI/ヒューリスティックの' +
              '自己申告値は信用せず、書き込み時にサーバー側で再計算する。ランキング等はこの値を使う',
          },
        },
        {
          name: 'contentRichnessTier',
          label: '本文情報量の判定',
          type: 'select',
          options: toOptions(CONTENT_RICHNESS_TIERS, CONTENT_RICHNESS_TIER_LABELS),
          admin: {
            readOnly: true,
            description:
              'contentRefの文末句点数・文字数から決定的に判定（AI呼び出しなし）。' +
              'ロジック：cms/src/lib/curation/contentRichness.ts（2026-08-18）',
          },
        },
        {
          name: 'contentRichnessPenaltyFactor',
          label: '本文情報量ペナルティ係数',
          type: 'number',
          admin: { readOnly: true, description: 'rawTotalに乗算した係数（rich:1.0/thin:0.85/boilerplate:0.65）' },
        },
        {
          name: 'scoringMethod',
          label: '採点方式',
          type: 'select',
          options: toOptions(SCORING_METHODS, SCORING_METHOD_LABELS),
          admin: {
            readOnly: true,
            description:
              'heuristic-placeholderは本物のAI評価ではないローカル検証用の仮採点。' +
              '有効なANTHROPIC_API_KEYが用意でき次第、claudeで再採点すること',
          },
        },
        {
          name: 'scoredAt',
          label: '採点日時',
          type: 'date',
          admin: { readOnly: true },
        },
      ],
    },
    {
      name: 'audienceTags',
      label: 'Audience Tags（誰に響くか）',
      type: 'group',
      admin: {
        description:
          '情報を収集段階で除外するfilterではなく、「誰に響くか」を示す複数選択可のタグ。' +
          'この情報が特定の読者だけに向けたものであることを意味しない（除外用途では使わない）。' +
          '将来のGINZA Conciergeパーソナライズにも再利用予定。',
      },
      fields: [
        {
          name: 'genderAffinity',
          label: 'Gender Affinity',
          type: 'select',
          hasMany: true,
          options: toOptions(GENDER_AFFINITY_VALUES, GENDER_AFFINITY_LABELS),
        },
        {
          name: 'generation',
          label: 'Generation',
          type: 'select',
          hasMany: true,
          options: toOptions(GENERATION_VALUES, GENERATION_LABELS),
        },
        {
          name: 'visitStyle',
          label: 'Visit Style',
          type: 'select',
          hasMany: true,
          options: toOptions(VISIT_STYLE_VALUES, VISIT_STYLE_LABELS),
          admin: {
            description: 'Familyは世代(Generation)ではなく同行形態(Visit Style)として扱う',
          },
        },
      ],
    },
    {
      name: 'intersectionality',
      label: '交差性（People × Culture × Commerce × Technology × Time）',
      type: 'select',
      hasMany: true,
      options: toOptions(INTERSECTIONALITY_DIMENSIONS, INTERSECTIONALITY_LABELS),
      admin: {
        description:
          'GINZA WHISKERS編集思想の将来評価軸のためのプレースホルダー（2026-08-17）。' +
          '今回のセッションではAIによる自動算出は行わない（スキーマのみ準備、空欄のまま運用）。',
      },
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
