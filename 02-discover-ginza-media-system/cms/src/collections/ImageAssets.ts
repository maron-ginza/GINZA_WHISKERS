import type { CollectionConfig } from 'payload'
import { promises as fs } from 'fs'
import { fileTypeFromBuffer } from 'file-type'
import convert from 'heic-convert'

// CONTENT_MODEL.md 4節。derived_variants(4.1) はPayloadのimageSizesが
// 自動生成するため、手作りのVariant[]配列は持たずPayload標準機能に委譲する。

// このプロジェクトのsharpビルドはHEIC(HEVC)コーデックのデコードに非対応
// （patentライセンスの都合でlibvipsのプリビルドバイナリから除外されており、
// HEIF系入出力はAVIFのみ可。Phase 9でsharp.format.heifを実機確認して特定）。
// iPhone等で撮影された実際のHEIC写真はPayload標準のリサイズ判定
// （canResizeImage）の対象外のため、リサイズされずimageSizesが生成されない
// まま原本だけ保存されてしまう（付録C）。beforeOperationフックでPayload標準の
// アップロード処理より先に、pure-JS実装（libheif-js経由）のheic-convertで
// JPEGへ変換し、以降は通常のJPEGとして扱わせることで解決する。
async function convertHeicToJpeg(file: {
  data: Buffer
  mimetype: string
  name: string
  size: number
  tempFilePath?: string
}): Promise<{
  data: Buffer
  mimetype: string
  name: string
  size: number
  tempFilePath?: string
} | null> {
  const sourceBuffer = file.tempFilePath ? await fs.readFile(file.tempFilePath) : file.data
  // 拡張子・送信されたmimetypeは信用せず、実バイト列（ftypボックスの
  // ブランド）で判定する（iOS/ブラウザ側でmimetypeがapplication/octet-stream
  // になる等、不正確なケースがあるため）。AVIF（同じHEIFコンテナだがsharpが
  // 既に扱える）は誤検出しない
  const detected = await fileTypeFromBuffer(sourceBuffer)
  if (detected?.ext !== 'heic') return null

  const jpegBuffer = Buffer.from(await convert({ buffer: sourceBuffer, format: 'JPEG' }))
  // 元ファイル名（拡張子を除く部分）は保持し、拡張子のみ.jpgに置き換える。
  // 不可避な変化：デコード→再エンコードによりHEIC内のEXIF（撮影日時・
  // GPS・カメラ機種等）は失われる（回転はheic-decodeがデコード時に反映済みの
  // ため見た目のズレは生じない）。CLAUDE.md第12章に既知の制約として明記。
  const baseName = file.name.replace(/\.(heic|heif)$/i, '')

  if (file.tempFilePath) {
    await fs.writeFile(file.tempFilePath, jpegBuffer)
  }

  return {
    data: jpegBuffer,
    mimetype: 'image/jpeg',
    name: `${baseName}.jpg`,
    size: jpegBuffer.length,
    tempFilePath: file.tempFilePath,
  }
}

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
  access: {
    // 公開記事に埋め込まれた画像を匿名（Astroビルド・ブラウザ）が表示できるよう全面公開
    read: () => true,
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
  hooks: {
    beforeOperation: [
      async ({ req }) => {
        if (!req.file) return
        const converted = await convertHeicToJpeg(req.file)
        if (converted) {
          req.file = { ...req.file, ...converted }
        }
      },
    ],
  },
}
