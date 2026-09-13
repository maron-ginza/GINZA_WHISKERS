// GINZA WHISKERS Note Auto-Transfer — content script（2026-09-14新設、
// 2026-09-14 続き editor.note.com 対応、2026-09-14 続き2 実機検証失敗の調査・強化）。
//
// 実際の編集画面 https://editor.note.com/notes/{noteId}/edit/ 、および互換性
// のため旧URL note.com/notes/new・note.com/<username>/n/<noteId>/edit へ、
// Chrome 拡張の content_scripts として自動注入される（Claude in Chrome の
// オンデマンド script injection とは別の仕組み——マニフェストの宣言的
// マッチングにより、ページ読み込み時にブラウザ自身が実行する）。
//
// 【2026-09-14続き2：実機検証1回目失敗を受けた強化】
// 実機で「タイトル・本文とも0文字のまま」失敗した（根本原因は background.js
// 側のinFlight永続化バグ——詳細はbackground.jsのコメント参照。content.js
// 自体が実際に動いたかどうかは、当時ログを取っていなかったため不明だった）。
// 二度と「原因不明のまま失敗」にしないため、以下を追加した：
//   ① 全主要ステップをローカルサーバーへ診断ログとして送信する（logStage）。
//      成功・失敗を問わず、起動直後に見えているDOM構造のスナップショットを
//      必ず1回送る——次回失敗時に実際のDOM構造を手がかりに修正できるように
//      するため（これまでは失敗時のみdebugを送っていた）。
//   ② タイトル・本文への書き込み後、**実際に読み戻して文字数を確認**し、
//      0文字なら書き込み失敗として扱う（そのフィールドの失敗ステージを
//      記録し、可能なら次の候補要素を試す。全滅したらタイトル/本文の
//      "not_verified" ステージで処理全体を失敗させ、絶対に成功報告しない）。
//   ③ 要素探索を強化：placeholder/aria-label/data-placeholder/role=textbox
//      に加え、Shadow DOM（カスタム要素のshadowRoot）内も再帰的に探索する。
//   ④ contenteditableへの書き込みは execCommand に加えて beforeinput/input/
//      change イベントも明示的に発火し、Reactベースのエディタが変更を
//      検知しやすくする。
//
// 【絶対禁止】「公開に進む」「公開する」等、公開系ボタンには一切触れない。
// クリック対象を探すときは常に「下書き保存」に一致するテキストのみを対象にする。

