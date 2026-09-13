// GINZA WHISKERS Note Auto-Transfer — background service worker（2026-09-14新設、
// 2026-09-14 実機エラー修正、2026-09-14 続き editor.note.com 対応、
// 2026-09-14 続き2 実機検証失敗の調査・修正）。
//
// 【2026-09-14 続き2：実機検証1回目失敗の根本原因】
// URL対応（editor.note.com）を修正したはずが、実機で「拡張再読み込み後も
// タイトル・本文とも0文字、transfer-state.jsonは空のまま」で失敗した。
// 調査の結果、**checkPending()が実際には一切実行されていなかった**ことが
// 判明した——原因は`inFlightArticleId`（同一記事の多重処理防止フラグ）に
// タイムスタンプ・タイムアウトが無かったこと。前回（editor.note.com対応前）の
// 試行時、旧manifestではcontent.jsがeditor.note.comへ注入されず
// 'note-transfer:ready'が一度も送られなかったため、'note-transfer:result'も
// 送られず、`setInFlight(null)`が永久に呼ばれないまま`inFlightArticleId`が
// 記事67で埋まったまま残っていた。chrome.storage.localは拡張の「再読み込み」
// では消えないため、今回の再読み込み後もgetInFlight()が非nullを返し続け、
// checkPending()の冒頭で即座にreturnして**何もしていなかった**
// （fetchすら発生しない＝アクセスログにも出ない＝transfer-stateも不変、が
// すべて説明できる）。
//
// 【対応】① inFlight記録に開始時刻を持たせ、一定時間（既定2分）経過したら
// 「放棄された試行」とみなし自動的に無効化する（タイムアウト）。② 拡張の
// 「再読み込み」（chrome.runtime.onInstalled）時に明示的にinFlightをクリア
// する——SWが実際に処理の途中で再起動されることは通常想定しておらず、開発者が
// 意図的に再読み込みした場合は古いinFlight記録は無条件に破棄してよい。
// ③ 対象タブが処理完了前に閉じられた場合（chrome.tabs.onRemoved）も
// inFlightをクリアし、失敗として記録する（サーバーのリトライ処理へ進める）。
// ④ 拡張自身の動作を追跡できるよう、全主要ステップをローカルサーバーへ
// 診断ログとして送信する（`note-transfer:log`→サーバーの
// /api/note-transfer/log→.devlogs/night/note-transfer-diagnostic.jsonl）。
// ブラウザのDevTools console.logはこの開発環境から見えないため、この
// ログが「拡張が実際に何をしたか」を追跡する唯一の手段になる。
//
// 【2026-09-14 続き：editor.note.com対応】実際の編集画面URLは
// https://editor.note.com/notes/{noteId}/edit/ であることが判明した
// （note.com/notes/new は新規作成の入口にすぎない）。URL判定を
// urlMatch.js（isomorphic）へ切り出し、checkPending()はまず既存タブを
// chrome.tabs.queryで探し、見つかればreloadして再利用する（見つからなければ
// 新規タブを開く。旧URLとの互換性は維持）。
//
// 【2026-09-14 実機エラー修正】manifest.json の permissions に "alarms"／"storage" が
// 欠けており、Service Worker登録自体が失敗していた問題を修正済み
// （safeSetupAlarms・chrome.storage存在チェック、詳細はDECISION_LOG_02.md参照）。
//
// 【安全境界】
//   - このスクリプトは note の「公開」ボタンには一切触れない（content.js 側で
//     物理的に除外している）。
//   - 同一 articleId を二重に処理しないよう、進行中の articleId は
//     タイムアウト付きで chrome.storage.local（利用不能ならメモリ内変数）で
//     管理する。
//   - ローカルサーバー側でも「in_progress」「success」「failed（3回失敗）」の
//     状態を持ち、多重防止・リトライ上限（3回）を二重に担保している。

const SERVER_BASE = 'http://localhost:4601'
const POLL_ALARM = 'note-transfer-poll'
const POLL_INTERVAL_MS = 20000
const INFLIGHT_TIMEOUT_MS = 120000 // 2分。この時間を超えて結果報告が無ければ放棄されたとみなす。

