// GINZA WHISKERS / Project 02（2026-09-14）— 松屋銀座公式サイト（matsuyaginza.com）の
// コンテンツを、Storyblok公開Content Delivery APIから直接取得する（本番Railway等でも
// ブラウザ不要で再現できる恒久経路）。
//
// 背景：matsuyaginza.com はReact SPAで、通常のHTTP+HTML取得では常に空のシェルしか
// 返らない（2026-09-14確認）。当初はplaywright-core経由でこの端末のGoogle Chromeを
// 起動しレンダリング結果を読む方式を実装したが、マロン指示により「ローカルChrome
// 依存を本番運用へ持ち込まない」方針へ変更した。
//
// 【発見した経路】松屋銀座のフロントエンドは、ページ内容をStoryblok（ヘッドレスCMS）
// の**公開Content Delivery API**（https://api.storyblok.com/v2/cdn/stories/...）
// から取得して描画している。このAPIへ渡されているアクセストークン
// （`version=published`用、実際にブラウザがネットワークリクエストで送信していたもの
// を確認）は、Storyblokの設計上「公開配信用の読み取り専用トークン」であり
// （プレビュー版ではなく`version=published`のみ返す）、ウェブサイトの訪問者全員に
// 常時送信されている——ブラウザの開発者ツールで誰でも同じ値を確認できる、秘密鍵
// ではない公開トークンである（Storyblokの一般的な運用方式）。このAPIを直接
// fetchすることで、JavaScript実行（ブラウザ）を一切使わずに同じ内容を取得できる。
//
// **フェイルクローズ設計**：トークンが将来的に変更される、またはAPIが401/403を
// 返すようになった場合は「取得不能」として明示的に扱い、他の値で代替・推測しない
// （呼び出し元がsource healthへ記録し、候補を生成しない）。

const STORYBLOK_API_BASE = 'https://api.storyblok.com/v2/cdn/stories'
// 松屋銀座公式サイトの公開Content Delivery APIトークン（2026-09-14、同サイトの
// 実際のブラウザリクエストから確認。上記のとおり秘密鍵ではなく公開配信用トークン）。
const MATSUYA_STORYBLOK_PUBLIC_TOKEN = 'yI9v1RKyikYOJQHvRnNqZwtt'
const TIMEOUT_MS = 15_000

export interface StoryblokFetchResult {
  ok: boolean
  content: Record<string, unknown> | null
  httpStatus: number | null
  errorMessage: string | null
}

/**
 * 指定した full_slug（例："ginza/events/food/sweets/20260909"）のStoryblok
 * ストーリーを公開Content Delivery APIから取得する。プレーンなfetchのみ——
 * ブラウザ・JavaScript実行環境は不要（Railway等の通常のコンテナで動作する）。
 */
export async function fetchMatsuyaStoryblokStory(slug: string): Promise<StoryblokFetchResult> {
  const url = `${STORYBLOK_API_BASE}/${slug}?token=${MATSUYA_STORYBLOK_PUBLIC_TOKEN}&version=published&language=jp`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    if (!res.ok) {
      return {
        ok: false,
        content: null,
        httpStatus: res.status,
        errorMessage: `Storyblok API HTTP ${res.status}（トークン失効・スラッグ不存在等の可能性。推測で代替しない）`,
      }
    }
    const json = (await res.json()) as { story?: { content?: Record<string, unknown> } }
    const content = json.story?.content ?? null
    if (!content) {
      return { ok: false, content: null, httpStatus: res.status, errorMessage: 'Storyblok APIレスポンスにcontentが無い' }
    }
    return { ok: true, content, httpStatus: res.status, errorMessage: null }
  } catch (e) {
    return {
      ok: false,
      content: null,
      httpStatus: null,
      errorMessage: e instanceof Error ? e.message : String(e),
    }
  } finally {
    clearTimeout(timer)
  }
}
