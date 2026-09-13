// GINZA WHISKERS / Project 02（2026-09-14）— note下書き自動転記サーバー。
//
// 【背景】Claude in Chrome の script injection（オンデマンドJS注入）は
// note.com のSPAへ対して繰り返しタイムアウトし（2026-09-02・2026-09-13で再現）、
// マロン指示によりこの経路の使用・再試行を今後禁止した。代わりに、Chrome拡張
// （`chrome-extension/`、マニフェストの content_scripts で note.com/notes/new への
// 遷移時に自動注入される——Claude in Chromeのオンデマンド注入とは別の仕組みで、
// 同じタイムアウトの再発を避ける）から直接叩けるローカルHTTPサーバーとして
// このモジュールを新設する。
//
// 【役割】
//   1. GET  /api/note-transfer/pending … 承認済み（reviewStatus=approved）かつ
//      未転記のArticleを1件返す（note-draft.jsonの内容そのまま＋カテゴリー
//      アイコンのURL）。返した時点でstatusを'in_progress'にし、同時に複数タブが
//      同じ記事を掴まないようにする（二重転記防止の第一段）。
//   2. POST /api/note-transfer/result … 拡張が転記結果（成功／失敗）を報告する。
//      成功時はstatus='success'として記録し、以後 /pending は同じarticleIdを
//      二度と返さない（二重転記防止の第二段）。失敗時はattemptsを加算し、
//      3回失敗したら'failed'として以後 /pending からも除外する（同じ操作を
//      3回より多く繰り返さない）。
//   3. GET  /api/note-transfer/status … 状態を人間が確認するための読み取り専用API
//      （`./p2 note-transfer status` から利用）。
//   4. GET  /assets/:file … カテゴリーアイコン画像を配信する（許可された
//      ファイル名のみ、ディレクトリトラバーサル対策込み）。
//
// 【安全境界】127.0.0.1のみで待ち受け（外部ネットワーク非公開）。公開（note側の
// 「公開する」操作）はこのサーバー・拡張のどちらからも一切トリガーしない
// （下書き保存のみを対象とする設計、Chrome拡張のガードレールと二重）。
// マロンのnote.comログインセッション（実ブラウザCookie）をそのまま使うだけで、
// このサーバー自身はログイン情報を一切扱わない。
//
//   node --env-file=.env --import=tsx/esm src/scripts/noteTransferServer.ts [--port=4601]

import { getPayload, type Payload } from 'payload'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { resolve, extname } from 'node:path'

import config from '../payload.config'
import {
  selectNextPendingArticleId,
  claimInProgress,
  recordSuccess,
  recordFailure,
  MAX_TRANSFER_ATTEMPTS,
  type TransferState,
} from '../lib/night/noteTransferState'

const ROOT = resolve(process.cwd(), '..')
const argv = process.argv.slice(2)
const PORT = Number((argv.find((a) => a.startsWith('--port=')) ?? '').split('=')[1]) || 4601
const MAX_ATTEMPTS = MAX_TRANSFER_ATTEMPTS

const QUEUE_DIR = resolve(ROOT, '.devlogs', 'night', 'queue')
const STATE_PATH = resolve(ROOT, '.devlogs', 'night', 'transfer-state.json')
const ICON_DIR = resolve(ROOT, 'media', 'discover-ginza-category-icons')
const DIAGNOSTIC_LOG_PATH = resolve(ROOT, '.devlogs', 'night', 'note-transfer-diagnostic.jsonl')

// 2026-09-14続き（実機検証失敗の調査）：実ブラウザでの1回目の実機検証が
// 「拡張再読み込み後も0文字・transfer-stateは空のまま」で失敗し、原因調査に
// あたって「拡張側で何が起きたか」を見る手段が無かった（Service Worker・
// content scriptのconsole.logはブラウザのDevTools側にしか出ず、この開発環境
// からは見えない）。そこで、①全HTTPリクエストをアクセスログとして記録し、
// ②拡張（background.js／content.js）が能動的に送ってくる段階別診断ログを
// 受け取るエンドポイントを追加し、次回以降は実ブラウザに触れなくても
// .devlogs/night/ の中身だけで「拡張が実際に何をしたか」を追跡できるようにする。
function appendDiagnosticLog(entry: Record<string, unknown>): void {
  try {
    mkdirSync(resolve(ROOT, '.devlogs', 'night'), { recursive: true })
    appendFileSync(DIAGNOSTIC_LOG_PATH, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n', 'utf8')
  } catch {
    // 診断ログの書き込み失敗自体でサーバーを止めない。
  }
}

function loadState(): TransferState {
  if (!existsSync(STATE_PATH)) return {}
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as TransferState
  } catch {
    return {}
  }
}
function saveState(state: TransferState): void {
  mkdirSync(resolve(ROOT, '.devlogs', 'night'), { recursive: true })
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8')
}

