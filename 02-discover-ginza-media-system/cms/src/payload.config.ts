import path from 'path'
import { fileURLToPath } from 'url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { buildConfig } from 'payload'

import { Articles } from './collections/Articles'
import { ImageAssets } from './collections/ImageAssets'
import { Sources } from './collections/Sources'
import { Tags } from './collections/Tags'
import { Users } from './collections/Users'
import { generateDraftEndpoint } from './endpoints/generateDraft'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
  },
  collections: [Users, Articles, Sources, ImageAssets, Tags],
  endpoints: [generateDraftEndpoint],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  // ja/en バイリンガル要件（CLAUDE.md 第7章）をPayload標準のlocalization機能で表現
  localization: {
    locales: ['ja', 'en'],
    defaultLocale: 'ja',
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
    },
  }),
  plugins: [
    // Cloudflare R2 (S3互換API) — TECH_SELECTION_DRAFT.md 3節
    s3Storage({
      collections: {
        'image-assets': true,
      },
      bucket: process.env.R2_BUCKET || '',
      config: {
        endpoint: process.env.R2_ENDPOINT,
        region: 'auto',
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        },
      },
    }),
  ],
})
