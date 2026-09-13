// GINZA WHISKERS / Project 02（2026-09-14新設）— JS描画が必要な公式ページの取得。
//
// 背景：松屋銀座公式サイト（matsuyaginza.com）はReact SPAで、通常のHTTP+HTML取得
// （fetchSource.ts / fetchArticlePage.ts）では常に空のシェルHTMLしか返らず、実際の
// 催事・商品情報はクライアントサイドで`api.matsuyaginza.com`から動的取得される。
// このモジュールは、そうした「HTTP+HTML取得では中身を取得できないと確認済みの
// サイト」にのみ限定的に使う代替経路——generic crawlingを置き換えるものではない。
//
// 実装方針：新しいブラウザバイナリは同梱・ダウンロードしない。playwright-core
// （軽量・ブラウザ本体を含まない）で、この端末に既にインストール済みの
// Google Chrome（Claude in Chrome機能導入時に導入済み）を直接起動する。
// Chromeが見つからない環境（本番Railway等、ブラウザ未導入のコンテナ）では
// 明示的に`featureUnavailable:true`を返し、呼び出し元は通常のHTTP取得へ
// フォールバックする（クラッシュしない・エラーを握りつぶさない）。

import { existsSync } from 'node:fs'

const CHROME_CANDIDATE_PATHS = [
  process.env.CHROME_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
  '/usr/bin/google-chrome', // Linux（Debian系）
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter((p): p is string => !!p)

/** 利用可能なChrome実行ファイルのパスを返す（無ければnull）。 */
export function findChromeExecutable(): string | null {
  for (const p of CHROME_CANDIDATE_PATHS) {
    if (existsSync(p)) return p
  }
  return null
}

export interface JsRenderedFetchResult {
  ok: boolean
  /** true＝この環境ではJSレンダリング取得の前提（Chrome/playwright-core）が無い */
  featureUnavailable: boolean
  text: string | null
  title: string | null
  finalUrl: string | null
  errorMessage: string | null
}

const USER_AGENT =
  'Mozilla/5.0 (compatible; GinzaWhiskersDiscoverGinzaBot/1.0; +https://discover.ginzawhiskers.com)'
const TIMEOUT_MS = 25_000

/**
 * URLを実際にブラウザで開き、レンダリング後の本文テキスト（document.body.innerText）
 * を返す。1回の呼び出しごとにブラウザを起動・終了する（常駐プロセスにしない——
 * 日次バッチの数件程度の呼び出し規模を想定した設計。高頻度呼び出しが必要になった
 * 場合はブラウザの使い回しを検討する）。
 */
export async function fetchJsRenderedPage(url: string): Promise<JsRenderedFetchResult> {
  const executablePath = findChromeExecutable()
  if (!executablePath) {
    return {
      ok: false,
      featureUnavailable: true,
      text: null,
      title: null,
      finalUrl: null,
      errorMessage:
        'Chrome実行ファイルが見つからないため、この環境ではJSレンダリング取得を利用できません（通常のHTTP取得へフォールバック）',
    }
  }

  let chromiumMod: typeof import('playwright-core')
  try {
    chromiumMod = await import('playwright-core')
  } catch {
    return {
      ok: false,
      featureUnavailable: true,
      text: null,
      title: null,
      finalUrl: null,
      errorMessage: 'playwright-core が利用できません（未インストールまたは読み込み失敗）',
    }
  }

  let browser: import('playwright-core').Browser | undefined
  try {
    browser = await chromiumMod.chromium.launch({ executablePath, headless: true })
    const page = await browser.newPage({ userAgent: USER_AGENT })
    await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUT_MS })
    const title = await page.title()
    const text = await page.evaluate(() => document.body.innerText)
    const finalUrl = page.url()
    return { ok: true, featureUnavailable: false, text, title, finalUrl, errorMessage: null }
  } catch (e) {
    return {
      ok: false,
      featureUnavailable: false,
      text: null,
      title: null,
      finalUrl: null,
      errorMessage: e instanceof Error ? e.message : String(e),
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
