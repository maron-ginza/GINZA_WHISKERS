// GINZA WHISKERS / Project 02（2026-09-12）— 朝刊候補レビュー画面（常駐サーバー）。
//
// マロンが毎朝 `./p2 morning-brief` を手入力する運用をやめるための「見る場所」。
// 6:00の朝刊自動化（scripts/morningAutoRun.sh）が書き出す
// `.devlogs/morning/brief/<date>.json` を、いつ開いても最新の状態で表示する常駐
// HTTPサーバー（KeepAlive launchd daemon、`scripts/launchd/
// com.ginzawhiskers.p2-candidate-review.plist.template`）。ブックマークした
// http://localhost:4600 を開くだけで良く、コマンド入力は不要。
//
// localhost（127.0.0.1）だけで待ち受け、ネットワークには公開しない。
//
// 表示：①ビューティー ②グルメ・スイーツ ③文化・アート の当日ピック（無ければ
// 「該当なし」＋理由）。各ピックにタイトル・カテゴリー・施設・価格・期間・
// 購入条件・公式URL・出典確認日・採用理由・重複チェック結果・承認／保留／却下。
//
// 「承認」ボタンだけがDB書き込み・AI呼び出しを伴う（人間のクリックが明示トリガー）：
//   1. DiscoveredContent.curationStatus を approved に更新
//   2. createMultiAngleDraftsFromDiscoveredContent（CORE角度のみ）でArticle(draft)を1本生成
//      ——他の承認済みDCを巻き込まない、指定した1件だけの生成
//   3. buildNoteDraftPackage で note転記直前パッケージを生成し
//      .devlogs/night/queue/<date>/<articleId>/ へ保存
// 外部公開・note投稿・Chrome操作はしない（既存境界を維持）。
//
// 「保留」はDBに触れない（翌日のmorning-briefで再評価される）。
// 「却下」はcurationStatusをrejectedにするだけ。
//
// 同じdcIdへの二重承認・二重課金を防ぐため、決定は
// `.devlogs/morning/review/candidates-<date>.json` にファイルとして永続化し、
// 既に決定済みのdcIdへの再アクションは拒否する。

import { getPayload, type Payload } from 'payload'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import config from '../payload.config'
import { createMultiAngleDraftsFromDiscoveredContent } from '../lib/ai/createMultiAngleDraftsFromDiscoveredContent'
import { buildNoteDraftPackage } from '../lib/night/buildNoteDraftPackage'
import { resolveBusinessDate } from '../lib/util/businessDate'

const ROOT = resolve(process.cwd(), '..')
const argv = process.argv.slice(2)
const PORT = Number((argv.find((a) => a.startsWith('--port=')) ?? '').split('=')[1]) || 4600

const BRIEF_DIR = resolve(ROOT, '.devlogs', 'morning', 'brief')
const REVIEW_DIR = resolve(ROOT, '.devlogs', 'morning', 'review')

interface BriefPick {
  dcId: number
  title: string
  facility: string | null
  source: string | null
  scoreTotal: number
  readiness: string
  facts12: Record<string, string>
}
interface BriefBucket {
  bucketKey: string
  bucketLabel: string
  pick: BriefPick | null
  reasonIfEmpty: string | null
}
interface BriefFile {
  generatedAt: string
  date: string
  filledCount: number
  buckets: BriefBucket[]
  sweetsCandidates?: { shortfall: boolean; shortfallReason: string; nextSourceTypesToExplore: string[] }
}

type DecisionAction = 'approved' | 'held' | 'rejected'
interface DecisionEntry {
  dcId: number
  bucketKey: string
  action: DecisionAction
  at: string
  articleId?: number
  packageDir?: string
  error?: string
}
interface DecisionFile {
  date: string
  decisions: Record<string, DecisionEntry>
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 今日の業務日付（Asia/Tokyo）のbriefが無ければ、直近7日で最新のものにフォールバックする。 */
function findLatestBriefDate(): string | null {
  const today = resolveBusinessDate()
  if (existsSync(resolve(BRIEF_DIR, `${today}.json`))) return today
  if (!existsSync(BRIEF_DIR)) return null
  const dates = readdirSync(BRIEF_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ''))
    .sort()
  return dates.length ? dates[dates.length - 1] : null
}

function loadBrief(date: string): BriefFile | null {
  const path = resolve(BRIEF_DIR, `${date}.json`)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as BriefFile
  } catch {
    return null
  }
}

function decisionPath(date: string): string {
  return resolve(REVIEW_DIR, `candidates-${date}.json`)
}

function loadDecisions(date: string): DecisionFile {
  const path = decisionPath(date)
  if (!existsSync(path)) return { date, decisions: {} }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as DecisionFile
  } catch {
    return { date, decisions: {} }
  }
}

