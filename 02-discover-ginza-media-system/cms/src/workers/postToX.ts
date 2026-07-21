// X API v2 投稿ワーカー（スタブ）。
//
// ARCHITECTURE_DRAFT.md 2.6節の通り、X投稿は「承認ゲートを経た自動送信」で
// あり無人自動投稿ではない。承認キューで人間が送信を承認したタイミングで
// このワーカーが呼ばれる想定。
//
// 未実装（本番投入前に必要な作業）：
// 1. X Developer Portalでアプリ登録・書き込み権限（OAuth 1.0a user context
//    または OAuth2 PKCE）を取得する
// 2. 認可フローを実装し、アクセストークンを安全に保存する
// 3. リクエスト署名は自前実装せず `twitter-api-v2` 等の実績あるライブラリを
//    導入する（署名処理の自前実装は認証情報漏洩・不正リクエストのリスクが
//    高いため意図的に避けている）

export interface PostToXInput {
  text: string
}

export interface PostToXResult {
  postId: string
  url: string
}

export async function postToX(_input: PostToXInput): Promise<PostToXResult> {
  throw new Error(
    'postToXは未実装のスタブです。X Developer Portalでの認可設定と ' +
      '`twitter-api-v2` 等のライブラリ導入が必要です（src/workers/postToX.ts参照）。',
  )
}
