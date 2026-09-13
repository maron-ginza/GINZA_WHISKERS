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
      // 2026-09-14続き31（マロン指示）：画像はページコンテキストでfetchせず、
      // background Service Worker側で取得・検証済みのbase64データを
      // categoryIconAssetとして受け取る。
      handleRun(msg.item, buildRevision, logNonBlocking, msg.categoryIconAsset ?? null)
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
  async function handleRun(item, buildRevision, log, categoryIconAsset) {
    const stages = []
    let finished = false
    try {
      const result = await runTransfer(item, log, stages, categoryIconAsset)
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

  async function runTransfer(item, log, stages, categoryIconAsset) {
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
    /**
     * 2026-09-14続き29（マロン必須修正②：「revealAndFindFileInput内の全
     * Promise…に個別5秒の上限を設ける」）：任意のPromiseへ単発のタイムアウト
     * を付与する。タイムアウトした場合は`{ __timedOut: true, label }`を
     * 返す（例外を投げない——呼び出し側が結果の型で判定できるようにする）。
     * 元のPromiseが後から解決/棄却されても、既にタイムアウト分岐へ進んだ
     * 後続処理には一切影響しない（Promise.raceの標準的な性質）。
     */
    function raceWithTimeout(promise, ms, label) {
      let timer
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve({ __timedOut: true, label }), ms)
      })
      return Promise.race([Promise.resolve(promise), timeout]).then((r) => {
        clearTimeout(timer)
        return r
      })
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
    /**
     * 2026-09-14続き29（マロン必須修正③：「DOM探索は探索ノード数・深さ・
     * 経過時間を制限し、循環参照や無限探索を防止する」）：v1.16.0の実機
     * 検証で「content_hash_before送信直後からrevealAndFindFileInput開始前」
     * の区間で約90秒間無応答になる現象が再現し、その直前・直後に位置する
     * 本関数（shadow DOMを再帰的に辿る）が原因である可能性が高いと判断した
     * ——本関数は完全に同期処理のため、途中でハングすればイベントループへ
     * 制御が戻らず、以後のログ送信・watchdog双方が（watchdogはSW側の
     * setTimeoutのため実際には発火するが、ページ側の処理自体は）事実上
     * 停止して見える。以下の3つの上限を追加し、同期処理としての最大実行
     * 時間そのものを構造的に有限化する：
     *   - maxDepth：shadow root再帰の深さ上限（既定12）
     *   - maxNodes：訪問するshadow host（shadowRootを持つ要素）の総数上限
     *     （既定20000）
     *   - budgetMs：本関数呼び出し1回あたりの経過時間上限（既定5000ms、
     *     マロン指示の「個別5秒の上限」と揃える）
     * さらに`visited`（WeakSet）で同一ノードの再訪問を防ぎ、shadow DOMの
     * 構造上ありえないはずの循環参照が万一存在しても無限ループにならない
     * ようにする。上限に達した場合は`truncated:true`で打ち切り、収集済みの
     * 結果をそのまま返す（例外は投げない——呼び出し側の探索ロジックを壊さ
     * ない）。
     */
    function deepQuerySelectorAll(selector, root = document, opts) {
      const maxDepth = (opts && opts.maxDepth) || 12
      const maxNodes = (opts && opts.maxNodes) || 20000
      const budgetMs = (opts && opts.budgetMs) || 5000
      const start = Date.now()
      const out = []
      const visited = new WeakSet()
      let visitedCount = 0
      let truncated = false
      const walk = (node, depth) => {
        if (!node || truncated) return
        if (typeof node !== 'object') return
        if (visited.has(node)) return // 循環参照防止（shadow DOM構造上は通常ありえないが念のため）。
        visited.add(node)
        if (depth > maxDepth) {
          truncated = true
          return
        }
        if (Date.now() - start > budgetMs) {
          truncated = true
          return
        }
        if (typeof node.querySelectorAll !== 'function') return
        out.push(...node.querySelectorAll(selector))
        const all = node.querySelectorAll('*')
        for (const el of all) {
          visitedCount++
          if (visitedCount > maxNodes) {
            truncated = true
            break
          }
          if (Date.now() - start > budgetMs) {
            truncated = true
            break
          }
          if (el.shadowRoot) walk(el.shadowRoot, depth + 1)
        }
      }
      walk(root, 0)
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
    /**
     * 2026-09-14続き32（マロン指示）：「類似するfile inputが複数ある場合は、
     * 画像アップロードUI配下かつaccept=imageの入力欄だけを使用してください」。
     * 候補が1つならそれをそのまま使う。複数ある場合はaccept属性が画像を
     * 示すものへ絞り込み、さらに祖先に画像アップロード関連のラベルを持つ
     * ものを優先する（推測で無関係な入力欄を使わない）。
     */
    function findImageFileInput() {
      const all = deepQuerySelectorAll('input[type="file"]')
      if (all.length <= 1) return all[0] || null
      const imageAccepting = all.filter((el) => {
        const accept = (el.getAttribute('accept') || '').toLowerCase()
        return accept === '' || accept.includes('image')
      })
      const candidates = imageAccepting.length > 0 ? imageAccepting : all
      if (candidates.length === 1) return candidates[0]
      const nearUploadUi = candidates.find((el) => {
        let node = el.parentElement
        for (let i = 0; i < 6 && node; i++) {
          const label = ((node.getAttribute && node.getAttribute('aria-label')) || visibleText(node) || '').slice(0, 200)
          if (/画像|サムネイル|アイキャッチ|カバー|image/i.test(label)) return true
          node = node.parentElement
        }
        return false
      })
      return nearUploadUi || candidates[0]
    }
    /** 選択したfile input自体の診断情報（マロン指示：「使用したfile inputの
     * accept・name・outerHTML・表示状態」「input.files.length」「files[0]の
     * name・type・size」）。 */
    function describeFileInput(el) {
      if (!el) return null
      const f0 = el.files && el.files.length > 0 ? el.files[0] : null
      return {
        accept: el.getAttribute('accept'),
        name: el.getAttribute('name'),
        outerHTML: (el.outerHTML || '').slice(0, 500),
        visible: isVisible(el),
        filesLength: el.files ? el.files.length : 0,
        file0Name: f0 ? f0.name : null,
        file0Type: f0 ? f0.type : null,
        file0Size: f0 ? f0.size : null,
      }
    }
    /** 指定ノード配下のDOM変化をMutationObserverで一定時間観測して要約する
     * （マロン指示：「発火後のDOM Mutation」を記録）。失敗しても例外を
     * 投げず、必ずms経過後に解決する（ハング防止）。 */
    function observeMutationsFor(targetNode, ms) {
      return new Promise((resolvePromise) => {
        const collected = []
        let observer
        try {
          observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
              if (collected.length >= 50) break
              collected.push({
                type: m.type,
                addedNodes: m.addedNodes.length,
                removedNodes: m.removedNodes.length,
                attributeName: m.attributeName || null,
                targetTag: m.target && m.target.tagName ? m.target.tagName.toLowerCase() : null,
              })
            }
          })
          observer.observe(targetNode || document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'style'],
          })
        } catch (e) {
          resolvePromise({ error: String(e?.message ?? e), mutations: [] })
          return
        }
        setTimeout(() => {
          try {
            observer.disconnect()
          } catch (e) {
            // 何もできない。
          }
          resolvePromise({ mutations: collected })
        }, ms)
      })
    }
    /** 可視要素のCSS background-imageのうちblob:/data:を含むものを列挙する
     * （マロン指示：「CSS background-image」も画像反映の判定材料にする）。 */
    function collectBackgroundImageUrls() {
      const out = []
      const elements = deepQuerySelectorAll('*', document, { budgetMs: 3000 })
      for (const el of elements) {
        if (!isVisible(el)) continue
        let bg = ''
        try {
          bg = window.getComputedStyle(el).backgroundImage
        } catch (e) {
          continue
        }
        if (bg && bg !== 'none' && (bg.includes('blob:') || bg.includes('data:'))) out.push(bg)
      }
      return out
    }
    /**
     * 2026-09-14続き32（マロン指示）：「プレビュー判定を『新しいblob img』
     * だけに限定せず、noteの実DOMに合わせてください」——新規blob/data画像
     * （<img>のsrc）・新規CSS background-image（blob:/data:）・canvas要素数
     * の増加・アップロード完了/エラーを示すテキスト、のいずれかを検出したら
     * 「反映された」とみなす。最大15秒待機し、確認できなければタイムアウト
     * として扱う（要素が見つからない場合も待ち続けない）。
     */
    async function verifyImageReflected(timeoutMs) {
      const beforeImgSrcs = new Set(
        deepQuerySelectorAll('img', document, { budgetMs: 5000 })
          .map((el) => el.getAttribute('src'))
          .filter((s) => s && (s.startsWith('blob:') || s.startsWith('data:'))),
      )
      const beforeBgUrls = new Set(collectBackgroundImageUrls())
      const beforeCanvasCount = deepQuerySelectorAll('canvas').length

      const mutationPromise = observeMutationsFor(document.body, timeoutMs)

      const start = Date.now()
      let matched = null
      while (Date.now() - start < timeoutMs) {
        const imgs = deepQuerySelectorAll('img', document, { budgetMs: 2000 })
        const newImg = imgs.find((el) => {
          const s = el.getAttribute('src')
          return s && (s.startsWith('blob:') || s.startsWith('data:')) && !beforeImgSrcs.has(s)
        })
        if (newImg) {
          matched = { kind: 'img', src: (newImg.getAttribute('src') || '').slice(0, 80) }
          break
        }

        const newBg = collectBackgroundImageUrls().find((bg) => !beforeBgUrls.has(bg))
        if (newBg) {
          matched = { kind: 'background-image' }
          break
        }

        const canvasCount = deepQuerySelectorAll('canvas').length
        if (canvasCount > beforeCanvasCount) {
          matched = { kind: 'canvas', count: canvasCount }
          break
        }

        const texts = deepQuerySelectorAll('span, div, p', document, { budgetMs: 2000 }).filter(isVisible).map(visibleText)
        const completionText = texts.find((t) => /アップロード完了|アップロードしました|画像を設定しました|設定完了/.test(t))
        if (completionText) {
          matched = { kind: 'completion_text', text: completionText.slice(0, 60) }
          break
        }
        const errorText = texts.find((t) => /アップロードに失敗|エラーが発生|失敗しました/.test(t))
        if (errorText) {
          matched = { kind: 'error_text', text: errorText.slice(0, 60) }
          break
        }

        await sleep(300)
      }
      const mutationSummary = await mutationPromise
      return { matched, mutationSummary, timedOut: !matched }
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
    /**
     * 2026-09-14続き29（マロン必須修正①・②・④：連番stageログ・全Promiseへの
     * 個別5秒上限・「画像を追加」クリック前後／「画像をアップロード」
     * クリック前後／file input探索前後をそれぞれ別stageにする）。
     * MutationObserverはこの関数（本ファイル全体）で一切使用していない
     * （該当箇所なし・追加もしていない）。
     */
    async function revealAndFindFileInput() {
      log('image_file_input_initial_search_start', {})
      const initial = await raceWithTimeout(
        Promise.resolve().then(() => findImageFileInput()),
        5000,
        'initial_file_input_search',
      )
      const initialTimedOut = !!(initial && initial.__timedOut)
      let fi = initialTimedOut ? undefined : initial
      log('image_file_input_initial_search_done', { found: !!fi, timedOut: initialTimedOut })
      if (fi) return { fi, revealed: false }

      log('image_add_trigger_search_start', {})
      const triggerResult = await raceWithTimeout(
        Promise.resolve().then(() => findClickableByLabel([/画像/i, /サムネイル/i, /アイキャッチ/i, /カバー/i, /image/i])),
        5000,
        'find_image_add_trigger',
      )
      const triggerTimedOut = !!(triggerResult && triggerResult.__timedOut)
      const trigger = triggerTimedOut ? undefined : triggerResult
      log('image_add_trigger_search_done', { found: !!trigger, timedOut: triggerTimedOut })
      if (!trigger) return { fi: null, revealed: false, triggerFound: false, timedOut: triggerTimedOut ? 'trigger_search' : undefined }

      log('image_add_click_start', { label: (trigger.getAttribute('aria-label') || visibleText(trigger) || '').slice(0, 30) })
      clickElement(trigger)
      log('image_add_click_done', {})

      await raceWithTimeout(sleep(600), 5000, 'post_image_add_click_wait')

      log('image_file_input_search_after_add_click_start', {})
      fi = await raceWithTimeout(
        Promise.resolve().then(() => findImageFileInput()),
        5000,
        'file_input_search_after_add_click',
      )
      const afterAddClickTimedOut = !!(fi && fi.__timedOut)
      if (afterAddClickTimedOut) fi = undefined
      log('image_file_input_search_after_add_click_done', { found: !!fi, timedOut: afterAddClickTimedOut })

      const triggerLabel = (trigger.getAttribute('aria-label') || visibleText(trigger) || '').slice(0, 30)
      if (fi) return { fi, revealed: true, triggerFound: true, triggerLabel }

      log('image_upload_option_search_start', {})
      const uploadOptionResult = await raceWithTimeout(Promise.resolve().then(() => findUploadOptionButton()), 5000, 'find_upload_option')
      const uploadOptionTimedOut = !!(uploadOptionResult && uploadOptionResult.__timedOut)
      const uploadOption = uploadOptionTimedOut ? undefined : uploadOptionResult
      log('image_upload_option_search_done', { found: !!uploadOption, timedOut: uploadOptionTimedOut })
      if (!uploadOption) {
        return { fi: null, revealed: true, triggerFound: true, triggerLabel, uploadOptionFound: false, timedOut: uploadOptionTimedOut ? 'upload_option_search' : undefined }
      }

      log('image_upload_option_click_start', { text: visibleText(uploadOption) })
      log('image_upload_option_click', { text: visibleText(uploadOption) }) // 既存ログ名（互換維持）。
      clickElement(uploadOption)
      log('image_upload_option_click_done', {})

      await raceWithTimeout(sleep(600), 5000, 'post_upload_option_click_wait')

      log('image_file_input_search_after_upload_click_start', {})
      fi = await raceWithTimeout(
        Promise.resolve().then(() => findImageFileInput()),
        5000,
        'file_input_search_after_upload_click',
      )
      const afterUploadClickTimedOut = !!(fi && fi.__timedOut)
      if (afterUploadClickTimedOut) fi = undefined
      log('image_file_input_search_after_upload_click_done', { found: !!fi, timedOut: afterUploadClickTimedOut })

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
    // 2026-09-14続き29（マロン必須修正①：「content_hash_beforeの直後から
    // 画像処理終了まで、各命令の前後に連番stageログを追加する」）：
    // v1.16.0実機検証でこの区間の直後（revealAndFindFileInput開始前後）で
    // 約90秒間無応答になる現象が再現したため、この区間全体に開始・終了
    // ログを追加し、次回失敗時に停止箇所をより精密に特定できるようにする。
    // マロン必須修正⑤（「要素が見つからない場合は待ち続けず、5秒以内に
    // 必ず結果を返す」）：区間内の各Promiseは個別5秒上限（画像反映確認のみ
    // 続き32でマロン指示により15秒）を持つが、それでも万一この区間全体が
    // 想定外に長引いた場合の最終防波堤として、区間全体をさらに外側から
    // 90秒（revealAndFindFileInputの最大約30秒＋SHA-256等の約10秒＋確認
    // ボタン探索5秒＋画像反映確認15秒を積み上げても収まる余裕を見た値、
    // 続き32で反映確認を5秒→15秒へ拡張したのに合わせて45秒→90秒へ拡大）
    // でraceWithTimeoutし、超過時は
    // {status:'failed', error, stack, stages, domSnapshot, buildRevision}
    // を確実に返す（buildRevisionはhandleRun側で結果へ合成される）。
    log('image_section_start', {})
    const imageSection = await raceWithTimeout(runImageSection(), 90000, 'image_section_overall')
    if (imageSection && imageSection.__timedOut) {
      const domSnapshot = domDebugSnapshot()
      log('image_section_overall_timeout', domSnapshot)
      return {
        status: 'failed',
        error: 'stage=image_section_overall_timeout: 画像処理区間が45秒以内に完了しませんでした',
        stack: '',
        stages,
        domSnapshot,
      }
    }
    const iconResult = imageSection.iconResult
    log('icon_attach_done', iconResult)
    log('image_section_end', {})
    await sleep(300)

    async function runImageSection() {
      let { fi: fileInput, revealed: iconRevealed, triggerFound: iconTriggerFound, triggerLabel: iconTriggerLabel } =
        await revealAndFindFileInput()
      log('image_reveal_and_find_file_input_done', { found: !!fileInput, triggerFound: iconTriggerFound })
      let imageNotFoundSnapshot = null
      if (!fileInput) {
        imageNotFoundSnapshot = domDebugSnapshot()
        log('image_trigger_not_found_on_editor', imageNotFoundSnapshot)
      }

      // 2026-09-14続き31（マロン指示）：「editor.note.comのページコンテキスト
      // から画像をfetchする構成を廃止」——画像はbackground Service Worker側
      // で事前に取得・検証済み（HTTP status・mimeType・sizeBytes・SHA-256
      // すべて検証済み）のものをcategoryIconAsset（base64）として受け取る。
      // このページコンテキストでは一切のネットワークfetchを行わない。
      const imageAvailable = !!(
        categoryIconAsset &&
        categoryIconAsset.ok &&
        categoryIconAsset.base64 &&
        categoryIconAsset.fileName &&
        categoryIconAsset.mimeType &&
        categoryIconAsset.sha256
      )

      let iconResult
      if (!imageAvailable) {
        iconResult = {
          attached: false,
          noUsableImageFile: true,
          reason:
            (categoryIconAsset && categoryIconAsset.reason) ||
            item?.categoryIconUnavailableReason ||
            'カテゴリーアイコン情報が不完全（SW側での取得・検証に失敗、またはbase64/fileName/mimeType/sha256のいずれかが欠落）',
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
          log('image_asset_received', { fileName: categoryIconAsset.fileName, sizeBytes: categoryIconAsset.sizeBytes, mimeType: categoryIconAsset.mimeType })

          log('image_file_construct_start', {})
          const decoded = await raceWithTimeout(
            Promise.resolve().then(() => {
              const binary = atob(categoryIconAsset.base64)
              const bytes = new Uint8Array(binary.length)
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
              return bytes
            }),
            5000,
            'image_base64_decode',
          )
          if (decoded && decoded.__timedOut) {
            throw new Error('stage=image_base64_decode_timeout: base64デコードが5秒以内に完了しませんでした')
          }

          // ページ側でも独自にSHA-256を再計算し照合する（マロン指示：
          // 「blob previewの出現とSHA-256一致を確認する」）——SW側の検証を
          // 信頼しつつ、メッセージ経路での破損・改変を二重に検出する。
          const hashBuf = await raceWithTimeout(crypto.subtle.digest('SHA-256', decoded), 5000, 'image_sha256_digest')
          if (hashBuf && hashBuf.__timedOut) {
            throw new Error('stage=image_sha256_digest_timeout: SHA-256計算が5秒以内に完了しませんでした')
          }
          const actualSha256 = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('')
          log('image_sha256_verify', { expected: categoryIconAsset.sha256.slice(0, 12), actual: actualSha256.slice(0, 12), match: actualSha256 === categoryIconAsset.sha256 })
          if (actualSha256 !== categoryIconAsset.sha256) {
            iconResult = { attached: false, reason: 'stage=image_integrity_mismatch: 受信した画像データのSHA-256が一致しません（改変・破損の疑い）' }
          } else {
            log('image_file_construct_done', { byteLength: decoded.length })

            // 2026-09-14続き32（マロン必須修正①）：DataTransfer設定直後に、
            // 使用したfile input自体の詳細（accept・name・outerHTML・表示
            // 状態）を記録する——複数候補がある場合の切り分け・次回失敗時の
            // 原因特定に使う。
            log('image_file_input_selected', describeFileInput(fileInput))

            const blob = new Blob([decoded], { type: categoryIconAsset.mimeType })
            const file = new File([blob], categoryIconAsset.fileName, { type: categoryIconAsset.mimeType })

            log('image_datatransfer_set_start', {})
            const dt = new DataTransfer()
            dt.items.add(file)
            fileInput.files = dt.files
            // マロン指示：「input/changeイベント発火結果」を記録する
            // （dispatchEventの戻り値＝preventDefaultされなかったか）。
            const inputEventResult = fileInput.dispatchEvent(new Event('input', { bubbles: true }))
            const changeEventResult = fileInput.dispatchEvent(new Event('change', { bubbles: true }))
            log('image_datatransfer_set_done', {
              filesLength: fileInput.files ? fileInput.files.length : 0,
              inputEventDispatched: inputEventResult,
              changeEventDispatched: changeEventResult,
            })

            log('image_adjust_confirm_search_start', {})
            const confirmBtn = await raceWithTimeout(waitFor(() => findConfirmLikeButton(), 4000), 5000, 'find_confirm_button')
            const confirmTimedOut = !!(confirmBtn && confirmBtn.__timedOut)
            log('image_adjust_confirm_search_done', { found: !!(confirmBtn && !confirmTimedOut), timedOut: confirmTimedOut })
            if (confirmBtn && !confirmTimedOut) {
              log('image_adjust_confirm_click', { text: visibleText(confirmBtn) })
              clickElement(confirmBtn)
              await raceWithTimeout(sleep(500), 5000, 'post_confirm_click_wait')
            }

            // 2026-09-14続き32（マロン必須修正①）：プレビュー判定を「新しい
            // blob img」だけに限定せず、CSS background-image・canvas・
            // アップロード完了/エラー文言・DOM Mutationも合わせて確認する。
            // 反映待機は最大15秒とし、確認できなければDOM snapshotと選択
            // input情報を返す（推測で「反映された」とみなさない）。
            log('image_reflection_check_start', { timeoutMs: 15000 })
            const reflection = await verifyImageReflected(15000)
            const previewOk = !!reflection.matched
            log('image_reflection_check_done', {
              matched: reflection.matched,
              timedOut: reflection.timedOut,
              mutationCount: (reflection.mutationSummary && reflection.mutationSummary.mutations && reflection.mutationSummary.mutations.length) || 0,
            })
            if (!previewOk) {
              log('image_reflection_check_timeout_snapshot', {
                selectedInput: describeFileInput(fileInput),
                dom: domDebugSnapshot(),
                mutationSummary: reflection.mutationSummary,
              })
            }
            iconResult = {
              attached: previewOk,
              reason: previewOk ? undefined : `stage=image_reflection_not_verified: アップロード後の画像反映（img/background-image/canvas/完了文言のいずれも）が15秒以内に確認できませんでした`,
              revealed: iconRevealed,
              triggerLabel: iconTriggerLabel,
              fileName: categoryIconAsset.fileName,
              sha256Verified: true,
              reflectionMatched: reflection.matched,
            }
          }
        } catch (e) {
          iconResult = { attached: false, reason: String(e?.message ?? e), revealed: iconRevealed }
        }
      }
      return { iconResult }
    }

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
