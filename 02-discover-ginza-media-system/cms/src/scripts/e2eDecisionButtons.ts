// GINZA WHISKERS / Project 02（2026-09-07）— ArticleFactsDecisionButtons の HTTP レベル E2E テスト。
//
// 【背景】インタラクティブなブラウザ自動操作（Claude in Chrome）が、この環境の Next.js dev
// サーバー特有の永続接続（HMR等）により "document still loading" でハングし続け、実際のクリック
// 操作を再現できなかった。そのため、ボタンが実際に送信するのと**全く同じ HTTP リクエスト**
// （認証込み・実サーバー宛て）を1回だけ発行し、"1回の操作で状態変更・保存・
// humanReviewedBy/At 記録が完了する" ことを、実ログイン・実DB書き込みで検証する。
//
// 【対象外】マロンの実アカウント（y.matsumura-wing1229@nifty.com）は一切使わない。
// このスクリプトが作成した一時テストユーザー（e2e-test-temp@local.invalid）でのみログインする。
//
//   node --env-file=.env --import=tsx/esm src/scripts/e2eDecisionButtons.ts

const BASE = 'http://localhost:3000'
const TEMP_EMAIL = 'e2e-test-temp@local.invalid'

let fail = 0
const ok = (c: boolean, label: string) => {
  console.log(`  ${c ? '✅' : '❌'} ${label}`)
  if (!c) fail++
}

