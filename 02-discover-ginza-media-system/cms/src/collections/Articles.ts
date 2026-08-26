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

// ARCHITECTURE_DRAFT.md 2.5節「承認キュー」の人間ゲート。Sources.tsの
// editorialStatusゲートと同じ考え方：approved/publishedへの遷移は
// ログイン済みの人間のみ実行可（AI・自動化スクリプトからの直接遷移は不可）。
const HUMAN_GATED_REVIEW_STATES = ['approved', 'published'] as const

export const Articles: CollectionConfig = {
  slug: 'articles',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'reviewStatus', 'accessionNumber', 'historicalPeriod', 'updatedAt'],
  },
  access: {
    // 匿名（Astroのビルド時fetch等）はpublishedのみ閲覧可。ログイン済み編集者は全件（draft含む）閲覧可
    read: ({ req }) => {
      if (req.user) return true
      return { reviewStatus: { equals: 'published' } }
    },
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
      name: 'editorialProvenance',
      label: 'Editorial Provenance（Source Provenance記録）',
      type: 'array',
      // dbName明示：Postgresの識別子長制限（63文字）対策。versions機能
      // （_articles_v_version_...プレフィックス）と組み合わさると、
      // 既定の自動生成名（enum__articles_v_version_editorial_provenance_
      // verification_status等）が63文字を超えてPayload起動時エラーに
      // なることを実機で確認した（2026-08-25）。配下のselectフィールドに
      // 短いdbNameを明示して回避する。
      dbName: 'article_editorial_provenance',
      admin: {
        description:
          '週次「旬の銀座」等、複数DiscoveredContentから生成した記事のfact単位の出典記録' +
          '（2026-08-25、Human Editor Review P0-2）。公開本文には候補単位で集約したSOURCE' +
          '表示のみを出し、fact単位の詳細追跡はここで行う。単一Source生成の記事では空のまま。',
      },
      fields: [
        {
          name: 'discoveredContentSource',
          label: '元DiscoveredContent',
          type: 'relationship',
          relationTo: 'discovered-content',
        },
        { name: 'sourceName', type: 'text', required: true },
        { name: 'sourceUrl', type: 'text', required: true },
        {
          name: 'verifiedAt',
          label: '確認日時（システムが実際に確認した日時。AIによる生成値は使わない）',
          type: 'date',
        },
        { name: 'fact', type: 'text', required: true },
        {
          name: 'sourceType',
          type: 'select',
          dbName: 'ep_source_type',
          options: [
            { label: 'Primary', value: 'primary' },
            { label: 'Official', value: 'official' },
            { label: 'Secondary', value: 'secondary' },
          ],
        },
        {
          name: 'factType',
          type: 'select',
          dbName: 'ep_fact_type',
          options: [
            { label: 'Date', value: 'date' },
            { label: 'Venue', value: 'venue' },
            { label: 'Price', value: 'price' },
            { label: 'Reservation', value: 'reservation' },
            { label: 'Hours', value: 'hours' },
            { label: 'Access', value: 'access' },
            { label: 'Other', value: 'other' },
          ],
        },
        {
          name: 'verificationStatus',
          type: 'select',
          dbName: 'ep_verification_status',
          options: [
            { label: 'Confirmed', value: 'confirmed' },
            { label: 'Unconfirmed', value: 'unconfirmed' },
            { label: 'Conflicting', value: 'conflicting' },
          ],
        },
      ],
    },
    {
      name: 'callToAction',
      label: "Call to Action（結びの一手）",
      type: 'text',
      localized: true,
      admin: {
        description:
          '記事末尾で示す「次に取ってほしい1つの行動」（2026-08-26、note編集部の' +
          '公式ノウハウ反映）。closing（結びの一文）とは別に持たせることで、' +
          '複数の依頼を重ねて末尾がぼやけるのを防ぐ。1文・1アクションのみ。',
      },
    },
    {
      name: 'relatedArticles',
      label: '関連記事（回遊導線）',
      type: 'relationship',
      relationTo: 'articles',
      hasMany: true,
      admin: {
        description:
          '同じ収蔵室（pillar）を持つ公開済み記事から生成時に自動候補提示する' +
          '（2026-08-26追加、note編集部ノウハウの「次の閲覧につながる回遊導線」対応）。' +
          '自動候補は参考値であり、公開前に人間が確認・取捨選択する。',
      },
    },
    {
      name: 'series',
      label: 'シリーズ情報',
      type: 'group',
      admin: {
        description:
          'noteクリエイターページ上でもシリーズ性が伝わるようにするための識別情報' +
          '（2026-08-26追加）。週次「旬の銀座」等シリーズ生成のみ設定し、単発記事は空欄のまま。',
      },
      fields: [
        {
          name: 'label',
          type: 'text',
          admin: { description: '例：「旬の銀座」' },
        },
        {
          name: 'editionNumber',
          type: 'number',
          admin: {
            readOnly: true,
            description: 'シリーズ内の自動採番（生成時にシステムが設定、以後不変）',
          },
        },
      ],
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

        const prevReviewStatus = originalDoc?.reviewStatus
        const nextReviewStatus = data.reviewStatus

        const isEnteringHumanGate =
          !!nextReviewStatus &&
          nextReviewStatus !== prevReviewStatus &&
          (HUMAN_GATED_REVIEW_STATES as readonly string[]).includes(nextReviewStatus)

        if (isEnteringHumanGate && !req.user) {
          throw new Error(
            `reviewStatusを「${nextReviewStatus}」に変更するには、ログイン済みの人間による操作が必要です（AI・自動化スクリプトからの直接遷移は不可）`,
          )
        }

        const isNewlyApproved = nextReviewStatus === 'approved' && prevReviewStatus !== 'approved'

        if (isNewlyApproved) {
          if (req.user) data.approvedBy = req.user.id

          if (!originalDoc?.accessionNumber) {
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
        }

        return data
      },
    ],
  },
}