// urlMatch.js を読み込む（isomorphic・chrome-extension/urlMatch.js と同一ロジック
// をNodeのテストからも検証する）。名前空間オブジェクト self.NoteUrlMatch 経由で
// 参照する（importScriptsは同一トップレベルスコープを共有するため、
// const/functionの再宣言衝突を避けるためurlMatch.js側はIIFEで包んでいる）。
// importScripts自体が失敗しても（将来Chromeの仕様変更等で）Service Worker
// 全体を落とさないよう、フォールバック判定を用意する。
let noteUrlMatchNS = null
try {
  importScripts('urlMatch.js')
  noteUrlMatchNS = self.NoteUrlMatch || null
} catch (e) {
  console.error('[note-transfer] urlMatch.js の読み込みに失敗、簡易フォールバック判定を使用します', e)
}

function isNoteEditorTargetUrl(url) {
  if (noteUrlMatchNS && typeof noteUrlMatchNS.isNoteEditorTargetUrl === 'function') {
    return noteUrlMatchNS.isNoteEditorTargetUrl(url)
  }
  return (
    typeof url === 'string' &&
    /(editor\.note\.com)|(note\.com\/notes\/new)|(note\.com\/[^/]+\/n\/[^/]+\/edit)/.test(url)
  )
}
const NOTE_NEW_DRAFT_URL = (noteUrlMatchNS && noteUrlMatchNS.NOTE_NEW_DRAFT_URL) || 'https://note.com/notes/new'