/** .devlogs/night/queue/**\/<articleId>/note-draft.json を全件走査する（新しい日付優先）。 */
function findNoteDraftFiles(): { articleId: number; path: string; date: string }[] {
  if (!existsSync(QUEUE_DIR)) return []
  const out: { articleId: number; path: string; date: string }[] = []
  for (const dateDir of readdirSync(QUEUE_DIR).sort().reverse()) {
    const dateDirPath = resolve(QUEUE_DIR, dateDir)
    if (!statSync(dateDirPath).isDirectory()) continue
    for (const idDir of readdirSync(dateDirPath)) {
      const p = resolve(dateDirPath, idDir, 'note-draft.json')
      const articleId = Number(idDir)
      if (Number.isFinite(articleId) && existsSync(p)) {
        out.push({ articleId, path: p, date: dateDir })
      }
    }
  }
  return out
}

async function findPendingTransfer(
  payload: Payload,
): Promise<{ articleId: number; draftPath: string } | null> {
  const state = loadState()
  const files = findNoteDraftFiles()
  const seen = new Set<number>()
  const dedupedIds: number[] = []
  const pathByArticleId = new Map<number, string>()
  for (const f of files) {
    if (seen.has(f.articleId)) continue // 同一articleIdは最新日付の1件のみ対象
    seen.add(f.articleId)
    dedupedIds.push(f.articleId)
    pathByArticleId.set(f.articleId, f.path)
  }

  // 二重転記防止・3回リトライ上限の判定は純粋関数（noteTransferState.ts）に委譲する。
  // ここでは承認済みかどうかを候補の中から順に確認するだけ。
  let cursor = 0
  while (cursor < dedupedIds.length) {
    const remaining = dedupedIds.slice(cursor)
    const candidateId = selectNextPendingArticleId(state, remaining)
    if (candidateId == null) return null
    cursor = dedupedIds.indexOf(candidateId) + 1

    // 承認済みかどうかをPayloadへ直接確認する（ファイルの存在だけで判定しない）
    let article: { reviewStatus?: string } | null = null
    try {
      article = (await payload.findByID({
        collection: 'articles',
        id: candidateId,
        depth: 0,
        overrideAccess: true,
        locale: 'ja',
      })) as unknown as { reviewStatus?: string }
    } catch {
      continue
    }
    if (!article || article.reviewStatus !== 'approved') continue
    return { articleId: candidateId, draftPath: pathByArticleId.get(candidateId)! }
  }
  return null
}

function jsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolvePromise, reject) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      try {
        resolvePromise(body ? JSON.parse(body) : {})
      } catch (e) {
        reject(e)
      }
    })
  })
}

function withCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

