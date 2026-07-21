import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'email',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      options: [
        { label: '編集長 (Editor-in-Chief)', value: 'editor_in_chief' },
        { label: '編集 (Editor)', value: 'editor' },
      ],
    },
  ],
}
