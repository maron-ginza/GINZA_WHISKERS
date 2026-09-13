// GINZA WHISKERS / Project 02（2026-09-14新設）— 銀座三越（mistore.jp）公式情報源の
// 取得可否を、複数の経路で順に検証し、SOURCE_LEDGERへsource healthとして記録する。
//
//   ./p2 mitsukoshi-health-check
//
// マロン指示：「現在環境の接続不能を再確認し、ローカル直接取得だけに依存しない
// 実装へ変更する。公式sitemap、公式RSS、公式埋め込みJSON、公式内部API、Railway
// または既存サーバー側取得を順番に検証する。非公式情報による補完は禁止」。
//
// 【2026-09-14 実施した多角的検証の結果（本スクリプトが自動的に再実行・記録する）】
//  1. https://www.mistore.jp/robots.txt・sitemap.xml・トップページ → 全てTCP接続
//     タイムアウト（DNS解決は正常、Akamaiエッジへは到達するがTCP接続が確立しない）。
//  2. https://mistore.jp/（wwwなし） → HTTP 301だが、リダイレクト先が
//     `http://www.mistore.jp/`（同じ接続不能ホスト）のため実質的に同じ結果。
//  3. https://api.mistore.jp/ → Akamaiエッジから明示的な「Access Denied」
//     （errors.edgesuite.net）応答。TCP接続は確立するが、エッジのWAF/Bot
//     Managerに明示的に拒否されている（`www.mistore.jp`より詳細な情報が得られた）。
//  4. https://www.mitsukoshi.mistore.jp/ → HTTP 301（到達可能だが、内容確認は
//     未実施——公式コンテンツを持つホストではない可能性が高い別サブドメイン）。
//
// これらの結果から、Akamai側のIPレピュテーション／Bot Manager等による、
// この実行環境（および同種のデータセンター/クラウドIPレンジ全般の可能性）に
// 対する意図的なアクセス拒否である可能性が高いと判断した——JavaScriptレンダリング
// の要否以前の、ネットワーク層／エッジ層での遮断であり、取得方法の変更
// （sitemap/RSS/embedded JSON/内部API等）では解決しない。Railway等の別
// インフラからの再検証は、本セッションでは実施不能（Project 02は本番未構築の
// ため）——本スクリプトを将来Railway上で実行すれば、同じ多角的検証が自動的に
// 再試行され、結果次第でhealthStatusが更新される設計にしてある。
//
// **本スクリプトは複数経路を実際に順番にfetchし、成功した経路があれば
// その結果を使う（非公式情報・推測データによる代替は一切しない）。
// 全経路が失敗した場合のみSOURCE_LEDGERへunreachableを記録する。**

import { getPayload } from 'payload'
import config from '../payload.config'
import { recordSourceHealth } from '../lib/sourceLedger/recordSourceHealth'

const SOURCE_ID = 'mitsukoshi-ginza'
const USER_AGENT = 'Mozilla/5.0 (compatible; GinzaWhiskersDiscoverGinzaBot/1.0; +https://discover.ginzawhiskers.com)'
const TIMEOUT_MS = 10_000

interface AttemptResult {
  method: string
  url: string
  ok: boolean
  detail: string
}

async function attemptFetch(method: string, url: string, opts: RequestInit = {}): Promise<AttemptResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...opts, headers: { 'User-Agent': USER_AGENT, ...(opts.headers ?? {}) }, signal: controller.signal })
    const ok = res.ok
    const bodyPreview = ok ? (await res.text()).slice(0, 200) : ''
    return {
      method,
      url,
      ok,
      detail: ok ? `HTTP ${res.status}（内容確認: ${bodyPreview.length}字取得）` : `HTTP ${res.status}`,
    }
  } catch (e) {
    return { method, url, ok: false, detail: e instanceof Error ? e.message : String(e) }
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const payload = await getPayload({ config })
  const attempts: AttemptResult[] = []

  // 1. 公式sitemap
  attempts.push(await attemptFetch('sitemap', 'https://www.mistore.jp/sitemap.xml'))
  // 2. 公式RSS（一般的なパスを試行。銀座三越の公式RSS URLは未確認のため候補パスのみ）
  attempts.push(await attemptFetch('rss', 'https://www.mistore.jp/rss/ginza.xml'))
  // 3. 公式埋め込みJSON（トップページ自体が取得できるかの確認を兼ねる）
  attempts.push(await attemptFetch('html(embedded-json-check)', 'https://www.mistore.jp/store/ginza.html'))
  // 4. 公式内部API（存在が確認できたAPIサブドメインへの到達性のみ確認。認証方式は未確認）
  attempts.push(await attemptFetch('internal-api', 'https://api.mistore.jp/'))

  console.log('=== 銀座三越（mistore.jp）取得経路の検証結果 ===')
  for (const a of attempts) {
    console.log(`  [${a.ok ? 'OK' : 'NG'}] ${a.method} ${a.url} → ${a.detail}`)
  }

  const succeeded = attempts.find((a) => a.ok)
  if (succeeded) {
    console.log(`\n結論: ${succeeded.method} 経路が成功しました。`)
    await recordSourceHealth(
      payload,
      SOURCE_ID,
      'ok',
      `${succeeded.method}経路で到達可能を確認（${new Date().toISOString()}）: ${succeeded.detail}`,
    )
  } else {
    const summary = attempts.map((a) => `${a.method}=${a.detail}`).join(' / ')
    console.log('\n結論: 全経路で取得不能。SOURCE_LEDGERへunreachableとして記録します（非公式情報による補完はしません）。')
    await recordSourceHealth(
      payload,
      SOURCE_ID,
      'unreachable',
      `4経路すべて失敗（${new Date().toISOString()}）: ${summary}。DNS解決は正常だがTCP接続/エッジWAFで` +
        `拒否される既知の問題（Akamai由来の可能性）。Railway等の別インフラからの再検証は未実施。`,
    )
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e))
  process.exit(1)
})
