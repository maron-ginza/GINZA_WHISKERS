import type { CollectionConfig } from 'payload'

// CONTENT_MODEL.md 2.1節：representedYear -> historicalPeriod の自動分類表
const HISTORICAL_PERIODS = [
  { label: '明治・大正', value: 'meiji_taisho', maxYear: 1925 },
  { label: '昭和(戦前)', value: 'showa_prewar', maxYear: 1945 },
  { label: '昭和(戦後-30年代)', value: 'showa_postwar_30s', maxYear: 1959 },
  { label: '昭和(40-50年代)', value: 'showa_40_50s', maxYear: 1988 },
  { label: '平成以降', value: 'heisei_onwards', maxYear: Infinity },
] as const

function classifyHistoricalPeriod(representedYear: number): string | null {
  const bucket = HISTORICAL_PERIODS.find((p) => representedYear <= p.maxYear)
  return bucket ? bucket.value : null
}

const VARIANT_PURPOSES = [
  'gallery',
  'instagram_square',
  'instagram_portrait',
  'x_landscape',
  'note_header',
] as const

const TRANSLATION_STATES = [
  { label: '未着手', value: 'not_started' },
  { label: '進行中', value: 'in_progress' },
  { label: '完了', value: 'complete' },
]

export const Articles: CollectionConfig = {
  slug: 'articles',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'reviewStatus', 'accessionNumber', 'historicalPeriod', 'updatedAt'],
  },
  versions: {
    drafts: true,
    maxPerDoc: 50,
  },
  fields: [
    {
      name: 'reviewStatus',
      label: 'Status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: '下書き (Draft)', value: 'draft' },
        { label: 'レビュー中 (Review)', value: 'review' },
        { label: '承認済み (Approved)', value: 'approved' },
        { label: '公開済み (Published)', value: 'published' },
      ],
      admin: {
        description:
          'ARCHITECTURE_DRAFT.md 2.5節 承認キューの状態遷移。フィールド名はPayload内部の`_status`（versions/drafts機能の予約フィールド）とのPostgres enum型衝突を避けるため`reviewStatus`とする',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      localized: true,
      unique: true,
      admin: {
        description: 'Payloadのlocalization機能で ja/en を1フィールドとして管理',
      },
    },
    {
      name: 'body',
      type: 'richText',
      localized: true,
      admin: {
        description:
          'CONTENT_MODEL.md 2.2節 Block型に対応（Lexicalの見出し/段落/引用/画像ノードで表現）',
      },
    },
    {
      name: 'pillars',
      label: '収蔵室 (Pillars)',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      required: true,
      minRows: 1,
      filterOptions: {
        type: { equals: 'pillar' },
      },
    },
    {
      name: 'freeTags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      filterOptions: {
        type: { equals: 'free' },
      },
    },
    {
      name: 'accessionNumber',
      label: 'Accession Number (資料番号)',
      type: 'text',
      unique: true,
      admin: {
        readOnly: true,
        description: '承認時に自動採番。以後不変（GW・{year}・{連番3桁}）',
      },
    },
    {
      name: 'representedYear',
      type: 'number',
      admin: {
        description: '記事が扱う対象（写真・出来事）の年。特定の年に紐づかない場合は空欄',
      },
    },
    {
      name: 'historicalPeriod',
      label: '年代 (Historical Period)',
      type: 'select',
      options: HISTORICAL_PERIODS.map(({ label, value }) => ({ label, value })),
      admin: {
        description:
          '「年代から辿る」ブラウズ軸。representedYearから自動分類、編集長が上書き可能',
      },
    },
    {
      name: 'images',
      type: 'array',
      fields: [
        {
          name: 'asset',
          type: 'relationship',
          relationTo: 'image-assets',
          required: true,
        },
        {
          name: 'role',
          type: 'select',
          required: true,
          options: [
            { label: 'ヒーロー', value: 'hero' },
            { label: '本文内', value: 'inline' },
            { label: 'ギャラリー', value: 'gallery' },
          ],
        },
        {
          name: 'variant',
          type: 'select',
          options: VARIANT_PURPOSES.map((v) => ({ label: v, value: v })),
        },
        {
          name: 'caption',
          type: 'text',
          localized: true,
        },
      ],
    },
    {
      name: 'seo',
      type: 'group',
      fields: [
        { name: 'metaTitle', type: 'text', localized: true },
        { name: 'metaDescription', type: 'textarea', localized: true },
        { name: 'ogImage', type: 'relationship', relationTo: 'image-assets' },
      ],
    },
    {
      name: 'socialCopy',
      type: 'group',
      admin: {
        description:
          'AIが本文と同時に下書き生成し、編集長レビューで本文と一括承認（ARCHITECTURE_DRAFT.md 2.2節）',
      },
      fields: [
        { name: 'note', type: 'textarea', localized: true },
        { name: 'x', type: 'textarea', localized: true },
        { name: 'instagram', type: 'textarea', localized: true },
      ],
    },
    {
      name: 'translationStatus',
      type: 'group',
      fields: [
        {
          name: 'ja',
          type: 'select',
          defaultValue: 'not_started',
          options: TRANSLATION_STATES,
        },
        {
          name: 'en',
          type: 'select',
          defaultValue: 'not_started',
          options: TRANSLATION_STATES,
        },
      ],
    },
    {
      name: 'publishHistory',
      type: 'array',
      admin: { description: '同一記事の二重配信防止（ARCHITECTURE_DRAFT.md 2.4節）' },
      fields: [
        {
          name: 'channel',
          type: 'select',
          required: true,
          options: ['site', 'note', 'x', 'instagram', 'newsletter'],
        },
        { name: 'publishedAt', type: 'date' },
        { name: 'publishedBy', type: 'relationship', relationTo: 'users' },
        {
          name: 'reference',
          type: 'text',
          admin: { description: '配信先URL・投稿ID。noteは手動投稿のため空欄許容' },
        },
      ],
    },
    {
      name: 'sourceRefs',
      type: 'relationship',
      relationTo: 'sources',
      hasMany: true,
    },
    {
      name: 'aiGeneratedBy',
      type: 'text',
      admin: { description: '生成物のトレーサビリティ（モデル/バージョン識別）' },
    },
    {
      name: 'reviewedBy',
      type: 'relationship',
      relationTo: 'users',
    },
    {
      name: 'approvedBy',
      type: 'relationship',
      relationTo: 'users',
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        if (data.representedYear != null && !data.historicalPeriod) {
          const classified = classifyHistoricalPeriod(data.representedYear)
          if (classified) data.historicalPeriod = classified
        }

        const isNewlyApproved =
          data.reviewStatus === 'approved' && originalDoc?.reviewStatus !== 'approved'

        if (isNewlyApproved && !originalDoc?.accessionNumber) {
          const year = data.representedYear ?? new Date().getFullYear()
          const prefix = `GW・${year}・`
          const { totalDocs } = await req.payload.count({
            collection: 'articles',
            where: {
              accessionNumber: { like: prefix },
            },
          })
          const seq = String(totalDocs + 1).padStart(3, '0')
          data.accessionNumber = `${prefix}${seq}`
        }

        return data
      },
    ],
  },
}