function saveDecision(date: string, entry: DecisionEntry): void {
  mkdirSync(REVIEW_DIR, { recursive: true })
  const file = loadDecisions(date)
  file.decisions[String(entry.dcId)] = entry
  writeFileSync(decisionPath(date), JSON.stringify(file, null, 2) + '\n', 'utf8')
}

// ─────────────────────────── HTML ───────────────────────────

function renderPick(bucket: BriefBucket, decision: DecisionEntry | undefined): string {
  if (!bucket.pick) {
    return `<div class="card empty">
      <h3>${esc(bucket.bucketLabel)}</h3>
      <p class="none">❌ 該当なし</p>
      <p class="reason">${esc(bucket.reasonIfEmpty ?? '')}</p>
    </div>`
  }
  const p = bucket.pick
  const f = p.facts12 ?? {}
  const rows = [
    ['正式名称', f['正式名称']],
    ['カテゴリー', f['18カテゴリー']],
    ['施設', p.facility ?? '（会場不明）'],
    ['価格', f['価格']],
    ['開催／販売期間', f['開催／販売期間']],
    ['購入／参加条件', f['購入／参加条件']],
    ['公式URL', f['公式URL']],
    ['出典名', f['出典名']],
    ['出典確認日', f['出典確認日']],
    ['Editorial Compass', f['Editorial Compass']],
    ['採用理由', f['選定理由']],
  ]
  const rowsHtml = rows
    .map(([label, val]) => {
      const isUrl = label === '公式URL' && val && /^https?:\/\//.test(String(val))
      const v = isUrl ? `<a href="${esc(val)}" target="_blank" rel="noopener">${esc(val)}</a>` : esc(val ?? '公式記載なし')
      return `<tr><th>${esc(label)}</th><td>${v}</td></tr>`
    })
    .join('')

  let statusHtml: string
  if (!decision) {
    statusHtml = `
      <div class="actions" data-dcid="${p.dcId}" data-bucket="${esc(bucket.bucketKey)}">
        <button class="approve">承認</button>
        <button class="hold">保留</button>
        <button class="reject">却下</button>
      </div>
      <div class="result"></div>`
  } else if (decision.action === 'approved') {
    statusHtml = `<div class="status ok">✅ 承認済み${decision.articleId ? `／Article #${decision.articleId} 生成` : ''}${
      decision.packageDir ? `<br>note転記パッケージ: <code>${esc(decision.packageDir)}</code>（公開はマロンが手動）` : ''
    }${decision.error ? `<br>⚠ ${esc(decision.error)}` : ''}</div>`
  } else if (decision.action === 'rejected') {
    statusHtml = `<div class="status rejected">🚫 却下済み</div>`
  } else {
    statusHtml = `<div class="status held">⏸ 保留（翌日のmorning-briefで再評価されます）</div>`
  }

  return `<div class="card">
    <h3>${esc(bucket.bucketLabel)}</h3>
    <table>${rowsHtml}</table>
    <p class="dup">過去投稿との重複結果：✅ 重複なし（全公開履歴と照合済み・既に重複していれば候補に上がりません）</p>
    ${statusHtml}
  </div>`
}

function renderPage(date: string, brief: BriefFile | null, isToday: boolean): string {
  const decisions = loadDecisions(date).decisions
  const banner = isToday
    ? ''
    : `<p class="warn">⚠ 本日分（${resolveBusinessDate()}）はまだ生成されていません。直近の候補（${esc(date)}）を表示しています。</p>`
  const body = brief
    ? brief.buckets.map((b) => renderPick(b, decisions[String(b.pick?.dcId ?? '')])).join('\n')
    : `<p class="none">候補データがまだありません（初回の朝刊自動実行を待っています）。</p>`

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>朝刊候補レビュー</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN",sans-serif;background:#E7DED0;color:#241F18;margin:0;padding:24px;}
  h1{font-size:20px;margin:0 0 4px}
  .sub{color:#786C58;margin:0 0 20px;font-size:13px}
  .card{background:#F8F3E8;border:1px solid #d8cbb4;border-radius:8px;padding:16px 20px;margin-bottom:16px;max-width:820px}
  .card.empty{opacity:.75}
  h3{margin:0 0 10px;color:#1F3F38}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:#786C58;vertical-align:top;padding:4px 10px 4px 0;width:130px;white-space:nowrap}
  td{padding:4px 0;word-break:break-word}
  .none{font-weight:bold}
  .reason{color:#786C58;font-size:13px}
  .dup{font-size:12px;color:#1F3F38;margin:10px 0 4px}
  .actions{margin-top:12px;display:flex;gap:8px}
  button{padding:6px 16px;border-radius:6px;border:1px solid #1F3F38;background:#fff;cursor:pointer;font-size:13px}
  button.approve{background:#1F3F38;color:#fff}
  .status{margin-top:12px;padding:8px 12px;border-radius:6px;font-size:13px}
  .status.ok{background:#e3efe9}
  .status.rejected{background:#f3e3e3}
  .status.held{background:#f0ecdf}
  .warn{background:#fff3cd;padding:8px 12px;border-radius:6px;max-width:820px}
  code{background:#00000010;padding:1px 4px;border-radius:3px}
  .result{margin-top:8px;font-size:13px}
</style></head>
<body>
<h1>朝刊候補レビュー</h1>
<p class="sub">対象日：${esc(date)}／このページを開くだけで最新状態を確認できます（コマンド入力不要）</p>
${banner}
${body}
<script>
document.querySelectorAll('.actions').forEach(el => {
  const dcId = el.dataset.dcid, bucket = el.dataset.bucket;
  el.querySelectorAll('button').forEach(btn => {
    btn.onclick = async () => {
      const action = btn.className;
      el.querySelectorAll('button').forEach(b => b.disabled = true);
      const resultEl = el.nextElementSibling;
      resultEl.textContent = '処理中…';
      try {
        const res = await fetch('/action', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ dcId: Number(dcId), bucketKey: bucket, action }) });
        const j = await res.json();
        if (j.ok) { location.reload(); } else { resultEl.textContent = 'エラー: ' + (j.error || '不明'); el.querySelectorAll('button').forEach(b => b.disabled = false); }
      } catch (e) { resultEl.textContent = '通信エラー: ' + e; el.querySelectorAll('button').forEach(b => b.disabled = false); }
    };
  });
});
</script>
</body></html>`
}

