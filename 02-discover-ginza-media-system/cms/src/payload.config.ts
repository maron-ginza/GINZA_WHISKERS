import path from 'path'
import { fileURLToPath } from 'url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { Articles } from './collections/Articles'
import { ImageAssets } from './collections/ImageAssets'
import { SocialPosts } from './collections/SocialPosts'
import { Sources } from './collections/Sources'
import { Tags } from './collections/Tags'
import { Users } from './collections/Users'
import { evaluateInboxEndpoint } from './endpoints/evaluateInbox'
import { evaluateSourceEndpoint } from './endpoints/evaluateSource'
import { generateDraftEndpoint } from './endpoints/generateDraft'
import {
  dispatchSocialPostEndpoint,
  dryRunSocialQueueEndpoint,
  generateSocialQueueEndpoint,
  markSocialPostReadyEndpoint,
} from './endpoints/socialQueue'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
  },
  collections: [Users, Articles, Sources, ImageAssets, Tags, SocialPosts],
  endpoints: [
    generateDraftEndpoint,
    evaluateSourceEndpoint,
    evaluateInboxEndpoint,
    generateSocialQueueEndpoint,
    dryRunSocialQueueEndpoint,
    markSocialPostReadyEndpoint,
    dispatchSocialPostEndpoint,
  ],
  editor: lexicalEditor(),
  sharp,
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
      // ローカル開発は DATABASE_URI（.env.example の慣習）。Railway の
      // Postgres プラグインは自動生成する接続文字列変数を DATABASE_URL と
      // 命名するため（CLAUDE.md 第12章 2026-08-09 決定ログ参照）、本番で
      // どちらの変数名を使っても接続できるようフォールバックする。
      connectionString: process.env.DATABASE_URI || process.env.DATABASE_URL || '',
    },
  }),
  plugins: [
    // Cloudflare R2 (S3互換API) — TECH_SELECTION_DRAFT.md 3節
    // R2認証情報が未設定のローカル開発環境では無効化する（ImageAssetsはローカルディスクへフォールバック）
    s3Storage({
      enabled: Boolean(process.env.R2_BUCKET),
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
