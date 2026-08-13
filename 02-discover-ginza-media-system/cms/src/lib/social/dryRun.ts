import type { Payload } from 'payload'

// Phase 15：pending/ready状態の配信キュー項目を対象に、実際にX/Instagram/note等へ
// 送信することなく「何がどう配信されるか」をプレビューするDry Run。
// postToX/postToInstagram等の実配信ワーカーは一切呼び出さない（外部ネットワーク
// アクセスなし）。statusの変更も行わない——lastDryRunAtの記録のみを行う
// （監査用途、Sources/Articlesのdecision*系フィールドと同じ考え方）。

const X_CHAR_LIMIT = 280

export interface DryRunPreviewItem {
  id: string | number
  articleId: string | number
  articleTitle: string
  channel: string
  status: string
  preview: { ja: string; en: string }
  warnings: string[]
}

export interface DryRunResult {
  previewedCount: number
  items: DryRunPreviewItem[]
}

export async function dryRunSocialQueue(payload: Payload): Promise<DryRunResult> {
  const { docs } = await payload.find({
    collection: 'social-posts',
    where: { status: { in: ['pending', 'ready'] } },
    depth: 1,
    limit: 1000,
    overrideAccess: true,
  })

  const items: DryRunPreviewItem[] = []

  for (const doc of docs) {
    const article = doc.article as unknown
    const articleObj =
      typeof article === 'object' && article !== null
        ? (article as { id: string | number; title?: string; images?: unknown })
        : null

    const articleId = articleObj ? articleObj.id : (article as string | number)
    const articleTitle = articleObj?.title ?? ''

    const warnings: string[] = []
    const ja = doc.copy?.ja ?? ''
    const en = doc.copy?.en ?? ''

    if (!ja && !en) {
      warnings.push('投稿素材が空です（Article.socialCopyが未入力の可能性）')
    }

    if (doc.channel === 'x') {
      if (ja.length > X_CHAR_LIMIT) warnings.push(`日本語テキストがX文字数上限(${X_CHAR_LIMIT})を超過`)
      if (en.length > X_CHAR_LIMIT) warnings.push(`英語テキストがX文字数上限(${X_CHAR_LIMIT})を超過`)
    }

    if (doc.channel === 'instagram') {
      const images = Array.isArray(articleObj?.images) ? articleObj.images : []
      const hasHeroImage = images.some(
        (img) =>
          typeof img === 'object' &&
          img !== null &&
          (img as { role?: string; asset?: unknown }).role === 'hero' &&
          (img as { asset?: unknown }).asset,
      )
      if (!hasHeroImage) warnings.push('ヒーロー画像が未設定のため実配信時に失敗します')
    }

    items.push({
      id: doc.id,
      articleId,
      articleTitle,
      channel: doc.channel,
      status: doc.status,
      preview: { ja, en },
      warnings,
    })

    await payload.update({
      collection: 'social-posts',
      id: doc.id,
      overrideAccess: true,
      data: { lastDryRunAt: new Date().toISOString() },
    })
  }

  return { previewedCount: items.length, items }
}
