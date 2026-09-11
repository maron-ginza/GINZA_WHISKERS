// GINZA WHISKERS / Project 02（2026-09-11）— 本日記事レビュー画面 `./p2 review-today`。
//
//   ./p2 review-today [--ids=61,62] [--date=YYYY-MM-DD] [--port=4599] [--no-open]
//   ./p2 review-today transfer <articleId>
//
// 本日生成した記事下書きを1画面（承認／修正／保留）にまとめ、localhost で表示する。
// 「選択内容を確定」で decision.json を書き、**承認された記事だけ** note 下書きへ転記できる。
// 外部公開ボタンは無し。公開は必ずマロンの最終操作。
//
// **DB 書き込みは socialCopy.instagram の自動補完のみ（本文から決定的に生成）。**
// AI 呼び出し・approve(reviewStatus)・note 公開・Chrome 操作はしない。

import { getPayload } from 'payload'
import { createServer } from 'node:http'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'

import config from '../payload.config'
import { buildNoteDraftPackage } from '../lib/night/buildNoteDraftPackage'
import {
  deriveInstagramCopy,
  extractLead,
  canTransfer,
  type ReviewItem,
  type ReviewDecisionFile,
  type ReviewDecision,
} from '../lib/pipeline/reviewTodayData'
import { resolveBusinessDate, tokyoStartOfDay } from '../lib/util/businessDate'
import { loadPublishedThemes } from '../lib/publish/loadPublishedThemes'
import { matchPublishedTheme } from '../lib/publish/publishedThemes'

const ROOT = resolve(process.cwd(), '..')
const argv = process.argv.slice(2)
const SUB = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'serve'
const dateArg = (argv.find((a) => a.startsWith('--date=')) ?? '').split('=')[1]
// 業務日付＝Asia/Tokyo の暦日（--date= 指定時はそれを優先）。UTC 切り出しはしない。
const DATE = resolveBusinessDate(dateArg)
const idsArg = (argv.find((a) => a.startsWith('--ids=')) ?? '').split('=')[1]
const PORT = Number((argv.find((a) => a.startsWith('--port=')) ?? '').split('=')[1]) || 4599
const NO_OPEN = argv.includes('--no-open')

const REVIEW_DIR = resolve(ROOT, '.devlogs', 'morning', 'review')
const HTML_PATH = resolve(REVIEW_DIR, `${DATE}.html`)
const DECISION_PATH = resolve(REVIEW_DIR, `${DATE}-decision.json`)

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function readDecision(): ReviewDecisionFile | null {
  if (!existsSync(DECISION_PATH)) return null
  try {
    return JSON.parse(readFileSync(DECISION_PATH, 'utf8')) as ReviewDecisionFile
  } catch {
    return null
  }
}

interface ExcludedItem {
  articleId: number
  title: string
  reason: string
  matchedUrl: string | null
  matchedTitle: string | null
}

