// Instagram Graph API (Content Publishing API) 投稿ワーカー。
//
// 前提条件（TECH_SELECTION_DRAFT.md 3節）：Instagramビジネス/クリエイター
// アカウント、Facebookページとの連携、Meta App Reviewの通過。これらが
// 揃うまで実際の送信はできないため、環境変数未設定時は明示的にエラーとする。
//
// 呼び出しの二段階フロー自体はGraph APIの実仕様通りに実装済み：
// 1. media container作成（画像URL・キャプションを渡す）
// 2. media_publish（作成したcontainerを公開）

export interface PostToInstagramInput {
  imageUrl: string
  caption: string
}

export interface PostToInstagramResult {
  mediaId: string
}

function requireCredentials() {
  const igUserId = process.env.IG_BUSINESS_ACCOUNT_ID
  const accessToken = process.env.IG_PAGE_ACCESS_TOKEN

  if (!igUserId || !accessToken) {
    throw new Error(
      'Instagram投稿ワーカーには IG_BUSINESS_ACCOUNT_ID / IG_PAGE_ACCESS_TOKEN が必要です。' +
        'Meta App Review通過前は送信できません（src/workers/postToInstagram.ts参照）。',
    )
  }

  return { igUserId, accessToken }
}

async function createMediaContainer(input: PostToInstagramInput): Promise<string> {
  const { igUserId, accessToken } = requireCredentials()

  const res = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: input.imageUrl,
      caption: input.caption,
      access_token: accessToken,
    }),
  })

  if (!res.ok) {
    throw new Error(`Instagram media container作成に失敗: ${res.status} ${await res.text()}`)
  }

  const data = (await res.json()) as { id: string }
  return data.id
}

async function publishMediaContainer(creationId: string): Promise<string> {
  const { igUserId, accessToken } = requireCredentials()

  const res = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
  })

  if (!res.ok) {
    throw new Error(`Instagram公開に失敗: ${res.status} ${await res.text()}`)
  }

  const data = (await res.json()) as { id: string }
  return data.id
}

export async function postToInstagram(
  input: PostToInstagramInput,
): Promise<PostToInstagramResult> {
  const creationId = await createMediaContainer(input)
  const mediaId = await publishMediaContainer(creationId)
  return { mediaId }
}