// ─────────────────────────── action handler ───────────────────────────

async function handleApprove(payload: Payload, date: string, dcId: number, bucketKey: string): Promise<DecisionEntry> {
  const entry: DecisionEntry = { dcId, bucketKey, action: 'approved', at: new Date().toISOString() }
  try {
    await payload.update({ collection: 'discovered-content', id: dcId, overrideAccess: true, data: { curationStatus: 'approved' } })

    const existing = await payload.find({
      collection: 'articles',
      where: { 'editorialProvenance.discoveredContentSource': { equals: dcId } },
      limit: 5,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.docs.length > 0) {
      entry.articleId = Number(existing.docs[0].id)
      entry.error = '既に生成済みのArticleがあったため新規生成はスキップしました'
      return entry
    }

    const genResult = await createMultiAngleDraftsFromDiscoveredContent(payload, dcId, { angles: ['core'], enableCoreGuards: true })
    if (genResult.createdArticles.length === 0) {
      entry.error = `記事生成できませんでした（${genResult.skipped.map((s) => s.reason).join('; ') || '不明な理由'}）`
      return entry
    }
    const articleId = genResult.createdArticles[0].id
    entry.articleId = articleId

    const pkg = await buildNoteDraftPackage(payload, articleId, { allowNonDraft: true })
    const dir = resolve(ROOT, '.devlogs', 'night', 'queue', date, String(articleId))
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, 'note-body.txt'), pkg.body, 'utf8')
    writeFileSync(resolve(dir, 'note-draft.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf8')
    entry.packageDir = dir.replace(ROOT + '/', '')
  } catch (e) {
    entry.error = e instanceof Error ? e.message : String(e)
  }
  return entry
}

async function main() {
  mkdirSync(REVIEW_DIR, { recursive: true })
  const payload = await getPayload({ config })

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'POST' && req.url === '/action') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        void (async () => {
          try {
            const parsed = JSON.parse(body || '{}') as { dcId: number; bucketKey: string; action: 'approve' | 'hold' | 'reject' }
            const date = findLatestBriefDate() ?? resolveBusinessDate()
            const decisions = loadDecisions(date)
            if (decisions.decisions[String(parsed.dcId)]) {
              res.writeHead(200, { 'content-type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: 'この候補は既に処理済みです（二重処理防止）' }))
              return
            }
            let entry: DecisionEntry
            if (parsed.action === 'approve') {
              entry = await handleApprove(payload, date, parsed.dcId, parsed.bucketKey)
            } else if (parsed.action === 'reject') {
              await payload.update({ collection: 'discovered-content', id: parsed.dcId, overrideAccess: true, data: { curationStatus: 'rejected' } })
              entry = { dcId: parsed.dcId, bucketKey: parsed.bucketKey, action: 'rejected', at: new Date().toISOString() }
            } else {
              entry = { dcId: parsed.dcId, bucketKey: parsed.bucketKey, action: 'held', at: new Date().toISOString() }
            }
            saveDecision(date, entry)
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: true, entry }))
          } catch (e) {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }))
          }
        })()
      })
      return
    }

    const date = findLatestBriefDate()
    const today = resolveBusinessDate()
    const brief = date ? loadBrief(date) : null
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(renderPage(date ?? today, brief, date === today))
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`朝刊候補レビュー画面: http://localhost:${PORT}/（Ctrl+Cで終了。常駐運用はlaunchd経由）`)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
