// GINZA WHISKERS Note Auto-Transfer — 注入用content script（2026-09-14続き27新設）。
//
// 【背景】chrome.scripting.executeScript({func: injectedNoteTransfer, ...})方式
// （2026-09-14続き3〜続き26）で、実機検証を3回行ったところ、いずれも
// `execute_script_attempt`（background.js側のログ、executeScript呼び出し直前）
// は記録されるのに、注入された関数の最初の1行（`injected_transfer_started`）
// すら1件もサーバーへ届かず、約140秒後にブラウザ側のinFlightタイムアウトで
// 強制的に次の試行へ進む、という現象が3回とも寸分違わず再現した
// （DECISION_LOG_02.md 2026-09-13 続き26参照）。Service Workerの
// DevTools Consoleを実機確認したが赤いエラーは0件——執行が完全に始まって
// いないか、極めて早い段階で無応答になっている可能性が高いと判断した。
//
// 【対応】func:方式（Function.prototype.toString()による直列化・対象タブ内
// での再構築に依存）をやめ、固定ファイルとして`files:['injected-transfer.js']`
// で注入する方式へ変更した。データはchrome.tabs.sendMessageで渡し、結果は
// メッセージのsendResponseで返す——外部クロージャ変数への依存を構造的に
// 排除し（このファイル自体が最上位スコープであり、background.jsのモジュール
// 変数を一切参照しない）、直列化・再構築のステップそのものも無くしている。
//
// 【安全境界】
//   - 「投稿する」等の最終公開ボタンはコード上どこからも一切クリックしない
//     （PUBLISH_FINAL_RE・isForbiddenPublishLabelで明示的に除外、
//     findProceedToPublishButtonは「公開に進む」という設定画面への遷移
//     ボタンのみを対象とする）。
//   - 同一タブへ複数回このファイルが注入されても（reloadなしで同じタブを
//     繰り返し使う運用のため起こりうる）、リスナーの二重登録は
//     window.__NOTE_TRANSFER_LISTENER_INSTALLED__ガードで防止する——
//     先に登録されたリスナーがまだ応答していない（＝前回の実行がまだ
//     生きている可能性がある）間は、新しい注入がリスナーを追加せず、
//     既存の（生きているかもしれない）リスナーと同じメッセージを共有する
//     ことで、同一DOMに対する複数の並行実行を防ぐ。