// ─────────────────────────── レビューデータ組み立て ───────────────────────────
async function buildItems(): Promise<{ items: ReviewItem[]; excluded: ExcludedItem[] }> {
  const payload = await getPayload({ config })

  let ids: number[]
  if (idsArg) {
    ids = idsArg.split(',').map((n) => Number(n.trim())).filter(Number.isFinite)
  } else {
    const since = tokyoStartOfDay(DATE)
    const res = await payload.find({
      collection: 'articles',
      where: { and: [{ reviewStatus: { equals: 'draft' } }, { createdAt: { greater_than_equal: since.toISOString() } }] },
      sort: '-createdAt',
      limit: 20,
      depth: 0,
      overrideAccess: true,
    })
    ids = (res.docs as { id: number }[]).map((d) => Number(d.id))
  }
  if (ids.length === 0) throw new Error(`対象の記事下書きがありません（--ids= で指定するか、${DATE} 生成の draft を用意してください）`)

  // 既公開テーマ（全公開履歴）を読み込み、重複する記事は本日のレビュー対象から除外する。
  const published = await loadPublishedThemes(payload, ROOT)

  const items: ReviewItem[] = []
  const excluded: ExcludedItem[] = []
  for (const id of ids) {
    const article = (await payload.findByID({ collection: 'articles', id, locale: 'ja', depth: 1, overrideAccess: true })) as Record<string, any>
    const pkg = await buildNoteDraftPackage(payload, id, { allowNonDraft: true })

    // 既公開テーマとの重複チェック（同一URL・DC だけでなく イベント名・店舗名・期間・テーマの意味的重複も）
    {
      const prov0: any[] = Array.isArray(article.editorialProvenance) ? article.editorialProvenance : []
      const venueFact = prov0.find((p) => (p.factType ?? '') === 'venue')?.fact ?? null
      const dateFact = prov0.find((p) => (p.factType ?? '') === 'date')?.fact ?? null
      const noteHist = (Array.isArray(article.publishHistory) ? article.publishHistory : []).find((h: any) => h?.channel === 'note')
      const dm = matchPublishedTheme(
        {
          dcId: pkg.discoveredContentId,
          title: pkg.title,
          eventName: pkg.title,
          venue: venueFact,
          period: dateFact,
          noteUrl: noteHist ? String(noteHist.reference ?? '') : null,
        },
        published,
      )
      if (dm.match) {
        excluded.push({ articleId: id, title: pkg.title, reason: dm.reason, matchedUrl: dm.matchedUrl, matchedTitle: dm.matchedTitle })
        continue
      }
    }

    // Instagram 短文の自動補完（本文から決定的に生成。空のときだけ）
    const sc = article.socialCopy ?? {}
    let igCopy = String(sc.instagram ?? '').trim()
    if (!igCopy) {
      igCopy = deriveInstagramCopy({
        title: pkg.title,
        bodyText: pkg.body,
        hashtags: pkg.hashtags.note,
        period: pkg.noteMeta.paywallAnchorHeading, // paid 以外は null → 使わない
      })
      // 会期は ArticleFacts / provenance の date から拾う
      const dcId = pkg.discoveredContentId
      if (dcId) {
        const af = await payload.find({ collection: 'article-facts', where: { discoveredContent: { equals: dcId } }, limit: 1, depth: 0, overrideAccess: true })
        const period = (af.docs[0] as { eventDate?: string } | undefined)?.eventDate
        if (period) {
          igCopy = deriveInstagramCopy({ title: pkg.title, bodyText: pkg.body, hashtags: pkg.hashtags.note, period })
        }
      }
      await payload.update({
        collection: 'articles',
        id,
        locale: 'ja',
        overrideAccess: true,
        data: { reviewStatus: 'draft', socialCopy: { note: sc.note ?? '', x: sc.x ?? '', instagram: igCopy } },
      })
    }

    // ArticleFacts 12項目（あれば article-facts、無ければ本文/provenance から。無い項目は「公式記載なし」）
    const prov: any[] = Array.isArray(article.editorialProvenance) ? article.editorialProvenance : []
    const NS = '公式記載なし'
    let af: Record<string, any> | undefined
    if (pkg.discoveredContentId) {
      const r = await payload.find({ collection: 'article-facts', where: { discoveredContent: { equals: pkg.discoveredContentId } }, limit: 1, depth: 0, overrideAccess: true })
      af = r.docs[0] as Record<string, any> | undefined
    }
    const g = (v: unknown) => (String(v ?? '').trim() || NS)
    const facts: { label: string; value: string }[] = [
      { label: '1. 正式名称', value: g(af?.eventName ?? pkg.title) },
      { label: '2. 概要', value: g(af?.whatHappens) },
      { label: '3. 価格', value: g(af?.priceText) },
      { label: '4. 開催・販売期間', value: g(af?.eventDate) },
      {
        label: '5. 購入・参加条件',
        value:
          [af?.applyRequired === 'yes' ? '予約・申込：必要' : af?.applyRequired === 'no' ? '予約・申込：不要' : '', g(af?.officialInfoNote) === NS ? '' : af!.officialInfoNote]
            .filter(Boolean)
            .join(' ／ ') || NS,
      },
      { label: '6. 場所', value: g(af?.areaLead) },
      { label: '7. 開催時間', value: g(af?.eventTime) },
      { label: '8. 18カテゴリー', value: g(af?.primaryCategory ?? pkg.masthead.categoryIcon.category) },
      { label: '9. Editorial Compass（主軸）', value: pkg.noteMeta.categoryIcon.labelJa ? `${pkg.noteMeta.categoryIcon.labelJa}系` : NS },
      { label: '10. templateType', value: g(af?.templateType) },
      { label: '11. 出典確認日', value: g(prov[0]?.verifiedAt) },
      { label: '12. enrichmentStatus', value: g(af?.enrichmentStatus) },
    ]

    // 公式出典（sourceName+URL の重複排除）
    const seen = new Set<string>()
    const officialSources: { name: string; url: string }[] = []
    for (const p of prov) {
      const url = String(p.sourceUrl ?? '').trim()
      if (!url || seen.has(url)) continue
      seen.add(url)
      officialSources.push({ name: String(p.sourceName ?? '公式'), url })
    }

    const notStated = facts.filter((f) => f.value === NS).map((f) => f.label.replace(/^\d+\.\s*/, ''))
    const warnings = pkg.validation.warnings
      .filter((w) => w.code !== 'missingSocialCopy_instagram') // 上で自動補完済み
      .map((w) => ({ code: w.code, message: w.message }))

    items.push({
      articleId: id,
      discoveredContentId: pkg.discoveredContentId,
      bucketLabel: pkg.pillar ?? '',
      title: pkg.title,
      lead: extractLead(pkg.body),
      noteBody: pkg.body,
      articleFacts: facts,
      officialSources,
      verifiedAt: g(prov[0]?.verifiedAt),
      xCopy: String(sc.x ?? ''),
      instagramCopy: igCopy,
      hashtags: pkg.hashtags.note,
      illustrationCaption: pkg.noteMeta.illustrationCaption,
      warnings,
      notStatedFields: notStated,
      status: pkg.validation.blockers.length ? 'blocked' : warnings.length ? 'warning' : 'ok',
      packageFiles: { body: `.devlogs/night/queue/${DATE}/${id}/note-body.txt`, json: `.devlogs/night/queue/${DATE}/${id}/note-draft.json` },
    })
  }
  return { items, excluded }
}

