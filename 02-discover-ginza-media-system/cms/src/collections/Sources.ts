import type { CollectionConfig } from 'payload'

// CONTENT_MODEL.md 3節。Phase 1は人間による手動登録が前提（自動収集はPhase 3）。
export const Sources: CollectionConfig = {
  slug: 'sources',
  admin: {
    useAsTitle: 'contentRef',
    defaultColumns: ['type', 'status', 'contentRef', 'createdAt'],
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
    },
  ],
  timestamps: true,
}
