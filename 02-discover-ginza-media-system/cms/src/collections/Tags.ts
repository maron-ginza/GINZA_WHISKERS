import type { CollectionConfig } from 'payload'

// Root第2章の6本柱（固定値、ja/en両方）。CONTENT_MODEL.md 5節。
// Phase 8でnameをlocalized化したため、pillar名バリデーションもロケール別に判定する。
export const PILLAR_NAMES = {
  ja: ['歴史', '文化', 'アート', '建築', '人物', 'イベント'],
  en: ['History', 'Culture', 'Art', 'Architecture', 'People', 'Events'],
} as const

export const Tags: CollectionConfig = {
  slug: 'tags',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'type'],
    description: '6本柱（収蔵室）と自由タグのマスタ。CONTENT_MODEL.md 5節',
  },
  access: {
    // ラベルデータのみで機密性がないため匿名にも全面公開（Articles一覧のpillars表示等で使用）
    read: () => true,
  },
  fields: [
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: '収蔵室 (Pillar)', value: 'pillar' },
        { label: '自由タグ (Free)', value: 'free' },
      ],
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      unique: true,
      localized: true,
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data, req }) => {
        const locale = (req.locale === 'en' ? 'en' : 'ja') as keyof typeof PILLAR_NAMES
        const allowedNames = PILLAR_NAMES[locale]
        if (
          data?.type === 'pillar' &&
          data.name &&
          !(allowedNames as readonly string[]).includes(data.name as string)
        ) {
          throw new Error(
            `収蔵室（pillar）タグは固定6値のみ使用できます（${locale}）: ${allowedNames.join(' / ')}`,
          )
        }
        return data
      },
    ],
  },
}