// ─────────────────────────── HTML ───────────────────────────
function renderHtml(items: ReviewItem[], excluded: ExcludedItem[] = []): string {
  const decision = readDecision()
  const excludedHtml = excluded.length
    ? `<section class="card excluded"><div class="cardhead"><span class="badge blocked">除外</span>
       <h2>既公開テーマとの重複で本日のレビュー対象から除外（${excluded.length}件）</h2></div>
       <ul>${excluded
         .map(
           (e) =>
             `<li>Article #${e.articleId}「${esc(e.title)}」 — ${esc(e.reason)}${
               e.matchedUrl ? `（既公開: <a href="${esc(e.matchedUrl)}" target="_blank" rel="noopener">${esc(e.matchedUrl)}</a>）` : '（既公開・URL未記録）'
             }</li>`,
         )
         .join('')}</ul>
       <p class="files">重複判定は全公開履歴（DB publishHistory ＋ .devlogs/night/queue ＋ manual-drafts ＋ 手動シード）を対象。同一URL・同一DCに加え、イベント名／店舗名／期間／テーマの意味的重複も判定。</p></section>`
    : ''
  const emptyHtml =
    items.length === 0
      ? `<section class="card"><div class="cardhead"><span class="badge warning">0件</span>
         <h2>本日レビュー対象の記事はありません</h2></div>
         <p>${excluded.length ? '生成した下書きはすべて既公開テーマとの重複でした。' : '本日生成の記事下書きがありません。'}未公開で公式確認できる代替候補が揃うまで、本日の公開は見送りです（推測で補完しない）。</p></section>`
      : ''
  const cards = items
    .map((it) => {
      const cur = decision?.decisions?.[String(it.articleId)]?.decision ?? ''
      const factsRows = it.articleFacts
        .map((f) => `<tr><th>${esc(f.label)}</th><td${f.value === '公式記載なし' ? ' class="ns"' : ''}>${esc(f.value)}</td></tr>`)
        .join('')
      const srcRows = it.officialSources.map((s) => `<li>${esc(s.name)}：<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a></li>`).join('')
      const warnRows = it.warnings.length
        ? it.warnings.map((w) => `<li>⚠️ [${esc(w.code)}] ${esc(w.message)}</li>`).join('')
        : '<li>なし</li>'
      const nsRows = it.notStatedFields.length ? it.notStatedFields.map((n) => `<li>${esc(n)}</li>`).join('') : '<li>なし</li>'
      const radio = (v: ReviewDecision, label: string, cls: string) =>
        `<label class="btn ${cls}"><input type="radio" name="d-${it.articleId}" value="${v}" ${cur === v ? 'checked' : ''}> ${label}</label>`
      return `
<section class="card" data-id="${it.articleId}">
  <div class="cardhead">
    <span class="badge ${it.status}">${it.status.toUpperCase()}</span>
    <h2>Article #${it.articleId}${it.bucketLabel ? `　<small>（${esc(it.bucketLabel)}）</small>` : ''}</h2>
  </div>

  <h3>1. 記事タイトル</h3><p class="title">${esc(it.title)}</p>
  <h3>2. リード文</h3><p>${esc(it.lead)}</p>
  <h3>3. note本文全文</h3><pre class="body">${esc(it.noteBody)}</pre>
  <h3>4. ArticleFacts</h3><table class="facts">${factsRows}</table>
  <h3>5. 公式URLと出典確認日</h3><ul>${srcRows || '<li>なし</li>'}</ul><p>出典確認日：<b>${esc(it.verifiedAt)}</b></p>
  <h3>6. X投稿案</h3><pre class="copy" id="x-${it.articleId}">${esc(it.xCopy)}</pre><button type="button" class="mini" data-copy="x-${it.articleId}">コピー</button>
  <h3>Instagram投稿案（自動生成）</h3><pre class="copy" id="ig-${it.articleId}">${esc(it.instagramCopy)}</pre><button type="button" class="mini" data-copy="ig-${it.articleId}">コピー</button>
  <h3>7. ハッシュタグ4個</h3><p class="tags">${it.hashtags.map((h) => `<span>${esc(h)}</span>`).join(' ')}</p>
  <h3>8. 挿絵注釈</h3><p>${esc(it.illustrationCaption)}</p>
  <h3>9. WARNINGと未確認項目</h3>
  <div class="cols">
    <div><b>WARNING</b><ul>${warnRows}</ul></div>
    <div><b>公式記載なし／未確認</b><ul>${nsRows}</ul></div>
  </div>

  <h3>判定</h3>
  <div class="decide">${radio('approve', '承認', 'approve')}${radio('revise', '修正', 'revise')}${radio('hold', '保留', 'hold')}</div>
  <textarea id="note-${it.articleId}" placeholder="修正・保留の理由（任意）">${esc(decision?.decisions?.[String(it.articleId)]?.note ?? '')}</textarea>
  <p class="files">転記パッケージ：${esc(it.packageFiles.body)} ／ ${esc(it.packageFiles.json)}</p>
</section>`
    })
    .join('')

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>本日記事レビュー ${DATE}</title>
<style>
:root{color-scheme:light dark}
body{font:15px/1.7 -apple-system,"Hiragino Kaku Gothic ProN",sans-serif;margin:0;background:#f4f1ea;color:#241f18}
header{position:sticky;top:0;background:#1f3f38;color:#f8f3e8;padding:14px 20px;z-index:5}
header h1{margin:0;font-size:17px}
header p{margin:4px 0 0;font-size:12px;opacity:.85}
main{max-width:920px;margin:0 auto;padding:20px}
.card{background:#f8f3e8;border:1px solid #d8cfbd;border-radius:10px;padding:20px;margin:0 0 24px}
.cardhead{display:flex;align-items:center;gap:10px}
.cardhead h2{margin:0;font-size:16px}
.badge{font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px}
.badge.ok{background:#1f3f38;color:#fff}.badge.warning{background:#b8860b;color:#fff}.badge.blocked{background:#8b1a1a;color:#fff}
h3{font-size:13px;margin:18px 0 4px;color:#4d7a70;border-bottom:1px solid #e2d9c6;padding-bottom:2px}
p.title{font-size:16px;font-weight:700}
pre{white-space:pre-wrap;word-break:break-word;background:#fff;border:1px solid #e2d9c6;border-radius:6px;padding:12px;font:13px/1.7 "Hiragino Kaku Gothic ProN",sans-serif;margin:6px 0}
pre.body{max-height:340px;overflow:auto}
table.facts{border-collapse:collapse;width:100%;font-size:13px}
table.facts th{text-align:left;white-space:nowrap;padding:4px 10px 4px 0;vertical-align:top;color:#786c58;width:150px}
table.facts td{padding:4px 0;border-bottom:1px solid #eee}
td.ns{color:#8b1a1a}
.tags span{display:inline-block;background:#eee7d6;border-radius:99px;padding:2px 10px;margin:2px}
.cols{display:flex;gap:20px;flex-wrap:wrap}.cols>div{flex:1;min-width:240px}
ul{margin:4px 0;padding-left:20px}
.decide{display:flex;gap:10px;margin:8px 0}
.btn{border:1px solid #999;border-radius:8px;padding:8px 18px;cursor:pointer;user-select:none}
.btn input{margin-right:6px}
.btn.approve{border-color:#1f3f38}.btn.revise{border-color:#b8860b}.btn.hold{border-color:#786c58}
.btn:has(input:checked).approve{background:#1f3f38;color:#fff}
.btn:has(input:checked).revise{background:#b8860b;color:#fff}
.btn:has(input:checked).hold{background:#786c58;color:#fff}
textarea{width:100%;box-sizing:border-box;min-height:44px;border:1px solid #d8cfbd;border-radius:6px;padding:8px;font:13px/1.6 inherit}
.files{font-size:11px;color:#786c58}
button.mini{font-size:11px;padding:3px 10px;border:1px solid #bbb;border-radius:6px;background:#fff;cursor:pointer}
#confirmbar{position:sticky;bottom:0;background:#f8f3e8;border-top:2px solid #1f3f38;padding:14px 20px;text-align:center}
#confirm{font-size:15px;font-weight:700;background:#1f3f38;color:#fff;border:0;border-radius:10px;padding:12px 40px;cursor:pointer}
#confirm:disabled{opacity:.5;cursor:not-allowed}
#result{max-width:920px;margin:14px auto;padding:0 20px;font-size:13px}
#result .step{background:#eef3f1;border:1px solid #cfe0da;border-radius:8px;padding:12px;margin:8px 0}
code{background:#241f18;color:#f8f3e8;padding:2px 6px;border-radius:4px}
.note{max-width:920px;margin:8px auto;padding:0 20px;font-size:12px;color:#786c58}
</style></head><body>
<header><h1>本日記事レビュー — ${DATE}（対象 ${items.length}本${excluded.length ? ` ／ 既公開重複で除外 ${excluded.length}本` : ''}）</h1>
<p>各記事に 承認／修正／保留 を選び、最後に「選択内容を確定」。<b>承認した記事だけ</b> note 下書きへ転記できます。外部公開ボタンはありません（公開はマロンの最終操作）。</p></header>
<main>${excludedHtml}${emptyHtml}${cards}</main>
<div id="confirmbar"><button id="confirm"${items.length === 0 ? ' disabled' : ''}>選択内容を確定</button></div>
<div id="result"></div>
<p class="note">この画面は localhost:${PORT} で表示中。確定内容は <code>.devlogs/morning/review/${DATE}-decision.json</code> に保存されます。転記は別コマンド <code>./p2 review-today transfer &lt;articleId&gt;</code>。</p>
<script>
const IDS=${JSON.stringify(items.map((i) => i.articleId))};
document.querySelectorAll('button.mini').forEach(b=>b.onclick=()=>{const t=document.getElementById(b.dataset.copy);navigator.clipboard.writeText(t.textContent).then(()=>{b.textContent='コピーしました';setTimeout(()=>b.textContent='コピー',1200)})});
const cbtn=document.getElementById('confirm');
function collect(){const out={};for(const id of IDS){const r=document.querySelector('input[name="d-'+id+'"]:checked');out[id]=r?{decision:r.value,note:document.getElementById('note-'+id).value||undefined}:null;}return out;}
cbtn.onclick=async()=>{
  const d=collect();
  if(Object.values(d).some(v=>!v)){alert('すべての記事に 承認／修正／保留 を選んでください');return;}
  cbtn.disabled=true;cbtn.textContent='保存中…';
  const res=await fetch('/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({decisions:d})});
  const j=await res.json();
  cbtn.textContent='確定しました';
  const box=document.getElementById('result');
  const approved=Object.entries(d).filter(([,v])=>v.decision==='approve').map(([k])=>k);
  const others=Object.entries(d).filter(([,v])=>v.decision!=='approve');
  let html='<div class="step"><b>確定を保存しました</b>：'+j.path+'</div>';
  if(approved.length){html+='<div class="step"><b>承認：'+approved.length+'本</b> — note 下書きへ転記できます（ターミナルで実行）：<br>'+approved.map(id=>'<code>./p2 review-today transfer '+id+'</code>').join('<br>')+'<br><small>転記は下書きまで。note の「公開」はマロンが手動で押します。</small></div>';}
  for(const [id,v] of others){html+='<div class="step">Article #'+id+'：<b>'+v.decision+'</b>'+(v.note?'（'+v.note+'）':'')+' — 転記しません。</div>';}
  box.innerHTML=html;box.scrollIntoView({behavior:'smooth'});
};
</script></body></html>`
}

// ─────────────────────────── serve ───────────────────────────
async function runServe(): Promise<void> {
  mkdirSync(REVIEW_DIR, { recursive: true })
  const { items, excluded } = await buildItems()
  writeFileSync(HTML_PATH, renderHtml(items, excluded), 'utf8')

  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/confirm') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}') as { decisions: Record<string, { decision: ReviewDecision; note?: string }> }
          const file: ReviewDecisionFile = { date: DATE, confirmedAt: new Date().toISOString(), decisions: parsed.decisions }
          writeFileSync(DECISION_PATH, JSON.stringify(file, null, 2) + '\n', 'utf8')
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true, path: `.devlogs/morning/review/${DATE}-decision.json` }))
        } catch (e) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: String(e) }))
        }
      })
      return
    }
    // それ以外はレビュー HTML（毎回最新の decision を反映して再レンダ）
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(renderHtml(items, excluded))
  })
  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}/`
    console.log(`\n本日記事レビュー画面：${url}`)
    console.log(`  HTML: ${HTML_PATH}`)
    console.log(`  対象: ${items.length ? items.map((i) => `#${i.articleId}(${i.status})`).join(' , ') : '（0本）'}`)
    if (excluded.length) console.log(`  既公開重複で除外: ${excluded.map((e) => `#${e.articleId}（${e.reason}）`).join(' , ')}`)
    console.log(`  Ctrl+C で終了。確定 → .devlogs/morning/review/${DATE}-decision.json → ./p2 review-today transfer <id>\n`)
    if (!NO_OPEN) execFile('open', [url], () => {})
  })
}

// ─────────────────────────── transfer ───────────────────────────
async function runTransfer(articleId: number): Promise<void> {
  const decision = readDecision()
  const gate = canTransfer(decision, articleId)
  if (!gate.ok) {
    console.error(`⛔ 転記できません：${gate.reason}`)
    console.error(`   先に ./p2 review-today で「選択内容を確定」（該当記事を「承認」）してください。`)
    process.exit(3)
  }
  const { getPayload: gp } = await import('payload')
  const { default: cfg } = await import('../payload.config')
  const payload = await gp({ config: cfg })
  const pkg = await buildNoteDraftPackage(payload, articleId, { allowNonDraft: true })

  // 既公開テーマの再転記を防ぐ（承認済みでも重複なら止める）
  {
    const art = (await payload.findByID({ collection: 'articles', id: articleId, locale: 'ja', depth: 1, overrideAccess: true })) as Record<string, any>
    const prov: any[] = Array.isArray(art.editorialProvenance) ? art.editorialProvenance : []
    const dm = matchPublishedTheme(
      {
        dcId: pkg.discoveredContentId,
        title: pkg.title,
        eventName: pkg.title,
        venue: prov.find((p) => (p.factType ?? '') === 'venue')?.fact ?? null,
        period: prov.find((p) => (p.factType ?? '') === 'date')?.fact ?? null,
        noteUrl: (Array.isArray(art.publishHistory) ? art.publishHistory : []).find((h: any) => h?.channel === 'note')?.reference ?? null,
      },
      await loadPublishedThemes(payload, ROOT),
    )
    if (dm.match) {
      console.error(`⛔ 転記できません：既公開テーマとの重複（${dm.reason}${dm.matchedUrl ? ` / ${dm.matchedUrl}` : ''}）`)
      process.exit(3)
    }
  }
  console.log(`✅ ${gate.reason} — note 転記パッケージを生成します（下書きまで。公開はマロンが手動）。`)
  const dir = resolve(ROOT, '.devlogs', 'night', 'queue', DATE, String(articleId))
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, 'note-body.txt'), pkg.body, 'utf8')
  writeFileSync(resolve(dir, 'note-draft.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  console.log(`  note-body.txt / note-draft.json → ${dir.replace(ROOT + '/', '')}`)
  console.log('  次：マロンが note の下書きへ貼り付け（Claude in Chrome は都度許可・実験的）。「公開」ボタンはマロンが手動。')
  console.log('  外部公開はこのコマンドでは行いません。')
  process.exit(0)
}

async function main() {
  if (SUB === 'transfer') {
    const id = Number(argv[1])
    if (!Number.isInteger(id) || id < 1) {
      console.error('Usage: ./p2 review-today transfer <articleId>')
      process.exit(2)
    }
    await runTransfer(id)
    return
  }
  await runServe()
}
main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e))
  process.exit(1)
})