;(function () {
  const IS_TOP_FRAME = window === window.top

  function logStage(event, detail) {
    try {
      chrome.runtime.sendMessage({ type: 'note-transfer:log', event, detail: { ...detail, url: location.href, isTopFrame: IS_TOP_FRAME } })
    } catch {
      // 診断ログ送信の失敗で本処理を止めない。
    }
  }

  logStage('content_script_loaded', { readyState: document.readyState })
  chrome.runtime.sendMessage({ type: 'note-transfer:ready' })

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'note-transfer:start' && msg.item) {
      logStage('start_received', { articleId: msg.item.articleId })
      runTransfer(msg.item).catch((e) => {
        logStage('unhandled_exception', { error: String(e?.message ?? e) })
        report(msg.item.articleId, 'failure', { error: `unhandled_exception: ${String(e?.message ?? e)}` })
      })
    }
  })

  function report(articleId, status, extra) {
    logStage('report', { articleId, status, ...extra })
    chrome.runtime.sendMessage({ type: 'note-transfer:result', articleId, status, ...extra })
  }

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

  /** documentおよびすべてのshadowRoot内を再帰的にquerySelectorAllする
   *（カスタム要素・Shadow DOMベースのエディタに対応するため）。 */
  function deepQuerySelectorAll(selector, root = document) {
    const out = []
    const walk = (node) => {
      if (!node) return
      if (typeof node.querySelectorAll === 'function') {
        out.push(...node.querySelectorAll(selector))
      }
      const all = typeof node.querySelectorAll === 'function' ? node.querySelectorAll('*') : []
      for (const el of all) {
        if (el.shadowRoot) walk(el.shadowRoot)
      }
    }
    walk(root)
    return out
  }

  function placeholderLike(el) {
    return (
      el.getAttribute?.('placeholder') ||
      el.getAttribute?.('aria-label') ||
      el.getAttribute?.('data-placeholder') ||
      ''
    )
  }

  function findTitleField() {
    // 1) placeholder/aria-label/data-placeholder に「タイトル」を含む
    //    textarea / input / contenteditable / role=textbox
    const candidates = deepQuerySelectorAll(
      'textarea, input[type="text"], input:not([type]), [contenteditable="true"], [role="textbox"]',
    ).filter(isVisible)

    const byLabel = candidates.find((el) => /タイトル|title/i.test(placeholderLike(el)))
    if (byLabel) return { el: byLabel, kind: fieldKind(byLabel), reason: 'label-match' }

    // 2) H1相当（見出しタグ、またはページ最上部にある編集可能要素）
    const heading = candidates.find((el) => /^h1$/i.test(el.tagName))
    if (heading) return { el: heading, kind: fieldKind(heading), reason: 'heading-tag' }

    // 3) 編集可能要素のうち最も上に位置するもの
    const editableOnly = candidates.filter((el) => fieldKind(el) !== 'unknown')
    if (editableOnly.length > 0) {
      const sorted = [...editableOnly].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      return { el: sorted[0], kind: fieldKind(sorted[0]), reason: 'topmost-fallback' }
    }
    return null
  }

  function fieldKind(el) {
    const tag = el.tagName.toLowerCase()
    if (tag === 'textarea') return 'textarea'
    if (tag === 'input') return 'input'
    if (el.getAttribute('contenteditable') === 'true' || el.isContentEditable) return 'contenteditable'
    if (el.getAttribute('role') === 'textbox') return 'contenteditable'
    return 'unknown'
  }

  function findBodyField(excludeEl) {
    const candidates = deepQuerySelectorAll('[contenteditable="true"], [role="textbox"]').filter(
      (el) => isVisible(el) && el !== excludeEl && !excludeEl?.contains?.(el) && !el.contains?.(excludeEl),
    )
    if (candidates.length === 0) return null
    // 本文は通常もっとも大きい（縦に長い）編集領域
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
    if (desc && desc.set) {
      desc.set.call(el, value)
    } else {
      el.value = value
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function dispatchInputLikeEvents(el, text) {
    // execCommandに加えて、React等が拾う可能性のあるイベントも明示的に発火する。
    try {
      el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }))
    } catch {
      /* InputEvent未対応環境は無視 */
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
    } catch {
      /* 二重発火が問題になる場合はここで失敗しても致命的ではない */
    }
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
        document.execCommand('insertParagraph', false) // 空行1つ分の段落間隔
      }
    }
    dispatchInputLikeEvents(el, text)
  }

  function readBackText(field) {
    if (!field) return ''
    if (field.kind === 'textarea' || field.kind === 'input') return (field.el.value || '').trim()
    return (field.el.innerText || field.el.textContent || '').trim()
  }

  /** 書き込み後、実際に反映されるまで最大waitMsだけ待って読み戻す
   *（Reactベースのエディタは再描画に1tick必要な場合があるため）。
   * 0文字のままなら空文字列を返す——呼び出し側はこれを「書き込み失敗」として扱う。 */
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
      el.dispatchEvent(
        new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }),
      )
    }
  }

  async function attachCategoryIcon(iconInfo) {
    if (!iconInfo || !iconInfo.url) return { attached: false, reason: 'カテゴリーアイコン情報なし' }
    const fileInput = deepQuerySelectorAll('input[type="file"]')[0]
    if (!fileInput) return { attached: false, reason: 'ファイル入力要素が見つからない（画像挿入UIが表示されていない可能性）' }
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
    const buttons = deepQuerySelectorAll('button, [role="button"]')
      .filter(isVisible)
      .map((b) => visibleText(b))
      .filter(Boolean)
      .slice(0, 40)
    const editables = deepQuerySelectorAll('[contenteditable="true"], [role="textbox"]').filter(isVisible)
    const editableSummary = editables.slice(0, 20).map((el) => ({
      tag: el.tagName.toLowerCase(),
      placeholderLike: placeholderLike(el),
      rectWidth: Math.round(el.getBoundingClientRect().width),
      rectHeight: Math.round(el.getBoundingClientRect().height),
    }))
    const textareas = deepQuerySelectorAll('textarea').filter(isVisible).map((el) => ({ placeholder: el.getAttribute('placeholder') }))
    const inputs = deepQuerySelectorAll('input').filter(isVisible).map((el) => ({ type: el.getAttribute('type'), placeholder: el.getAttribute('placeholder') }))
    return {
      buttons,
      editableSummary,
      textareas,
      inputs,
      title: document.title,
      bodyChildCount: document.body ? document.body.children.length : 0,
    }
  }

  async function runTransfer(item) {
    await waitForPageLoad(15000)
    logStage('page_load_state', { readyState: document.readyState })

    // エディタが描画されるまで待つ（タイトル欄 or 本文欄のいずれかが出現するまで）
    const ready = await waitFor(() => findTitleField() || deepQuerySelectorAll('[contenteditable="true"]').length > 0, 20000)
    // 起動直後のDOMスナップショットは成否によらず必ず1回送る（次回の修正判断材料）。
    logStage('dom_snapshot', domDebugSnapshot())
    if (!ready) {
      report(item.articleId, 'failure', { error: 'stage=editor_not_ready: エディタの初期化を検出できませんでした' })
      return
    }
    await sleep(500)

    const titleField = findTitleField()
    if (!titleField) {
      report(item.articleId, 'failure', { error: 'stage=title_field_not_found', debug: domDebugSnapshot() })
      return
    }
    logStage('title_field_found', { kind: titleField.kind, reason: titleField.reason, tag: titleField.el.tagName })

    if (titleField.kind === 'textarea' || titleField.kind === 'input') {
      setNativeValue(titleField.el, item.title)
    } else {
      titleField.el.focus()
      document.execCommand('selectAll', false)
      document.execCommand('insertText', false, item.title)
      dispatchInputLikeEvents(titleField.el, item.title)
    }
    const titleReadback = await verifyWritten(titleField)
    logStage('title_write_verify', { length: titleReadback.length, sample: titleReadback.slice(0, 30) })
    if (titleReadback.length === 0) {
      report(item.articleId, 'failure', { error: 'stage=title_write_not_verified: タイトル欄への書き込みを読み戻せませんでした（0文字）', debug: domDebugSnapshot() })
      return
    }

    const bodyField = findBodyField(titleField.el)
    if (!bodyField) {
      report(item.articleId, 'failure', { error: 'stage=body_field_not_found', debug: domDebugSnapshot() })
      return
    }
    logStage('body_field_found', { kind: bodyField.kind, tag: bodyField.el.tagName })

    await setContentEditableParagraphs(bodyField.el, item.body)
    const bodyReadback = await verifyWritten(bodyField)
    logStage('body_write_verify', { length: bodyReadback.length, sample: bodyReadback.slice(0, 30) })
    if (bodyReadback.length === 0) {
      report(item.articleId, 'failure', { error: 'stage=body_write_not_verified: 本文欄への書き込みを読み戻せませんでした（0文字）', debug: domDebugSnapshot() })
      return
    }

    // ハッシュタグ（任意。見つからなくても致命的失敗にはしない）
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
    logStage('hashtags_done', hashtagResult)

    // カテゴリーアイコン画像（任意。失敗しても本文・タイトル・保存は続行する——
    // 画像なし記事を正規の運用として許容する既存Editorial Trust Layer方針を踏襲）。
    const iconResult = await attachCategoryIcon(item.categoryIcon)
    logStage('icon_attach_done', iconResult)
    await sleep(300)

    const saveBtn = await waitFor(() => findSaveDraftButton(), 8000)
    if (!saveBtn) {
      report(item.articleId, 'failure', {
        error: 'stage=save_button_not_found: 「下書き保存」ボタンが見つかりません（公開ボタンは対象外のため誤操作はしていません）',
        debug: domDebugSnapshot(),
        hashtagResult,
        iconResult,
      })
      return
    }
    logStage('save_button_found', { text: visibleText(saveBtn) })
    saveBtn.click()
    await sleep(2000)

    // 保存後も最終的にタイトル・本文が0文字に戻っていないか（保存操作が
    // フォームをクリアしてしまう等の異常が無いか）念のため再確認する。
    const finalTitle = readBackText(titleField)
    const finalBody = readBackText(bodyField)
    logStage('post_save_verify', { titleLength: finalTitle.length, bodyLength: finalBody.length })
    if (finalTitle.length === 0 || finalBody.length === 0) {
      report(item.articleId, 'failure', {
        error: `stage=post_save_verify_failed: 保存操作後にタイトル(${finalTitle.length}文字)または本文(${finalBody.length}文字)が0文字になりました`,
      })
      return
    }

    report(item.articleId, 'success', {
      draftUrl: location.href,
      hashtagResult,
      iconResult,
    })
  }
})()