// --- 診断ログ（サーバーの .devlogs/night/note-transfer-diagnostic.jsonl へ送信） ---
function logToServer(event, detail) {
  try {
    fetch(`${SERVER_BASE}/api/note-transfer/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'background', event, ...detail }),
    }).catch(() => {})
  } catch {
    // 診断ログ送信自体の失敗で本処理を止めない。
  }
}

// 2026-09-14続き3：実機検証2回目も「拡張再読み込み後、サーバーに一切
// リクエストが届かない」という1回目と同一の症状で失敗した。この
// service_worker_evaluatedログは、他のどの処理より前に（importScriptsや
// 関数定義より前に）実行される、最も原始的な「SWスクリプト自体が評価された
// か」の証跡である。次回、これすらサーバーに届いていなければ、原因は
// background.js内部のロジックではなく、拡張の再読み込みそのものが
// SWの実行に反映されていない（Chrome側の問題、または別の拡張インスタンスを
// 見ている等）と判断できる。
logToServer('service_worker_evaluated', { ts: Date.now() })

// --- chrome.storage が使えない場合のメモリ内フォールバック ---
let memoryInFlight = null // { articleId, startedAt }
const storageAvailable = !!(chrome.storage && chrome.storage.local)
if (!storageAvailable) {
  console.warn('[note-transfer] chrome.storage.local が利用できません（"storage" 権限を確認してください）。' +
    'Service Worker再起動をまたぐ永続性なしのメモリ内フォールバックで動作します。')
}

/** inFlight記録を取得する。INFLIGHT_TIMEOUT_MSを超えて放置されていれば
 * 「放棄された試行」とみなし、自動的にクリアしてnullを返す
 * （2026-09-14続き2：これが無かったことが実機検証1回目失敗の根本原因）。 */
async function getInFlight() {
  let record = null
  if (storageAvailable) {
    try {
      const stored = await chrome.storage.local.get('inFlight')
      record = stored.inFlight ?? null
    } catch (e) {
      console.error('[note-transfer] chrome.storage.local.get 失敗', e)
      record = memoryInFlight
    }
  } else {
    record = memoryInFlight
  }
  if (!record) return null
  const age = Date.now() - (record.startedAt ?? 0)
  if (age > INFLIGHT_TIMEOUT_MS) {
    logToServer('inflight_timeout_cleared', { articleId: record.articleId, ageMs: age })
    await setInFlight(null)
    return null
  }
  return record.articleId ?? null
}
async function setInFlight(articleId) {
  const record = articleId == null ? null : { articleId, startedAt: Date.now() }
  memoryInFlight = record
  if (!storageAvailable) return
  try {
    if (record == null) await chrome.storage.local.remove('inFlight')
    else await chrome.storage.local.set({ inFlight: record })
  } catch (e) {
    console.error('[note-transfer] chrome.storage.local 書き込み失敗', e)
  }
}

/**
 * 既に開いているnote編集タブ（例：マロンが手動で開いた空のeditor.note.com編集
 * 画面）があればそれを再読み込みして再利用し、無ければ note.com/notes/new を
 * 新規タブで開く。既存タブを再利用するのは、拡張の manifest 更新
 * （content_scripts.matches の追加）は「新規ナビゲーション」時にしか効かず、
 * 既に開いているタブへは自動的に再注入されないため（reloadで新しいnavigation
 * を発生させ、更新後のmatchesでcontent.jsを注入させる）。
 */
async function findOrOpenNoteEditorTab() {
  try {
    const tabs = await chrome.tabs.query({})
    const candidates = tabs.filter((t) => isNoteEditorTargetUrl(t.url))
    logToServer('tabs_queried', { totalTabs: tabs.length, candidateCount: candidates.length, candidateUrls: candidates.map((t) => t.url) })
    if (candidates.length > 0) {
      // editor.note.com（実際の編集画面）を優先し、note.com/notes/new（入口）は次点。
      candidates.sort((a, b) => {
        const score = (t) => (new URL(t.url).hostname === 'editor.note.com' ? 0 : 1)
        return score(a) - score(b)
      })
      const target = candidates[0]
      await chrome.tabs.reload(target.id)
      logToServer('existing_tab_reloaded', { tabId: target.id, url: target.url })
      return target
    }
  } catch (e) {
    console.error('[note-transfer] 既存タブの検索に失敗、新規タブを開きます', e)
    logToServer('tab_query_failed', { error: String(e?.message ?? e) })
  }
  const created = await chrome.tabs.create({ url: NOTE_NEW_DRAFT_URL, active: false })
  logToServer('new_tab_created', { tabId: created.id, url: NOTE_NEW_DRAFT_URL })
  return created
}

/**
 * chrome.scripting.executeScriptで対象タブへ直接注入する、完全に自己完結した
 * 関数（2026-09-14続き3新設）。
 *
 * 【なぜこれが必要か】content_scripts宣言的マッチングは、拡張の再読み込み後も
 * サーバーへ一切のリクエストが届かない（=SW側のポーリングすら動いていない
 * ように見える）という2回連続の実機検証失敗を受けて、"content_scriptsの
 * 自動注入だけに依存しない、確実に実行できる経路" として追加した。
 * background.jsが対象タブを能動的に選び、明示的にこの関数を注入して
 * 実行し、戻り値（Promise）で直接結果を受け取る——ready/startのメッセージ
 * 往復に依存しないため、その経路のどこかが機能していなくても影響を受けない。
 *
 * chrome.scripting.executeScriptのfuncはFunction.prototype.toString()で
 * シリアライズされ対象タブ内で再評価されるため、外側のクロージャ変数を
 * 参照できない——必要なヘルパーはすべてこの関数の内部に自己完結させている
 * （content.jsと論理的には同じ内容だが、実行経路が異なるため独立した
 * コピーとして保持する）。
 */
function injectedNoteTransfer(item) {
  return (async () => {
    const stages = []
    const log = (event, detail) => stages.push({ event, detail: detail ?? null, at: Date.now() })

    function sleep(ms) {
      return new Promise((r) => setTimeout(r, ms))
    }
    async function waitFor(fn, timeoutMs = 15000, intervalMs = 300) {
      const start = Date.now()
      while (Date.now() - start < timeoutMs) {
        const result = fn()
        if (result) return result
        await sleep(intervalMs)
      }
      return null
    }
    async function waitForPageLoad(timeoutMs = 15000) {
      if (document.readyState === 'complete') return true
      return new Promise((resolvePromise) => {
        const timer = setTimeout(() => resolvePromise(false), timeoutMs)
        window.addEventListener(
          'load',
          () => {
            clearTimeout(timer)
            resolvePromise(true)
          },
          { once: true },
        )
      })
    }
    function visibleText(el) {
      return (el.innerText || el.textContent || '').trim()
    }
    function isVisible(el) {
      if (!el) return false
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    function deepQuerySelectorAll(selector, root = document) {
      const out = []
      const walk = (node) => {
        if (!node) return
        if (typeof node.querySelectorAll === 'function') out.push(...node.querySelectorAll(selector))
        const all = typeof node.querySelectorAll === 'function' ? node.querySelectorAll('*') : []
        for (const el of all) {
          if (el.shadowRoot) walk(el.shadowRoot)
        }
      }
      walk(root)
      return out
    }
    function placeholderLike(el) {
      return el.getAttribute?.('placeholder') || el.getAttribute?.('aria-label') || el.getAttribute?.('data-placeholder') || ''
    }
    function fieldKind(el) {
      const tag = el.tagName.toLowerCase()
      if (tag === 'textarea') return 'textarea'
      if (tag === 'input') return 'input'
      if (el.getAttribute('contenteditable') === 'true' || el.isContentEditable) return 'contenteditable'
      if (el.getAttribute('role') === 'textbox') return 'contenteditable'
      return 'unknown'
    }
    function findTitleField() {
      const candidates = deepQuerySelectorAll(
        'textarea, input[type="text"], input:not([type]), [contenteditable="true"], [role="textbox"]',
      ).filter(isVisible)
      const byLabel = candidates.find((el) => /タイトル|title/i.test(placeholderLike(el)))
      if (byLabel) return { el: byLabel, kind: fieldKind(byLabel), reason: 'label-match' }
      const heading = candidates.find((el) => /^h1$/i.test(el.tagName))
      if (heading) return { el: heading, kind: fieldKind(heading), reason: 'heading-tag' }
      const editableOnly = candidates.filter((el) => fieldKind(el) !== 'unknown')
      if (editableOnly.length > 0) {
        const sorted = [...editableOnly].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
        return { el: sorted[0], kind: fieldKind(sorted[0]), reason: 'topmost-fallback' }
      }
      return null
    }
    function findBodyField(excludeEl) {
      const candidates = deepQuerySelectorAll('[contenteditable="true"], [role="textbox"]').filter(
        (el) => isVisible(el) && el !== excludeEl && !excludeEl?.contains?.(el) && !el.contains?.(excludeEl),
      )
      if (candidates.length === 0) return null
      const sorted = [...candidates].sort((a, b) => {
        const ra = a.getBoundingClientRect()
        const rb = b.getBoundingClientRect()
        return rb.width * rb.height - ra.width * ra.height
      })
      return { el: sorted[0], kind: fieldKind(sorted[0]) }
    }
    function findHashtagInput() {
      return deepQuerySelectorAll('input[type="text"], input:not([type])').find(
        (el) => isVisible(el) && /タグ|ハッシュタグ|tag/i.test(placeholderLike(el)),
      )
    }
    function findSaveDraftButton() {
      const candidates = deepQuerySelectorAll('button, [role="button"], a')
      return candidates.find((el) => {
        if (!isVisible(el)) return false
        const t = visibleText(el)
        if (!t) return false
        if (/公開/.test(t)) return false // 絶対除外
        return /下書き\s*保存|下書きを保存/.test(t)
      })
    }
    function setNativeValue(el, value) {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
      const desc = Object.getOwnPropertyDescriptor(proto, 'value')
      if (desc && desc.set) desc.set.call(el, value)
      else el.value = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    function dispatchInputLikeEvents(el, text) {
      try {
        el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }))
      } catch {}
      el.dispatchEvent(new Event('input', { bubbles: true }))
      try {
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
      } catch {}
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    async function setContentEditableParagraphs(el, text) {
      el.focus()
      document.execCommand('selectAll', false)
      document.execCommand('delete', false)
      const paragraphs = text.split('\n\n')
      for (let i = 0; i < paragraphs.length; i++) {
        const lines = paragraphs[i].split('\n')
        for (let j = 0; j < lines.length; j++) {
          document.execCommand('insertText', false, lines[j])
          if (j < lines.length - 1) document.execCommand('insertLineBreak', false)
        }
        if (i < paragraphs.length - 1) {
          document.execCommand('insertParagraph', false)
          document.execCommand('insertParagraph', false)
        }
      }
      dispatchInputLikeEvents(el, text)
    }
    function readBackText(field) {
      if (!field) return ''
      if (field.kind === 'textarea' || field.kind === 'input') return (field.el.value || '').trim()
      return (field.el.innerText || field.el.textContent || '').trim()
    }
    async function verifyWritten(field, waitMs = 2000, intervalMs = 200) {
      const start = Date.now()
      let text = readBackText(field)
      while (text.length === 0 && Date.now() - start < waitMs) {
        await sleep(intervalMs)
        text = readBackText(field)
      }
      return text
    }
    function pressEnter(el) {
      for (const type of ['keydown', 'keypress', 'keyup']) {
        el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }))
      }
    }
    async function attachCategoryIcon(iconInfo) {
      if (!iconInfo || !iconInfo.url) return { attached: false, reason: 'カテゴリーアイコン情報なし' }
      const fileInput = deepQuerySelectorAll('input[type="file"]')[0]
      if (!fileInput) return { attached: false, reason: 'ファイル入力要素が見つからない' }
      try {
        const res = await fetch(iconInfo.url)
        const blob = await res.blob()
        const file = new File([blob], iconInfo.url.split('/').pop() || 'category-icon.jpg', { type: blob.type || 'image/jpeg' })
        const dt = new DataTransfer()
        dt.items.add(file)
        fileInput.files = dt.files
        fileInput.dispatchEvent(new Event('change', { bubbles: true }))
        return { attached: true }
      } catch (e) {
        return { attached: false, reason: String(e?.message ?? e) }
      }
    }
    function domDebugSnapshot() {
      const buttons = deepQuerySelectorAll('button, [role="button"]').filter(isVisible).map(visibleText).filter(Boolean).slice(0, 40)
      const editables = deepQuerySelectorAll('[contenteditable="true"], [role="textbox"]').filter(isVisible)
      const editableSummary = editables.slice(0, 20).map((el) => ({
        tag: el.tagName.toLowerCase(),
        placeholderLike: placeholderLike(el),
        rectWidth: Math.round(el.getBoundingClientRect().width),
        rectHeight: Math.round(el.getBoundingClientRect().height),
      }))
      const textareas = deepQuerySelectorAll('textarea').filter(isVisible).map((el) => ({ placeholder: el.getAttribute('placeholder') }))
      const inputs = deepQuerySelectorAll('input').filter(isVisible).map((el) => ({ type: el.getAttribute('type'), placeholder: el.getAttribute('placeholder') }))
      return { buttons, editableSummary, textareas, inputs, title: document.title, bodyChildCount: document.body ? document.body.children.length : 0 }
    }

    log('injected_transfer_started', { url: location.href, readyState: document.readyState })
    await waitForPageLoad(15000)
    log('page_load_state', { readyState: document.readyState })

    const ready = await waitFor(() => findTitleField() || deepQuerySelectorAll('[contenteditable="true"]').length > 0, 20000)
    const snapshot = domDebugSnapshot()
    log('dom_snapshot', snapshot)
    if (!ready) {
      return { status: 'failure', error: 'stage=editor_not_ready: エディタの初期化を検出できませんでした', debug: snapshot, stages }
    }
    await sleep(500)

    const titleField = findTitleField()
    if (!titleField) {
      return { status: 'failure', error: 'stage=title_field_not_found', debug: domDebugSnapshot(), stages }
    }
    log('title_field_found', { kind: titleField.kind, reason: titleField.reason, tag: titleField.el.tagName })

    if (titleField.kind === 'textarea' || titleField.kind === 'input') {
      setNativeValue(titleField.el, item.title)
    } else {
      titleField.el.focus()
      document.execCommand('selectAll', false)
      document.execCommand('insertText', false, item.title)
      dispatchInputLikeEvents(titleField.el, item.title)
    }
    const titleReadback = await verifyWritten(titleField)
    log('title_write_verify', { length: titleReadback.length, sample: titleReadback.slice(0, 30) })
    if (titleReadback.length === 0) {
      return { status: 'failure', error: 'stage=title_write_not_verified: タイトル欄への書き込みを読み戻せませんでした（0文字）', debug: domDebugSnapshot(), stages }
    }

    const bodyField = findBodyField(titleField.el)
    if (!bodyField) {
      return { status: 'failure', error: 'stage=body_field_not_found', debug: domDebugSnapshot(), stages }
    }
    log('body_field_found', { kind: bodyField.kind, tag: bodyField.el.tagName })

    await setContentEditableParagraphs(bodyField.el, item.body)
    const bodyReadback = await verifyWritten(bodyField)
    log('body_write_verify', { length: bodyReadback.length, sample: bodyReadback.slice(0, 30) })
    if (bodyReadback.length === 0) {
      return { status: 'failure', error: 'stage=body_write_not_verified: 本文欄への書き込みを読み戻せませんでした（0文字）', debug: domDebugSnapshot(), stages }
    }

    let hashtagResult = { attempted: false }
    const hashtagInput = findHashtagInput()
    if (hashtagInput) {
      hashtagResult.attempted = true
      for (const tag of item.hashtags || []) {
        setNativeValue(hashtagInput, tag.replace(/^#/, ''))
        pressEnter(hashtagInput)
        await sleep(200)
      }
    }
    log('hashtags_done', hashtagResult)

    const iconResult = await attachCategoryIcon(item.categoryIcon)
    log('icon_attach_done', iconResult)
    await sleep(300)

    const saveBtn = await waitFor(() => findSaveDraftButton(), 8000)
    if (!saveBtn) {
      return {
        status: 'failure',
        error: 'stage=save_button_not_found: 「下書き保存」ボタンが見つかりません（公開ボタンは対象外のため誤操作はしていません）',
        debug: domDebugSnapshot(),
        hashtagResult,
        iconResult,
        stages,
      }
    }
    log('save_button_found', { text: visibleText(saveBtn) })
    saveBtn.click()
    await sleep(2000)

    const finalTitle = readBackText(titleField)
    const finalBody = readBackText(bodyField)
    log('post_save_verify', { titleLength: finalTitle.length, bodyLength: finalBody.length })
    if (finalTitle.length === 0 || finalBody.length === 0) {
      return {
        status: 'failure',
        error: `stage=post_save_verify_failed: 保存操作後にタイトル(${finalTitle.length}文字)または本文(${finalBody.length}文字)が0文字になりました`,
        stages,
      }
    }

    return { status: 'success', draftUrl: location.href, hashtagResult, iconResult, stages }
  })()
}

/** 対象タブがナビゲーション完了（status:'complete'）になるまで待つ。
 * DOM読み込み完了まで待機してから注入するため（2026-09-14続き3、マロン指示）。 */
async function waitForTabComplete(tabId, timeoutMs = 20000) {
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  if (tab && tab.status === 'complete') return true
  return new Promise((resolvePromise) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      resolvePromise(false)
    }, timeoutMs)
    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === 'complete') {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(listener)
        resolvePromise(true)
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
}

/**
 * chrome.scripting.executeScriptで対象タブへ直接注入し、実行結果を直接受け取る
 * （content_scripts宣言的注入・ready/startメッセージ往復に依存しない経路）。
 * 成功・失敗いずれもここでサーバーへ報告し、inFlightもここでクリアする。
 */
async function runTransferViaExecuteScript(tabId, item) {
  logToServer('execute_script_attempt', { tabId, articleId: item.articleId })
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectedNoteTransfer,
      args: [item],
    })
    const result = results?.[0]?.result
    if (!result) {
      logToServer('execute_script_no_result', { tabId })
      await reportResult(item.articleId, 'failure', { error: 'stage=execute_script_no_result: 注入した関数から結果が返りませんでした' })
      return
    }
    // 注入した関数が内部で記録した段階別ログ（stages）をまとめてサーバーへ転送する。
    for (const s of result.stages ?? []) {
      logToServer(s.event, { ...s.detail, tabId, via: 'executeScript' })
    }
    if (result.status === 'success') {
      await reportResult(item.articleId, 'success', { draftUrl: result.draftUrl })
    } else {
      await reportResult(item.articleId, 'failure', { error: result.error, debug: result.debug })
    }
  } catch (e) {
    logToServer('execute_script_error', { tabId, error: String(e?.message ?? e) })
    await reportResult(item.articleId, 'failure', { error: `stage=execute_script_error: ${String(e?.message ?? e)}` })
  }
}

async function reportResult(articleId, status, extra) {
  try {
    await fetch(`${SERVER_BASE}/api/note-transfer/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId, status, ...extra }),
    })
  } catch (e) {
    console.error('[note-transfer] result report failed', e)
  } finally {
    await setInFlight(null)
  }
}

