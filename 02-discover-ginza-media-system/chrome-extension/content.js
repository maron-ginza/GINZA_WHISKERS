// GINZA WHISKERS Note Auto-Transfer — content script（2026-09-14新設、
// 2026-09-14 続き editor.note.com 対応）。
// 実際の編集画面 https://editor.note.com/notes/{noteId}/edit/ 、および互換性
// のため旧URL note.com/notes/new・note.com/<username>/n/<noteId>/edit へ、
// Chrome 拡張の content_scripts として自動注入される（Claude in Chrome の
// オンデマンド script injection とは別の仕組み——マニフェストの宣言的
// マッチングにより、ページ読み込み時にブラウザ自身が実行する。2026-09-02・
// 2026-09-13 に再現したタイムアウト障害の再発を避けるための設計）。
// このスクリプト自体はDOM構造だけを見て動作するためURLホストには依存しない
// （URL側の対象範囲は manifest.json の content_scripts.matches と
// urlMatch.js が管理する）。
//
// 【絶対禁止】「公開に進む」「公開する」等、公開系ボタンには一切触れない。
// クリック対象を探すときは常に「下書き保存」に一致するテキストのみを対象にする。
//
// 【設計方針】note.com の内部DOM構造（クラス名等）は非公開で変更されうるため、
// 特定クラス名に依存せず、role・placeholder・可視テキスト・contenteditable属性
// といった安定しやすい手がかりで要素を探す。失敗時はその場で諦めず候補を複数
// 試したうえで、最終的に失敗した場合は「何を試して何が見つからなかったか」を
// 構造化して報告する（次回の修正判断に使う）。

;(function () {
  chrome.runtime.sendMessage({ type: 'note-transfer:ready' })

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'note-transfer:start' && msg.item) {
      runTransfer(msg.item).catch((e) => {
        report(msg.item.articleId, 'failure', { error: String(e?.message ?? e) })
      })
    }
  })

  function report(articleId, status, extra) {
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

  function visibleText(el) {
    return (el.innerText || el.textContent || '').trim()
  }

  function isVisible(el) {
    if (!el) return false
    const rect = el.getBoundingClientRect()
    const style = window.getComputedStyle(el)
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
  }

  function findTitleField() {
    // 1) placeholder に「タイトル」を含む textarea / input
    const byPlaceholder = Array.from(document.querySelectorAll('textarea, input[type="text"]')).find(
      (el) => isVisible(el) && /タイトル|title/i.test(el.getAttribute('placeholder') || ''),
    )
    if (byPlaceholder) return { el: byPlaceholder, kind: byPlaceholder.tagName.toLowerCase() }

    // 2) contenteditable のうち、ページ最上部にあり見出し的なもの
    const editables = Array.from(document.querySelectorAll('[contenteditable="true"]')).filter(isVisible)
    if (editables.length > 0) {
      const sorted = editables.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      return { el: sorted[0], kind: 'contenteditable' }
    }
    return null
  }

  function findBodyField(excludeEl) {
    const editables = Array.from(document.querySelectorAll('[contenteditable="true"]')).filter(
      (el) => isVisible(el) && el !== excludeEl,
    )
    if (editables.length === 0) return null
    // 本文は通常もっとも大きい（縦に長い）編集領域
    const sorted = editables.sort((a, b) => {
      const ra = a.getBoundingClientRect()
      const rb = b.getBoundingClientRect()
      return rb.width * rb.height - ra.width * ra.height
    })
    return { el: sorted[0], kind: 'contenteditable' }
  }

  function findHashtagInput() {
    return Array.from(document.querySelectorAll('input[type="text"], input:not([type])')).find(
      (el) => isVisible(el) && /タグ|ハッシュタグ|tag/i.test(el.getAttribute('placeholder') || ''),
    )
  }

  function findSaveDraftButton() {
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], a'))
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
    const fileInput = document.querySelector('input[type="file"][accept*="image"], input[type="file"]')
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
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter(isVisible)
      .map((b) => visibleText(b))
      .filter(Boolean)
      .slice(0, 30)
    const editableCount = document.querySelectorAll('[contenteditable="true"]').length
    const textareaCount = document.querySelectorAll('textarea').length
    return { buttons, editableCount, textareaCount, url: location.href }
  }

  async function runTransfer(item) {
    // エディタが描画されるまで待つ（タイトル欄 or 本文欄のいずれかが出現するまで）
    const ready = await waitFor(() => findTitleField() || document.querySelector('[contenteditable="true"]'), 20000)
    if (!ready) {
      report(item.articleId, 'failure', { error: 'エディタの初期化を検出できませんでした', debug: domDebugSnapshot() })
      return
    }
    await sleep(500)

    const titleField = findTitleField()
    if (!titleField) {
      report(item.articleId, 'failure', { error: 'タイトル入力欄が見つかりません', debug: domDebugSnapshot() })
      return
    }
    if (titleField.kind === 'textarea' || titleField.kind === 'input') {
      setNativeValue(titleField.el, item.title)
    } else {
      titleField.el.focus()
      document.execCommand('selectAll', false)
      document.execCommand('insertText', false, item.title)
    }
    await sleep(300)

    const bodyField = findBodyField(titleField.el)
    if (!bodyField) {
      report(item.articleId, 'failure', { error: '本文入力欄が見つかりません', debug: domDebugSnapshot() })
      return
    }
    await setContentEditableParagraphs(bodyField.el, item.body)
    await sleep(500)

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

    // カテゴリーアイコン画像（任意。失敗しても本文・タイトル・保存は続行する——
    // 画像なし記事を正規の運用として許容する既存Editorial Trust Layer方針を踏襲）。
    const iconResult = await attachCategoryIcon(item.categoryIcon)
    await sleep(300)

    const saveBtn = await waitFor(() => findSaveDraftButton(), 8000)
    if (!saveBtn) {
      report(item.articleId, 'failure', {
        error: '「下書き保存」ボタンが見つかりません（公開ボタンは対象外のため誤操作はしていません）',
        debug: domDebugSnapshot(),
        hashtagResult,
        iconResult,
      })
      return
    }
    saveBtn.click()
    await sleep(2000)

    report(item.articleId, 'success', {
      draftUrl: location.href,
      hashtagResult,
      iconResult,
    })
  }
})()