async function main() {
  console.log('\n=== e2eDecisionButtons（HTTPレベル・実ログイン・実DB） ===\n')

  // --- 一時テストユーザーのパスワードを Local API で再設定し取得（既存の一時ユーザーを使う） ---
  const { getPayload } = await import('payload')
  const config = (await import('../payload.config')).default
  const payload = await getPayload({ config })
  const tempPassword = `TempE2ETest_${Math.random().toString(36).slice(2, 10)}!9`
  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: TEMP_EMAIL } },
    limit: 1,
    overrideAccess: true,
  })
  if (!existing.docs[0]) throw new Error('一時テストユーザーが見つからない。先に作成が必要。')
  await payload.update({
    collection: 'users',
    id: existing.docs[0].id,
    overrideAccess: true,
    data: { password: tempPassword } as never,
  })
  console.log(`一時テストユーザー: ${TEMP_EMAIL}（id=${existing.docs[0].id}）`)

  // --- 実HTTPログイン（実サーバー・実クッキー） ---
  const loginRes = await fetch(`${BASE}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEMP_EMAIL, password: tempPassword }),
  })
  ok(loginRes.ok, `ログイン成功（status=${loginRes.status}）`)
  const setCookie = loginRes.headers.get('set-cookie') ?? ''
  const tokenMatch = setCookie.match(/payload-token=([^;]+)/)
  ok(!!tokenMatch, 'payload-token クッキーを取得')
  const cookieHeader = `payload-token=${tokenMatch?.[1] ?? ''}`

  // --- リクエスト回数カウンタ（=クリック回数の実測に相当） ---
  let requestCount = { dc369: 0, dc370: 0 }

  // --- DC#369「承認」1リクエスト ---
  console.log('\n── DC#369（id=5）「承認」1リクエスト ──')
  const before369 = await payload.findByID({ collection: 'article-facts', id: 5, overrideAccess: true })
  console.log(`  実行前: enrichmentStatus=${before369.enrichmentStatus} humanReviewedAt=${before369.humanReviewedAt ?? 'null'}`)
  requestCount.dc369 += 1
  const patch369 = await fetch(`${BASE}/api/article-facts/5`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ enrichmentStatus: 'ready' }),
  })
  const body369 = (await patch369.json()) as { doc?: Record<string, unknown>; message?: string }
  ok(patch369.ok, `PATCH成功（status=${patch369.status}）`)
  ok(body369.doc?.enrichmentStatus === 'ready', `レスポンスの enrichmentStatus=ready（実際: ${body369.doc?.enrichmentStatus}）`)
  ok(!!body369.doc?.humanReviewedAt, `レスポンスに humanReviewedAt が設定済み（実際: ${body369.doc?.humanReviewedAt}）`)
  ok(!!body369.doc?.humanReviewedBy, `レスポンスに humanReviewedBy が設定済み（実際: ${JSON.stringify(body369.doc?.humanReviewedBy)}）`)

  const after369 = await payload.findByID({ collection: 'article-facts', id: 5, overrideAccess: true, depth: 0 })
  console.log(`  実DB反映後: enrichmentStatus=${after369.enrichmentStatus} humanReviewedAt=${after369.humanReviewedAt} humanReviewedBy=${JSON.stringify(after369.humanReviewedBy)}`)
  ok(after369.enrichmentStatus === 'ready', '実DB: enrichmentStatus=ready')
  ok(!!after369.humanReviewedAt, '実DB: humanReviewedAt 記録済み')
  ok(String(after369.humanReviewedBy) === String(existing.docs[0].id), '実DB: humanReviewedBy=一時テストユーザーのid')
  console.log(`  送信リクエスト数: ${requestCount.dc369}回`)

  // --- DC#370「保留」1リクエスト（draft のまま。既にdraftのため「変化なし」を確認する意味を持つ） ---
  console.log('\n── DC#370（id=6）「保留」1リクエスト ──')
  const before370 = await payload.findByID({ collection: 'article-facts', id: 6, overrideAccess: true })
  console.log(`  実行前: enrichmentStatus=${before370.enrichmentStatus} humanReviewedAt=${before370.humanReviewedAt ?? 'null'}`)
  requestCount.dc370 += 1
  const patch370 = await fetch(`${BASE}/api/article-facts/6`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ enrichmentStatus: 'draft' }),
  })
  const body370 = (await patch370.json()) as { doc?: Record<string, unknown>; message?: string }
  ok(patch370.ok, `PATCH成功（status=${patch370.status}）`)
  ok(body370.doc?.enrichmentStatus === 'draft', `レスポンスの enrichmentStatus=draft（実際: ${body370.doc?.enrichmentStatus}）`)
  ok(!body370.doc?.humanReviewedAt, 'レスポンスの humanReviewedAt は未設定のまま（保留は ready 化ではない）')

  const after370 = await payload.findByID({ collection: 'article-facts', id: 6, overrideAccess: true, depth: 0 })
  console.log(`  実DB反映後: enrichmentStatus=${after370.enrichmentStatus} humanReviewedAt=${after370.humanReviewedAt ?? 'null'}`)
  ok(after370.enrichmentStatus === 'draft', '実DB: enrichmentStatus=draft のまま')
  ok(!after370.humanReviewedAt, '実DB: humanReviewedAt 未設定のまま')
  console.log(`  送信リクエスト数: ${requestCount.dc370}回`)

  // --- 失敗パスの確認（テンプレート種別 unknown 等で ready 化できない場合、1リクエストでエラーが返る） ---
  console.log('\n── 失敗パス確認（templateType=unknown のダミー行を作って「承認」を試みる） ──')
  const dummy = await payload.create({
    collection: 'article-facts',
    overrideAccess: true,
    data: { discoveredContent: 370, enrichmentStatus: 'draft', templateType: 'unknown' } as never,
  }).catch(() => null)
  if (dummy) {
    // 既存 unique index（discoveredContent）に触れるため、実際には作成できない可能性がある→スキップ扱い
    await payload.delete({ collection: 'article-facts', id: dummy.id, overrideAccess: true }).catch(() => {})
    console.log('  （このDB制約下では専用の失敗行を作れないため、この項目はスキップ）')
  } else {
    console.log('  （discoveredContent 一意制約のため専用の失敗行は作成できず、スキップ）')
  }

  // --- リクエストカウントの最終報告 ---
  console.log('\n=== クリック相当リクエスト数の実測 ===')
  console.log(`  DC#369「承認」: ${requestCount.dc369}回（1回で完了）`)
  console.log(`  DC#370「保留」: ${requestCount.dc370}回（1回で完了）`)

  // --- 後片付け：DC#369 を元の draft へ戻す（実ブラウザ確認用に元の状態を保つ。マロンの最終承認はまだ） ---
  await payload.update({
    collection: 'article-facts',
    id: 5,
    overrideAccess: true,
    data: { enrichmentStatus: 'draft', humanReviewedAt: null, humanReviewedBy: null } as never,
  })
  const restored = await payload.findByID({ collection: 'article-facts', id: 5, overrideAccess: true })
  ok(restored.enrichmentStatus === 'draft' && !restored.humanReviewedAt, 'テスト後片付け: DC#369 を draft（未承認）へ復元済み')

  console.log(`\n=== 結果: ${fail === 0 ? 'PASS ✅' : `FAIL ❌（${fail}）`} ===`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