async function checkPending() {
  try {
    const inFlight = await getInFlight()
    if (inFlight != null) {
      logToServer('check_pending_skipped_inflight', { articleId: inFlight })
      return // 既に処理中の記事がある間は新規に取りに行かない
    }

    const res = await fetch(`${SERVER_BASE}/api/note-transfer/pending`)
    if (!res.ok) {
      logToServer('pending_fetch_not_ok', { status: res.status })
      return
    }
    const data = await res.json()
    if (!data.ok || !data.item) return

    const item = data.item
    logToServer('pending_item_claimed', { articleId: item.articleId })
    await setInFlight(item.articleId)

    const tab = await findOrOpenNoteEditorTab()
    // 2026-09-14続き3：content_scriptsの宣言的注入（ready/startメッセージ往復）
    // だけに依存せず、chrome.scripting.executeScriptで対象タブへ確実に注入する
    // 経路を主経路とする（マロン指示）。DOM読み込み完了を待ってから注入する。
    const loaded = await waitForTabComplete(tab.id, 20000)
    logToServer('tab_load_wait_done', { tabId: tab.id, loaded })
    await runTransferViaExecuteScript(tab.id, item)
  } catch (e) {
    console.error('[note-transfer] pending check failed', e)
    logToServer('check_pending_error', { error: String(e?.message ?? e) })
  }
}