async function main() {
  const payload = await getPayload({ config })

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    withCors(res)
    // 全リクエストのアクセスログ（拡張が実際にこのサーバーへ到達しているか自体を
    // 追跡するため。実機検証1回目失敗の原因調査で「拡張からのリクエストが
    // そもそも来ていたか」が分からなかった反省を踏まえた恒久対応）。
    console.log(`[note-transfer] ${new Date().toISOString()} ${req.method} ${req.url}`)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

    if (req.method === 'GET' && url.pathname === '/api/note-transfer/pending') {
      void (async () => {
        try {
          const pending = await findPendingTransfer(payload)
          appendDiagnosticLog({ source: 'server', event: 'pending_queried', articleId: pending?.articleId ?? null })
          if (!pending) {
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: true, item: null }))
            return
          }
          const state = loadState()
          const prevAttempts = state[String(pending.articleId)]?.attempts ?? 0
          saveState(claimInProgress(state, pending.articleId))

          const draft = JSON.parse(readFileSync(pending.draftPath, 'utf8'))
          const iconFile: string | undefined = draft?.masthead?.categoryIcon?.iconFile
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(
            JSON.stringify({
              ok: true,
              item: {
                articleId: pending.articleId,
                title: draft.title,
                body: draft.body,
                hashtags: draft.noteMeta?.hashtags ?? [],
                categoryIcon: iconFile
                  ? {
                      url: `http://localhost:${PORT}/assets/${encodeURIComponent(iconFile)}`,
                      caption: draft.noteMeta?.illustrationCaption ?? null,
                      labelJa: draft.noteMeta?.categoryIcon?.labelJa ?? null,
                    }
                  : null,
                heroImage: {
                  available: false,
                  brief:
                    (draft.images ?? []).find((im: any) => im.role === 'hero')?.note ?? null,
                  caption: (draft.images ?? []).find((im: any) => im.role === 'hero')?.caption ?? null,
                },
                attempt: prevAttempts + 1,
                maxAttempts: MAX_ATTEMPTS,
              },
            }),
          )
        } catch (e) {
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }))
        }
      })()
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/note-transfer/result') {
      void (async () => {
        try {
          const body = await jsonBody(req)
          const articleId = Number(body.articleId)
          if (!Number.isFinite(articleId)) {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'articleId が不正です' }))
            return
          }
          appendDiagnosticLog({ source: 'server', event: 'result_received', articleId, status: body.status, error: body.error, draftUrl: body.draftUrl })
          const state = loadState()

          if (body.status === 'success') {
            const draftUrl = typeof body.draftUrl === 'string' ? body.draftUrl : undefined
            saveState(recordSuccess(state, articleId, draftUrl, new Date().toISOString()))

            // 注：Articles.publishHistory は書き換えない。既存の channel enum
            // （site/note/x/instagram/newsletter）は「実際の公開」を表す値のみで、
            // 「note下書きへの転記」はそれとは異なる概念のため、既存フィールドへ
            // 混同して書き込むとpublished判定・重複判定ロジックを誤らせる恐れがある。
            // 転記済みの記録はこのサーバーのstate（transfer-state.json）を正とする。

            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: true }))
            return
          }

          // 失敗報告
          const errorMessage = typeof body.error === 'string' ? body.error : '不明なエラー'
          const { state: nextState, exhausted, attempts } = recordFailure(
            state,
            articleId,
            errorMessage,
            new Date().toISOString(),
          )
          saveState(nextState)
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true, exhausted, attempts }))
        } catch (e) {
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }))
        }
      })()
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/note-transfer/log') {
      // 拡張（background.js／content.js）からの段階別診断ログを受け取り、
      // .devlogs/night/note-transfer-diagnostic.jsonl へ追記するだけの
      // 読み取り専用寄りエンドポイント（state（成否判定）には一切影響しない）。
      void (async () => {
        try {
          const body = await jsonBody(req)
          appendDiagnosticLog({ source: 'extension', ...body })
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch (e) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }))
        }
      })()
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/note-transfer/status') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, state: loadState() }, null, 2))
      return
    }

    if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
      const name = decodeURIComponent(url.pathname.slice('/assets/'.length))
      // ディレクトリトラバーサル対策：ファイル名に区切り文字を含む場合は拒否し、
      // 実際にICON_DIR配下に存在する許可済みファイルのみ配信する。
      if (!name || name.includes('/') || name.includes('..')) {
        res.writeHead(400)
        res.end('bad request')
        return
      }
      const filePath = resolve(ICON_DIR, name)
      if (!filePath.startsWith(ICON_DIR) || !existsSync(filePath)) {
        res.writeHead(404)
        res.end('not found')
        return
      }
      const ext = extname(filePath).toLowerCase()
      const contentType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream'
      res.writeHead(200, { 'content-type': contentType })
      res.end(readFileSync(filePath))
      return
    }

    res.writeHead(404)
    res.end('not found')
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[note-transfer] http://localhost:${PORT} で待ち受け中（127.0.0.1のみ・外部非公開）`)
    console.log(`[note-transfer] state: ${STATE_PATH}`)
  })
}

void main()
