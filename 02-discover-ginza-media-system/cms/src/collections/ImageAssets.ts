import type { CollectionConfig } from 'payload'

// CONTENT_MODEL.md 4節。derived_variants(4.1) はPayloadのimageSizesが
// 自動生成するため、手作りのVariant[]配列は持たずPayload標準機能に委譲する。
export const ImageAssets: CollectionConfig = {
  slug: 'image-assets',
  upload: {
    staticDir: '../media/image-assets',
    mimeTypes: ['image/*'],
    imageSizes: [
      { name: 'gallery', width: 1600, height: undefined, position: 'centre' },
      { name: 'instagram_square', width: 1080, height: 1080, position: 'centre' },
      { name: 'instagram_portrait', width: 1080, height: 1350, position: 'centre' },
      { name: 'x_landscape', width: 1600, height: 900, position: 'centre' },
      { name: 'note_header', width: 1280, height: 670, position: 'centre' },
    ],
  },
  admin: {
    useAsTitle: 'filename',
  },
  fields: [
    {
      name: 'rights',
      type: 'group',
      admin: { description: 'archival photoの権利確認に必須（CONTENT_MODEL.md 4節）' },
      fields: [
        { name: 'owner', type: 'text', required: true },
        {
          name: 'licenseType',
          type: 'text',
          required: true,
          admin: { description: '例: 自社撮影 / パブリックドメイン / 提供元の使用許諾' },
        },
        { name: 'usageNotes', type: 'textarea' },
        { name: 'requiresAttribution', type: 'checkbox', defaultValue: false },
      ],
    },
    {
      name: 'altText',
      type: 'group',
      fields: [
        { name: 'ja', type: 'text' },
        { name: 'en', type: 'text' },
      ],
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
  ],
}