// --- chrome.alarms が使えない場合の setTimeout ベースフォールバック ---
// MV3 Service Worker はアイドル時に停止しうるため setTimeout の長期精度は
// 保証されないが、「起動できない」よりは「精度が落ちても動く」を優先する。
let fallbackTimer = null
function startFallbackPolling() {
  if (fallbackTimer) return
  console.warn(
    '[note-transfer] chrome.alarms が利用できません（"alarms" 権限を確認してください）。' +
      'setTimeout ベースのフォールバックポーリングへ切り替えます。',
  )
  const tick = () => {
    checkPending().finally(() => {
      fallbackTimer = setTimeout(tick, POLL_INTERVAL_MS)
    })
  }
  tick()
}

/** chrome.alarms.create/onAlarm を安全に呼び出す。存在しなければ何もせず false を返す
 *（呼び出し側がフォールバックへ切り替える）。トップレベルで無条件に
 * `chrome.alarms.onAlarm.addListener` を呼んでいたことが実機クラッシュの原因
 * だったため、必ずこの関数経由でアクセスする。 */
function safeSetupAlarms() {
  try {
    if (!chrome.alarms || typeof chrome.alarms.create !== 'function') return false
    chrome.alarms.create(POLL_ALARM, { periodInMinutes: POLL_INTERVAL_MS / 60000 })
    if (chrome.alarms.onAlarm && typeof chrome.alarms.onAlarm.addListener === 'function') {
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm && alarm.name === POLL_ALARM) checkPending()
      })
    }
    return true
  } catch (e) {
    console.error('[note-transfer] chrome.alarms 初期化に失敗', e)
    return false
  }
}