;(function () {
  'use strict'
  try {
    if (window.__NOTE_TRANSFER_LISTENER_INSTALLED__) {
      // 既にリスナー登録済み（前回注入分がまだ生きている可能性がある）。
      // 二重登録・並行実行を避けるためここで終了する。
      return
    }
    window.__NOTE_TRANSFER_LISTENER_INSTALLED__ = true

    /** 診断ログ送信（マロン指示：「診断ログ送信をawaitしない。ログ通信障害で
     * 本処理を停止させない」）。fire-and-forgetで送り、失敗しても無視する。 */
    function logNonBlocking(event, detail) {
      try {
        const maybePromise = chrome.runtime.sendMessage({ type: 'note-transfer:log', event, detail: detail ?? null })
        if (maybePromise && typeof maybePromise.catch === 'function') {
          maybePromise.catch(() => {})
        }
      } catch (e) {
        // 診断ログ送信自体の失敗で本処理を止めない。
      }
    }

    logNonBlocking('injected_file_top_level_start', { url: location.href, readyState: document.readyState })

    // 2026-09-14続き27（マロン指示：「実行中スクリプトとの重複を防止する」）：
    // window.__NOTE_TRANSFER_LISTENER_INSTALLED__ガードは「リスナーの二重
    // 登録」は防ぐが、同一リスナーが複数のnote-transfer:runメッセージを
    // 並行して処理してしまうこと自体は防げない（watchdogタイムアウト後、
    // 前回の実行がタブ内でまだ生きている状態で新しいメッセージが届く
    // ケースを想定）。isRunningフラグで、実行中は新規実行を開始せず
    // 即座に「実行中」を報告することで、同一DOMへの並行操作を確実に防ぐ。
    let isRunning = false

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== 'note-transfer:run') return false
      const buildRevision = msg.buildRevision ?? null
      if (isRunning) {
        logNonBlocking('injected_run_already_in_progress', {})
        sendResponse({
          status: 'failure',
          error: 'stage=injected_run_already_in_progress: 既に実行中のため新しい実行を開始しませんでした（同一DOMへの並行操作防止）',
          stages: [],
          buildRevision,
        })
        return true
      }
      isRunning = true
      handleRun(msg.item, buildRevision, logNonBlocking)
        .then((result) => {
          try {
            sendResponse(result)
          } catch (e) {
            // sendResponse自体が失敗しても（チャネルが既に閉じている等）
            // これ以上できることはない。
          }
        })
        .catch((e) => {
          // handleRun内部で最外周try/catchが必ず結果を返す設計だが、万一
          // それ自体が例外を投げた場合の最終防波堤。
          try {
            sendResponse({
              status: 'failure',
              error: `stage=uncaught_exception_top_level: ${String(e?.message ?? e)}`,
              stack: String(e?.stack ?? '').slice(0, 2000),
              stages: [],
              buildRevision,
            })
          } catch (e2) {
            // 何もできない。
          }
        })
        .finally(() => {
          isRunning = false
        })
      return true // 非同期でsendResponseすることを示す。
    })
  } catch (e) {
    // トップレベルの登録処理自体が失敗しても、最低限ログだけは試みる
    // （window未定義等の極端なケースの保険。要件どおりtry/catch/finallyで
    // 第1命令から囲む）。
    try {
      chrome.runtime.sendMessage({
        type: 'note-transfer:log',
        event: 'injected_file_top_level_error',
        detail: { message: String(e?.message ?? e), stack: String(e?.stack ?? '').slice(0, 500) },
      })
    } catch (e2) {
      // 何もできない。
    }
  } finally {
    // 要件どおりtry/catch/finallyで完全に囲む（特筆すべき後処理は無い）。
  }

  /**
   * 実際の転記処理の最外周。第1命令からtry/catch/finallyで囲み、
   * 必ず {status, error, stack, stages, buildRevision, ...} を返す
   * （マロン指示：「注入処理の第1命令から最外周try/catch/finallyで囲み、
   * 必ずこの構造を戻す」）。
   */
  async function handleRun(item, buildRevision, log) {
    const stages = []
    let finished = false
    try {
      const result = await runTransfer(item, log, stages)
      finished = true
      return { ...result, stages: result.stages ?? stages, buildRevision }
    } catch (e) {
      log('uncaught_exception_in_injected_function', { message: String(e?.message ?? e), stack: String(e?.stack ?? '').slice(0, 2000) })
      return {
        status: 'failure',
        error: `stage=uncaught_exception_in_injected_function: ${String(e?.message ?? e)}`,
        stack: String(e?.stack ?? '').slice(0, 2000),
        stages,
        buildRevision,
      }
    } finally {
      if (!finished) {
        log('handle_run_finally_without_normal_return', { note: 'try節が正常return以外の経路（例外・早期return漏れ）で終わった' })
      }
    }
  }

  async function runTransfer(item, log, stages) {
    const mode = item.mode === 'completion' ? 'completion' : 'full'

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
      const byInput = deepQuerySelectorAll('input[type="text"], input:not([type])').find(
        (el) => isVisible(el) && /タグ|ハッシュタグ|tag/i.test(placeholderLike(el)),
      )
      if (byInput) return byInput
      return deepQuerySelectorAll('[contenteditable="true"], [role="textbox"]').find(
        (el) => isVisible(el) && /タグ|ハッシュタグ|tag/i.test(placeholderLike(el)),
      )
    }
    function nearestClickable(el) {
      let node = el
      while (node) {
        if (typeof node.click === 'function') return node
        node = node.parentElement
      }
      return null
    }
    function clickElement(el) {
      const target = nearestClickable(el) || el
      if (target && typeof target.click === 'function') {
        target.click()
        return true
      }
      try {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        return true
      } catch {
        return false
      }
    }
    function findClickableByLabel(patterns) {
      const candidates = deepQuerySelectorAll('button, [role="button"], a, [aria-label], [title]')
      const matched = candidates.find((el) => {
        if (!isVisible(el)) return false
        const label = (el.getAttribute('aria-label') || el.getAttribute('title') || visibleText(el) || '').trim()
        if (!label) return false
        if (/公開/.test(label)) return false // 絶対除外
        return patterns.some((p) => p.test(label))
      })
      return matched ? nearestClickable(matched) || matched : undefined
    }
    // 「公開」を含む文言のうち、最終的に公開を確定させるボタンだけを明示的に
    // 禁止する（「公開に進む」は設定画面への遷移であり対象外）。
    const PUBLISH_FINAL_RE = /^公開する$|投稿する|この内容で公開|今すぐ公開|公開して(終了|完了)/
    function isForbiddenPublishLabel(label) {
      return PUBLISH_FINAL_RE.test(label)
    }
    function findProceedToPublishButton() {
      return deepQuerySelectorAll('button, [role="button"], a').find((el) => {
        if (!isVisible(el)) return false
        const t = visibleText(el)
        if (!t) return false
        if (isForbiddenPublishLabel(t)) return false
        return /公開に進む/.test(t)
      })
    }
    function findConfirmLikeButton() {
      return deepQuerySelectorAll('button, [role="button"]').find((el) => {
        if (!isVisible(el)) return false
        const t = visibleText(el)
        if (!t) return false
        if (/公開/.test(t)) return false
        return /確定|適用|設定する|完了|トリミング|OK/.test(t)
      })
    }
    /** 選択済みタグ領域だけを対象にし、サジェスト候補（統計文言「件」付き）
     * を誤って数えないようにする（マロン指示、2026-09-14続き25）。 */
    function countAppliedHashtags(expectedTagsNoHash, scopeEl) {
      const texts = deepQuerySelectorAll('span, div, li, button, a, p', scopeEl || document)
        .filter(isVisible)
        .map(visibleText)
        .filter((t) => t && t.length < 40 && !/件/.test(t))
      let count = 0
      for (const tag of expectedTagsNoHash) {
        if (texts.some((t) => t === `#${tag}` || t === tag)) count++
      }
      return count
    }
    function findHashtagScopeContainer(inputEl) {
      if (!inputEl) return null
      let node = inputEl.parentElement
      let candidate = inputEl.parentElement
      for (let i = 0; i < 6 && node; i++) {
        if (/件/.test(visibleText(node))) break
        candidate = node
        node = node.parentElement
      }
      return candidate
    }
    function findWrongHashtagChips(expectedTagsNoHash, scopeEl) {
      return deepQuerySelectorAll('span, div, li, button, a', scopeEl || document).filter((el) => {
        if (!isVisible(el)) return false
        const t = visibleText(el)
        if (!t || t.length >= 40 || /件/.test(t)) return false
        if (!/^#/.test(t)) return false
        return !expectedTagsNoHash.some((tag) => t === `#${tag}`)
      })
    }
    function findChipRemoveButton(chipEl) {
      const REMOVE_RE = /削除|閉じる|remove|close|^×$|^✕$|^✖$/i
      const withinChip = deepQuerySelectorAll('button, [role="button"], [aria-label]', chipEl).find((el) => {
        const label = (el.getAttribute('aria-label') || el.getAttribute('title') || visibleText(el) || '').trim()
        return REMOVE_RE.test(label)
      })
      if (withinChip) return withinChip
      const parent = chipEl.parentElement
      if (!parent) return null
      return (
        Array.from(parent.children).find((el) => {
          if (el === chipEl) return false
          const label = (el.getAttribute('aria-label') || el.getAttribute('title') || visibleText(el) || '').trim()
          return REMOVE_RE.test(label)
        }) || null
      )
    }
    function checkIconApplied(fileNameHint) {
      const imgs = deepQuerySelectorAll('img').filter(isVisible)
      return imgs.some((img) => {
        const src = img.getAttribute('src') || ''
        return src.startsWith('blob:') || src.startsWith('data:') || (fileNameHint && src.includes(fileNameHint))
      })
    }
    async function normalizedHash(text) {
      const normalized = (text || '').trim().replace(/\s+/g, ' ')
      const enc = new TextEncoder().encode(normalized)
      const buf = await crypto.subtle.digest('SHA-256', enc)
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
    }
    function findUploadOptionButton() {
      return deepQuerySelectorAll('button, [role="button"]').find((el) => {
        if (!isVisible(el)) return false
        const t = visibleText(el)
        if (!t) return false
        if (/記事にあう画像を選ぶ/.test(t)) return false
        return /画像をアップロード/.test(t)
      })
    }
    async function revealAndFindFileInput() {
      let fi = deepQuerySelectorAll('input[type="file"]')[0]
      if (fi) return { fi, revealed: false }
      const trigger = findClickableByLabel([/画像/i, /サムネイル/i, /アイキャッチ/i, /カバー/i, /image/i])
      if (!trigger) return { fi: null, revealed: false, triggerFound: false }
      clickElement(trigger)
      await sleep(600)
      fi = deepQuerySelectorAll('input[type="file"]')[0]
      const triggerLabel = (trigger.getAttribute('aria-label') || visibleText(trigger) || '').slice(0, 30)
      if (fi) return { fi, revealed: true, triggerFound: true, triggerLabel }
      const uploadOption = findUploadOptionButton()
      if (!uploadOption) return { fi: null, revealed: true, triggerFound: true, triggerLabel, uploadOptionFound: false }
      log('image_upload_option_click', { text: visibleText(uploadOption) })
      clickElement(uploadOption)
      await sleep(600)
      fi = deepQuerySelectorAll('input[type="file"]')[0]
      return { fi, revealed: !!fi, triggerFound: true, triggerLabel, uploadOptionFound: true, uploadOptionClicked: true }
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
      const labeled = deepQuerySelectorAll('[aria-label], [title]')
        .filter(isVisible)
        .map((el) => ({ tag: el.tagName.toLowerCase(), ariaLabel: el.getAttribute('aria-label'), title: el.getAttribute('title') }))
        .filter((x) => x.ariaLabel || x.title)
        .slice(0, 40)
      const images = deepQuerySelectorAll('img')
        .filter(isVisible)
        .map((el) => ({ src: (el.getAttribute('src') || '').slice(0, 80), alt: el.getAttribute('alt') }))
        .slice(0, 20)
      return { buttons, editableSummary, textareas, inputs, labeled, images, title: document.title, bodyChildCount: document.body ? document.body.children.length : 0 }
    }
    function findCancelButton() {
      return deepQuerySelectorAll('button, [role="button"]').find((el) => {
        if (!isVisible(el)) return false
        const t = visibleText(el)
        if (!t) return false
        if (/公開/.test(t)) return false
        return /^キャンセル$|^戻る$/.test(t)
      })
    }

    log('injected_transfer_started', { url: location.href, readyState: document.readyState, mode })
    await waitForPageLoad(15000)
    log('page_load_state', { readyState: document.readyState })

    const ready = await waitFor(() => findTitleField() || deepQuerySelectorAll('[contenteditable="true"]').length > 0, 20000)
    const snapshot = domDebugSnapshot()
    log('dom_snapshot', snapshot)
    if (!ready) {
      return { status: 'failure', error: 'stage=editor_not_ready: エディタの初期化を検出できませんでした', debug: snapshot, stages }
    }
    await sleep(500)

    let titleField = findTitleField()
    let bodyField = null

    // マロン指示：「タイトル・本文は再入力しない」——completion-onlyモード
    // （このジョブの対象）ではfullモードのタイトル・本文書き込み経路
    // そのものを通らない。以下は既存記事の下書き作成（本経路が現状使われて
    // いないfullモード）向けに残しているのみで、completion専用ジョブの
    // 動作には影響しない。
    if (mode === 'full') {
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

      bodyField = findBodyField(titleField.el)
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
    }

    let titleHashBefore = null
    let bodyHashBefore = null
    if (mode === 'completion') {
      // completion-onlyジョブ：タイトル・本文は既に保存済みのはず——再入力せず、
      // 既存の内容が0文字でないことだけ確認する（sanity check、書き換えない）。
      bodyField = titleField ? findBodyField(titleField.el) : findBodyField(null)
      const titleSanity = readBackText(titleField)
      const bodySanity = readBackText(bodyField)
      log('completion_sanity_check', { titleLength: titleSanity.length, bodyLength: bodySanity.length })
      titleHashBefore = await normalizedHash(titleSanity)
      bodyHashBefore = await normalizedHash(bodySanity)
      log('content_hash_before', { titleHash: titleHashBefore.slice(0, 12), bodyHash: bodyHashBefore.slice(0, 12) })
    }

    // --- ① カテゴリー画像（編集画面上部の「画像＋」ボタンのみを対象とする） ---
    let { fi: fileInput, revealed: iconRevealed, triggerFound: iconTriggerFound, triggerLabel: iconTriggerLabel } =
      await revealAndFindFileInput()
    let imageNotFoundSnapshot = null
    if (!fileInput) {
      imageNotFoundSnapshot = domDebugSnapshot()
      log('image_trigger_not_found_on_editor', imageNotFoundSnapshot)
    }

    const img = item.categoryIcon
    const imageAvailable = !!(img && img.url && img.fileName && img.mimeType && img.sha256)

    let iconResult
    if (!imageAvailable) {
      iconResult = {
        attached: false,
        noUsableImageFile: true,
        reason: item?.categoryIconUnavailableReason || 'カテゴリーアイコン情報が不完全（url/fileName/mimeType/sha256のいずれかが欠落）',
      }
      log('no_usable_image_file', { reason: iconResult.reason })
    } else if (!fileInput) {
      iconResult = {
        attached: false,
        reason: iconTriggerFound ? 'クリックしても画像入力欄が出現しなかった（編集画面上）' : '編集画面上に画像トリガー（「画像を追加」等）が見つからない',
        debug: imageNotFoundSnapshot,
      }
    } else {
      try {
        const res = await fetch(img.url)
        const buf = await res.arrayBuffer()
        const hashBuf = await crypto.subtle.digest('SHA-256', buf)
        const actualSha256 = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('')
        log('image_sha256_verify', { expected: img.sha256.slice(0, 12), actual: actualSha256.slice(0, 12), match: actualSha256 === img.sha256 })
        if (actualSha256 !== img.sha256) {
          iconResult = { attached: false, reason: `stage=image_integrity_mismatch: 取得した画像のSHA-256が一致しません（改変・破損の疑い）` }
        } else {
          const blob = new Blob([buf], { type: img.mimeType })
          const file = new File([blob], img.fileName, { type: img.mimeType })
          const beforePreviewImgs = new Set(deepQuerySelectorAll('img').map((el) => el.getAttribute('src')).filter((s) => s && s.startsWith('blob:')))
          const dt = new DataTransfer()
          dt.items.add(file)
          fileInput.files = dt.files
          fileInput.dispatchEvent(new Event('change', { bubbles: true }))
          await sleep(800)
          const confirmBtn = await waitFor(() => findConfirmLikeButton(), 4000)
          if (confirmBtn) {
            log('image_adjust_confirm_click', { text: visibleText(confirmBtn) })
            clickElement(confirmBtn)
            await sleep(500)
          }
          const previewAppeared = await waitFor(() => {
            const current = deepQuerySelectorAll('img')
              .map((el) => el.getAttribute('src'))
              .filter((s) => s && s.startsWith('blob:') && !beforePreviewImgs.has(s))
            return current.length > 0 ? true : null
          }, 5000)
          log('image_preview_verify', { previewAppeared: !!previewAppeared })
          iconResult = {
            attached: !!previewAppeared,
            reason: previewAppeared ? undefined : 'stage=image_preview_not_verified: アップロード後のプレビュー画像（blob:src）が確認できませんでした',
            revealed: iconRevealed,
            triggerLabel: iconTriggerLabel,
            fileName: img.fileName,
            sha256Verified: true,
          }
        }
      } catch (e) {
        iconResult = { attached: false, reason: String(e?.message ?? e), revealed: iconRevealed }
      }
    }
    log('icon_attach_done', iconResult)
    await sleep(300)

    // --- ② 下書き保存（編集画面上で直接） ---
    let saveBtn = await waitFor(() => findSaveDraftButton(), 4000)
    if (!saveBtn) {
      return {
        status: 'failure',
        error: 'stage=save_button_not_found: 「下書き保存」ボタンが見つかりません（公開ボタンは対象外のため誤操作はしていません）',
        debug: domDebugSnapshot(),
        iconResult,
        stages,
      }
    }
    log('save_button_found', { text: visibleText(saveBtn), stage: 'editor' })
    clickElement(saveBtn)
    await sleep(2000)

    // --- ③ ハッシュタグの確認・補正（選択済みタグ領域だけをスコープ対象に
    // する。サジェスト候補は数えない） ---
    const expectedTagsNoHash = (item.hashtags || []).map((t) => t.replace(/^#/, ''))
    let appliedTagCount = countAppliedHashtags(expectedTagsNoHash)
    let navigatedToSettings = false
    let hashtagResult = { checkedOn: 'editor', appliedTagCount, expectedCount: expectedTagsNoHash.length }

    if (appliedTagCount < expectedTagsNoHash.length && expectedTagsNoHash.length > 0) {
      const proceedBtn = findProceedToPublishButton()
      if (proceedBtn) {
        log('proceed_to_settings_for_hashtag_check', { text: visibleText(proceedBtn) })
        clickElement(proceedBtn)
        navigatedToSettings = true
        await waitFor(() => findHashtagInput() !== null, 8000)
        await sleep(500)
        log('settings_screen_snapshot', domDebugSnapshot())

        const hashtagInputEl = findHashtagInput()
        const hashtagScope = findHashtagScopeContainer(hashtagInputEl)
        log('hashtag_scope_resolved', { scopeFound: !!hashtagScope, inputFound: !!hashtagInputEl })

        const wrongChips = findWrongHashtagChips(expectedTagsNoHash, hashtagScope)
        let removedWrongCount = 0
        for (const chip of wrongChips) {
          const removeBtn = findChipRemoveButton(chip)
          if (removeBtn) {
            log('hashtag_wrong_chip_removed', { text: visibleText(chip) })
            clickElement(removeBtn)
            await sleep(200)
            removedWrongCount++
          } else {
            log('hashtag_wrong_chip_remove_button_not_found', { text: visibleText(chip) })
          }
        }

        const currentTexts = deepQuerySelectorAll('span, div, li, button, a, p', hashtagScope || document)
          .filter(isVisible)
          .map(visibleText)
          .filter((t) => t && t.length < 40 && !/件/.test(t))
        const missingTags = expectedTagsNoHash.filter((tag) => !currentTexts.some((t) => t === `#${tag}` || t === tag))
        if (missingTags.length > 0 && hashtagInputEl) {
          for (const tag of missingTags) {
            setNativeValue(hashtagInputEl, tag)
            pressEnter(hashtagInputEl)
            await sleep(200)
          }
        }

        appliedTagCount = countAppliedHashtags(expectedTagsNoHash, hashtagScope)
        hashtagResult = {
          checkedOn: 'settings',
          appliedTagCount,
          expectedCount: expectedTagsNoHash.length,
          removedWrongCount,
          typedMissingCount: missingTags.length,
        }
        log('hashtags_verified', hashtagResult)

        // --- ④ キャンセル経由で編集画面へ戻る（最終公開には一切触れない） ---
        const cancelBtn = findCancelButton()
        if (cancelBtn) {
          log('cancel_button_click', { text: visibleText(cancelBtn) })
          clickElement(cancelBtn)
          await sleep(800)
        } else {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }))
          await sleep(500)
        }

        if (missingTags.length > 0 || removedWrongCount > 0) {
          const saveBtnAfterTags = await waitFor(() => findSaveDraftButton(), 4000)
          if (saveBtnAfterTags) {
            log('save_button_found', { text: visibleText(saveBtnAfterTags), stage: 'after_hashtag_correction' })
            clickElement(saveBtnAfterTags)
            await sleep(2000)
          }
        }
      } else {
        log('proceed_to_settings_not_found_for_hashtag_check', {})
      }
    } else {
      log('hashtags_already_confirmed_on_editor', hashtagResult)
    }

    const iconApplied = checkIconApplied(iconResult.fileName)
    log('hashtag_icon_readback', { appliedTagCount, expectedTagCount: expectedTagsNoHash.length, iconApplied })

    if (mode === 'full') {
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
    }

    let integrityOk = true
    if (mode === 'completion' && titleHashBefore && bodyHashBefore) {
      const finalTitleField = findTitleField()
      const finalBodyField = finalTitleField ? findBodyField(finalTitleField.el) : bodyField
      const titleHashAfter = await normalizedHash(readBackText(finalTitleField))
      const bodyHashAfter = await normalizedHash(readBackText(finalBodyField))
      integrityOk = titleHashAfter === titleHashBefore && bodyHashAfter === bodyHashBefore
      log('content_hash_after', {
        titleHash: titleHashAfter.slice(0, 12),
        bodyHash: bodyHashAfter.slice(0, 12),
        integrityOk,
      })
      if (!integrityOk) {
        return {
          status: 'failure',
          error: 'stage=content_integrity_check_failed: ハッシュタグ・画像操作の前後でタイトルまたは本文のハッシュが一致しませんでした',
          stages,
        }
      }
    }

    const hashtagsDone = appliedTagCount >= expectedTagsNoHash.length && expectedTagsNoHash.length > 0
    const iconDone = iconResult.attached === true

    return {
      status: 'success',
      draftUrl: location.href,
      hashtagResult,
      iconResult,
      hashtagsDone,
      iconDone,
      appliedTagCount,
      expectedTagCount: expectedTagsNoHash.length,
      iconApplied,
      integrityOk,
      stages,
    }
  }
})()
