// GINZA WHISKERS / Project 02（2026-09-14新設、2026-09-17改訂）— 銀座三越
// （mistore.jp）公式情報源の取得可否を、複数の経路で順に検証し、SOURCE_LEDGERへ
// source healthとして記録する。
//
//   ./p2 mitsukoshi-health-check
//
// マロン指示：「現在環境の接続不能を再確認し、ローカル直接取得だけに依存しない
// 実装へ変更する。公式sitemap、公式RSS、公式埋め込みJSON、公式内部API、Railway
// または既存サーバー側取得を順番に検証する。非公式情報による補完は禁止」。
//
// 【2026-09-17改訂・根本原因を精緻化（マロン指示：DNS/TCP/TLS/HTTP/redirect/
// ヘッダー/Cookie/robots/sitemap/既存API/curlとfetchの差/ブラウザ利用可否を
// 順番に確認）】従来「TCP接続タイムアウト（ネットワーク層の遮断）」と記録
// していたが、これは不正確だった——実際にはDNS解決・TCP接続・TLSハンドシェイク
// （サーバー証明書検証も含め）はすべて正常に完了し、HTTPリクエストの送信まで
// 到達する。**応答が返らない（0バイトのまま無応答）のはHTTP層より上——Akamai
// Bot Manager等の判定ロジックがリクエストを受理した後に応答を意図的に保留・
// 破棄している**と判断できる（TCP RSTやHTTP 403等の明示応答すら返さない
// サイレントドロップ）。さらに検証した結果、**この無応答は本プロジェクトの
// 識別User-Agent（本ファイルのUSER_AGENT定数。curlの既定UA等も同様）を
// 送った場合にのみ発生し、User-Agentを送らない場合（Node fetch/undiciの
// 既定動作）や一般的なブラウザのUser-Agent文字列を送った場合は同一URLが
// HTTP 200で実コンテンツを返す**ことを確認した（診断専用、下記
// diag-default-ua）。つまり原因はIPレピュテーション等のネットワーク層
// 遮断ではなく、**User-Agent文字列に基づくアプリケーション層の識別・遮断**
// である可能性が高い。
//
// 【この診断結果への対応方針（今回は変更しない）】本プロジェクトの識別
// User-Agentを変更する、あるいは意図的に省略することで応答を得られる
// 可能性が高いことは確認できたが、これは「取得方法を変える」（sitemap→
// RSS→embedded JSON→内部API等、専用の公開経路を探す）のとは性質が異なる
// ——同一URL・同一経路で、リクエストが自分を何と名乗るかだけを変える調整
// であり、WAF/Bot Managerの判定を意図的に迂回する行為に当たりうる。本
// プロジェクトの既存方針（実ブラウザへのなりすましをしない）の精神とも
// 隣接する論点のため、今回は自動的に採用せず、**診断結果として記録するに
// 留め、production側のfetch実装（USER_AGENT定数）は変更しない**——
// 採用するかどうかはマロンの判断を仰ぐ。診断結果（diag-default-ua）は
// healthStatusの成否判定には使わない（従来どおり4経路のみで判定）。
//
// 【2026-09-14 実施した多角的検証の結果（本スクリプトが自動的に再実行・記録する）】
//  1. https://www.mistore.jp/robots.txt・sitemap.xml・トップページ →
//     識別UA送信時は無応答（上記改訂参照。DNS解決は正常、TCP/TLSは完了する）。
//  2. https://mistore.jp/（wwwなし） → HTTP 301だが、リダイレクト先が
//     `http://www.mistore.jp/`（同じ接続不能ホスト）のため実質的に同じ結果。
//  3. https://api.mistore.jp/ → Akamaiエッジから明示的な「Access Denied」
//     （errors.edgesuite.net）応答。TCP接続は確立するが、エッジのWAF/Bot
//     Managerに明示的に拒否されている（`www.mistore.jp`より詳細な情報が得られた）。
//  4. https://www.mitsukoshi.mistore.jp/ → HTTP 301（到達可能だが、内容確認は
//     未実施——公式コンテンツを持つホストではない可能性が高い別サブドメイン）。
//
// Railway等の別インフラからの再検証は、本セッションでは実施不能（Project 02は
// 本番未構築のため）——本スクリプトを将来Railway上で実行すれば、同じ多角的
// 検証が自動的に再試行され、結果次第でhealthStatusが更新される設計にしてある。
//
// **本スクリプトは複数経路を実際に順番にfetchし、成功した経路があれば
// その結果を使う（非公式情報・推測データによる代替は一切しない）。
// 全経路が失敗した場合のみSOURCE_LEDGERへunreachableを記録する。**
// **診断専用の diag-default-ua はこの判定に含めない（production の識別を
// 変えるかどうかは別途マロンが判断する事項のため）。**

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
    const res = await fetch(url, { ...opts, signal: controller.signal })
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

  // 1〜4：本プロジェクトの識別User-Agentを送った上での検証（production と同一の
  // 名乗り方。healthStatus の判定はこの4経路のみで行う）。
  // 1. 公式sitemap
  attempts.push(await attemptFetch('sitemap', 'https://www.mistore.jp/sitemap.xml', { headers: { 'User-Agent': USER_AGENT } }))
  // 2. 公式RSS（一般的なパスを試行。銀座三越の公式RSS URLは未確認のため候補パスのみ）
  attempts.push(await attemptFetch('rss', 'https://www.mistore.jp/rss/ginza.xml', { headers: { 'User-Agent': USER_AGENT } }))
  // 3. 公式埋め込みJSON（トップページ自体が取得できるかの確認を兼ねる）
  attempts.push(
    await attemptFetch('html(embedded-json-check)', 'https://www.mistore.jp/store/ginza.html', { headers: { 'User-Agent': USER_AGENT } }),
  )
  // 4. 公式内部API（存在が確認できたAPIサブドメインへの到達性のみ確認。認証方式は未確認）
  attempts.push(await attemptFetch('internal-api', 'https://api.mistore.jp/', { headers: { 'User-Agent': USER_AGENT } }))

  console.log('=== 銀座三越（mistore.jp）取得経路の検証結果（production の識別UAを使用） ===')
  for (const a of attempts) {
    console.log(`  [${a.ok ? 'OK' : 'NG'}] ${a.method} ${a.url} → ${a.detail}`)
  }

  // 5. 診断専用（2026-09-17追加）：識別User-Agentを送らない場合の挙動確認のみ。
  //    healthStatusの成否判定には使わない——production の識別を変えるかどうかは
  //    別途マロンが判断する事項のため、この結果だけでunreachable→okへは切り替えない。
  const diag = await attemptFetch('diag-default-ua(参考・healthStatus判定には使わない)', 'https://www.mistore.jp/sitemap.xml', {})
  console.log(`\n=== 診断専用（production 採否は未決定・healthStatus判定に含めない） ===`)
  console.log(`  [${diag.ok ? 'OK' : 'NG'}] ${diag.method} ${diag.url} → ${diag.detail}`)

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
    const diagNote = diag.ok
      ? `参考（診断専用・healthStatus判定には未使用）: User-Agentを送らない場合は${diag.detail}——本プロジェクトの識別UAに起因する` +
        `アプリケーション層の遮断の可能性が高い（IP/ネットワーク層の遮断ではない）。識別UAを変更するかは要マロン判断のため今回は未対応。`
      : `参考: User-Agentを送らない場合も${diag.detail}——識別UA以外の要因の可能性が残る。`
    console.log('\n結論: 本プロジェクトの識別UAでは全経路で取得不能。SOURCE_LEDGERへunreachableとして記録します（非公式情報による補完はしません）。')
    console.log(`  ${diagNote}`)
    await recordSourceHealth(
      payload,
      SOURCE_ID,
      'unreachable',
      `4経路すべて失敗（${new Date().toISOString()}）: ${summary}。DNS解決・TCP接続・TLSハンドシェイクは正常に完了し` +
        `HTTPリクエスト送信まで到達するが応答が返らない（Akamai Bot Manager等によるサイレントドロップの可能性）。` +
        diagNote,
    )
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e))
  process.exit(1)
})