const alarmsAvailable = safeSetupAlarms()
if (!alarmsAvailable) startFallbackPolling()

chrome.runtime.onInstalled.addListener(async (details) => {
  logToServer('on_installed', { reason: details?.reason })
  // 拡張の再読み込み・更新は「開発者が意図的に再起動した」明確な合図であり、
  // その時点で残っている inFlight 記録は（SW再起動をまたいで処理が継続する
  // ケースは通常想定していないため）放棄された試行とみなして必ずクリアする
  // （2026-09-14続き2：これが無かったことが実機検証1回目失敗の根本原因）。
  await setInFlight(null)
  if (alarmsAvailable) {
    try {
      chrome.alarms.create(POLL_ALARM, { periodInMinutes: POLL_INTERVAL_MS / 60000 })
    } catch (e) {
      console.error('[note-transfer] onInstalled: chrome.alarms.create 失敗', e)
    }
  }
  checkPending()
})
chrome.runtime.onStartup.addListener(() => {
  if (alarmsAvailable) {
    try {
      chrome.alarms.create(POLL_ALARM, { periodInMinutes: POLL_INTERVAL_MS / 60000 })
    } catch (e) {
      console.error('[note-transfer] onStartup: chrome.alarms.create 失敗', e)
    }
  }
  checkPending()
})

// 起動直後（スクリプト評価時点）にも1回だけ即時チェックする（onInstalled/onStartup が
// 発火しない「既にインストール済みでService Workerだけが再起動した」ケースを拾う）。
checkPending()

const pendingItemByTab = new Map()

// 2026-09-14続き3：アラーム（20秒間隔）だけに依存せず、note編集タブ自体が
// 読み込み完了した瞬間にもcheckPending()を起動する（独立したトリガー経路を
// 増やし、アラームが何らかの理由で発火しない場合でも動作するようにする）。
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && isNoteEditorTargetUrl(tab.url)) {
    logToServer('note_editor_tab_completed', { tabId, url: tab.url })
    checkPending()
  }
})

// 転記対象タブが処理完了前に閉じられた場合、inFlightを放置しない
// （2026-09-14続き2追加：中断されたタブの後始末）。
chrome.tabs.onRemoved.addListener((tabId) => {
  const item = pendingItemByTab.get(tabId)
  if (!item) return
  pendingItemByTab.delete(tabId)
  logToServer('tab_closed_before_result', { tabId, articleId: item.articleId })
  void (async () => {
    try {
      await fetch(`${SERVER_BASE}/api/note-transfer/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleId: item.articleId,
          status: 'failure',
          error: 'タブが結果報告前に閉じられた（stage=tab_closed_before_result）',
        }),
      })
    } catch (e) {
      console.error('[note-transfer] tab_closed失敗報告に失敗', e)
    } finally {
      await setInFlight(null)
    }
  })()
})

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id

  if (msg?.type === 'note-transfer:log') {
    // content.js からの段階別診断ログをそのままサーバーへ転送する。
    logToServer(msg.event, { ...msg.detail, tabId, frame: sender.frameId })
    return
  }

  if (!tabId) return

  if (msg?.type === 'note-transfer:ready') {
    const item = pendingItemByTab.get(tabId)
    if (item) {
      chrome.tabs.sendMessage(tabId, { type: 'note-transfer:start', item })
      pendingItemByTab.delete(tabId)
    } else {
      logToServer('ready_received_no_pending_item', { tabId })
    }
    return
  }

  if (msg?.type === 'note-transfer:result') {
    void (async () => {
      try {
        await fetch(`${SERVER_BASE}/api/note-transfer/result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            articleId: msg.articleId,
            status: msg.status,
            draftUrl: msg.draftUrl,
            error: msg.error,
          }),
        })
      } catch (e) {
        console.error('[note-transfer] result report failed', e)
      } finally {
        await setInFlight(null)
      }
    })()
    sendResponse({ received: true })
    return true
  }
})
