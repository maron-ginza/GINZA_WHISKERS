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

// 2026-09-14続き9（マロン指示）：「拡張を再読み込みしたのに何も起きない」
// 事象が繰り返され、readmoteログだけでは「Chromeが実際に本コミットのコードを
// 読み込んだのか」「別フォルダ／古いコードを見ているのか」を判別できなかった。
// BUILD_REVISIONを手動採番の識別子として持ち、manifest.jsonのversionと
// 対で必ずbumpする——マロンはchrome://extensionsに表示されるversionと、
// このログに出るbuildRevisionが一致しているかどうかで「読み込ませるべき
// コードが実際に読み込まれたか」を確認できる。chrome.runtime.id（拡張の
// インストールID。別フォルダから読み込むと変わる）・manifest.version・
// 拡張がインストールされたモード（unpacked等）も併記する。
const BUILD_REVISION = 'br21-2026-09-14-modal-wait-heartbeat'
logToServer('service_worker_evaluated', {
  ts: Date.now(),
  buildRevision: BUILD_REVISION,
  manifestVersion: chrome.runtime.getManifest?.().version ?? null,
  extensionId: chrome.runtime.id ?? null,
})

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
async function findOrOpenNoteEditorTab(preferredUrl) {
  try {
    const tabs = await chrome.tabs.query({})
    const candidates = tabs.filter((t) => isNoteEditorTargetUrl(t.url))
    logToServer('tabs_queried', { totalTabs: tabs.length, candidateCount: candidates.length, candidateUrls: candidates.map((t) => t.url), preferredUrl: preferredUrl ?? null })

    if (preferredUrl) {
      // 2026-09-14続き5・続き8：completion-onlyジョブ（既存の下書きへ戻って
      // ハッシュタグ・アイコンだけ追加する）の場合、preferredUrl（既存の
      // draftUrl）と完全一致するタブだけを再利用する。**実機で発見した
      // バグ**：完全一致タブが無いとき、以前は「他の適当なnote編集タブ
      // （マロンが別記事のために手動で開いた無関係な新規下書き等）」へ
      // フォールバックしてしまい、対象記事とは無関係なタブを操作していた。
      // 完全一致が無ければ（他のnoteタブの有無に関わらず）必ず
      // preferredUrlを直接開く——別記事のタブを誤って使わない。
      const exact = candidates.find((t) => t.url === preferredUrl)
      if (exact) {
        // 2026-09-14続き23（マロン指示）：completion-onlyジョブでは
        // tabs.reloadを禁止する——注入経路が chrome.scripting.executeScript
        // （現在のDOM状態へ直接注入）である以上、reloadによる再ナビゲーション
        // は不要かつ有害（reload直後のDOM未確定状態でのタイムアウトが実機で
        // 繰り返し観測された）。既存タブをそのままの状態で再利用する。
        logToServer('existing_tab_reused_no_reload', { tabId: exact.id, url: exact.url, matchedPreferredUrl: true })
        return exact
      }
      logToServer('preferred_url_tab_not_found_opening_directly', { preferredUrl, otherCandidateUrls: candidates.map((t) => t.url) })
    } else if (candidates.length > 0) {
      // preferredUrl指定なし（'full'モード＝新規下書き作成）の場合のみ、
      // 既存のnote編集タブ（どの記事のものでもよい）を再利用する。
      candidates.sort((a, b) => {
        const score = (t) => (new URL(t.url).hostname === 'editor.note.com' ? 0 : 1)
        return score(a) - score(b)
      })
      const target = candidates[0]
      await chrome.tabs.reload(target.id)
      logToServer('existing_tab_reloaded', { tabId: target.id, url: target.url, matchedPreferredUrl: false })
      return target
    }
  } catch (e) {
    console.error('[note-transfer] 既存タブの検索に失敗、新規タブを開きます', e)
    logToServer('tab_query_failed', { error: String(e?.message ?? e) })
  }
  // completion-onlyジョブで既存タブが見つからない場合は、preferredUrl（実在する
  // 下書きの編集URL）を直接開く——新規下書きを作らない。
  const openUrl = preferredUrl || NOTE_NEW_DRAFT_URL
  const created = await chrome.tabs.create({ url: openUrl, active: false })
  logToServer('new_tab_created', { tabId: created.id, url: openUrl })
  return created
}

/**
 * 2026-09-14続き27：旧 injectedNoteTransfer（func:方式でchrome.scripting.
 * executeScriptへ直接渡していた、外部クロージャ非依存の自己完結関数）は
 * ここにあった。実機で3回連続、注入関数の最初の1行のログすら届かないまま
 * 約140秒間無応答になる現象が再現し（DECISION_LOG_02.md
 * 2026-09-13続き26）、func:のFunction.prototype.toString()による直列化・
 * 対象タブ内での再構築というステップ自体を疑う理由が生じたため、固定
 * content scriptファイル injected-transfer.js を files: で注入し、データは
 * chrome.tabs.sendMessageで渡す構成へ置き換えた（マロン指示）。実際の転記
 * ロジック本体（ハッシュタグ・カテゴリー画像・下書き保存等）は
 * injected-transfer.js 側にそのまま移植済み。呼び出し側は
 * runTransferViaExecuteScript（下記）を参照。
 */

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

// 2026-09-14続き32（マロン指示：「開始から固定90秒で失敗にする方式を廃止
// してください。stage進行をheartbeatとして更新し、一定時間stage更新がない
// 場合だけ停止判定してください。処理継続中にtransfer-stateをfailedへ変更
// しないでください」）：
// 続き27の固定90秒watchdogは、v1.18.0実機検証でheartbeatなしの単純な
// 「開始からの経過時間」判定だったため、実際には約225秒かけて正常に
// hashtags/save/content-hashまで完了していた実行を「無応答」と誤って
// 失敗判定してしまう事象が発生した（DECISION_LOG_02.md 2026-09-13
// 続き32）。注入されたスクリプトが送る各stageログ（chrome.runtime.
// sendMessage）を「まだ生きて進行している」証跡（heartbeat）として扱い、
// 直近のheartbeatからSTALL_MS以上新しいログが届かない場合にのみ「停止
// （stall）」と判定する——固定の総経過時間では判定しない。万一heartbeat
// 自体が永久に途絶えない異常事態に備え、ABSOLUTE_CAP_MSを保険として残す
// （通常はstall判定が先に効き、ここへは到達しない想定）。
const HEARTBEAT_STALL_MS = 20000 // この時間、新しいstageログが届かなければ停止とみなす。
const HEARTBEAT_POLL_MS = 2000
const HEARTBEAT_ABSOLUTE_CAP_MS = 10 * 60 * 1000 // 保険の絶対上限（10分）。通常はstall判定が先に効く。

// 現在実行中のジョブの最終stageログ受信時刻（tabIdごと）。
// note-transfer:log受信時（下部のchrome.runtime.onMessageリスナー）に更新する。
const lastHeartbeatByTab = new Map()

// 2026-09-14続き31：SW側の画像取得1工程あたりのタイムアウト（マロン指示
// 「各工程5秒以内に成功または明示的failureを返す」）。
const SW_IMAGE_STAGE_TIMEOUT_MS = 5000

function withStageTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ __timedOut: true }), ms)),
  ])
}

/**
 * 2026-09-14続き31（マロン指示）：「editor.note.comのページコンテキストから
 * 画像をfetchする構成を廃止してください」——続き30の実機検証で、
 * ページコンテキスト（injected-transfer.js、chrome.scripting.
 * executeScriptのisolated world）からのfetch(img.url)がeditor.note.comの
 * CSP等によって一度もサーバーへ到達しないまま5秒でタイムアウトする現象を
 * 確認した。background Service Worker（拡張の特権コンテキスト、ページの
 * CSPの影響を受けない）側でサーバーから画像バイト列を取得・検証し、
 * base64としてtabs.sendMessageで渡す構成へ変更する——ページ側は一切の
 * ネットワークfetchを行わない。
 *
 * HTTP status・mimeType・sizeBytes・SHA-256のすべてを検証し、1つでも
 * 一致しなければ画像なしとして扱う（他画像への無断代替禁止の原則）。
 * 各工程（fetch／サイズ照合／SHA-256計算）に個別5秒上限を設ける。
 */
async function fetchAndVerifyCategoryIconInBackground(categoryIcon) {
  if (!categoryIcon || !categoryIcon.url || !categoryIcon.fileName || !categoryIcon.mimeType || !categoryIcon.sha256) {
    return { ok: false, reason: 'カテゴリーアイコン情報が不完全（url/fileName/mimeType/sha256のいずれかが欠落）' }
  }
  logToServer('sw_image_fetch_start', { url: categoryIcon.url })
  try {
    const res = await withStageTimeout(fetch(categoryIcon.url), SW_IMAGE_STAGE_TIMEOUT_MS)
    if (res && res.__timedOut) {
      logToServer('sw_image_fetch_timeout', { url: categoryIcon.url })
      return { ok: false, reason: 'stage=sw_image_fetch_timeout: SW側での画像取得が5秒以内に完了しませんでした' }
    }
    if (!res.ok) {
      logToServer('sw_image_fetch_http_error', { status: res.status })
      return { ok: false, reason: `stage=sw_image_fetch_http_error: HTTP ${res.status}` }
    }
    logToServer('sw_image_fetch_done', { status: res.status })

    const buf = await withStageTimeout(res.arrayBuffer(), SW_IMAGE_STAGE_TIMEOUT_MS)
    if (buf && buf.__timedOut) {
      logToServer('sw_image_array_buffer_timeout', {})
      return { ok: false, reason: 'stage=sw_image_array_buffer_timeout: 画像データの読み取りが5秒以内に完了しませんでした' }
    }
    if (buf.byteLength !== categoryIcon.sizeBytes) {
      logToServer('sw_image_size_mismatch', { expected: categoryIcon.sizeBytes, actual: buf.byteLength })
      return { ok: false, reason: `stage=sw_image_size_mismatch: 期待${categoryIcon.sizeBytes}バイト、実際${buf.byteLength}バイト（改変・破損の疑い）` }
    }

    const hashBuf = await withStageTimeout(crypto.subtle.digest('SHA-256', buf), SW_IMAGE_STAGE_TIMEOUT_MS)
    if (hashBuf && hashBuf.__timedOut) {
      logToServer('sw_image_sha256_digest_timeout', {})
      return { ok: false, reason: 'stage=sw_image_sha256_digest_timeout: SHA-256計算が5秒以内に完了しませんでした' }
    }
    const actualSha256 = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('')
    logToServer('sw_image_sha256_verify', { expected: categoryIcon.sha256.slice(0, 12), actual: actualSha256.slice(0, 12), match: actualSha256 === categoryIcon.sha256 })
    if (actualSha256 !== categoryIcon.sha256) {
      return { ok: false, reason: 'stage=sw_image_sha256_mismatch: 取得した画像のSHA-256が一致しません（改変・破損の疑い）' }
    }

    // base64へエンコードしてtabs.sendMessageで渡せる形にする
    // （マロン指示：「base64またはシリアライズ可能な数値配列」）。
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const base64 = btoa(binary)
    logToServer('sw_image_base64_encoded', { byteLength: bytes.length })

    return {
      ok: true,
      fileName: categoryIcon.fileName,
      mimeType: categoryIcon.mimeType,
      sha256: actualSha256,
      sizeBytes: buf.byteLength,
      base64,
    }
  } catch (e) {
    logToServer('sw_image_fetch_error', { error: String(e?.message ?? e) })
    return { ok: false, reason: `stage=sw_image_fetch_error: ${String(e?.message ?? e)}` }
  }
}

/**
 * 固定content scriptファイル（injected-transfer.js）をchrome.scripting.
 * executeScript({files:[...]})で注入し、データはchrome.tabs.sendMessageで
 * 渡す（2026-09-14続き27、マロン指示）。
 *
 * 【変更理由】func:方式（Function.prototype.toString()による直列化・対象
 * タブ内での再構築）で3回連続、注入関数の最初の1行のログすら届かないまま
 * 約140秒間無応答になる現象が実機で再現した（DECISION_LOG_02.md
 * 2026-09-13続き26）。Service Worker Consoleにエラーが0件だったことから、
 * 直列化・再構築のステップ自体か、その周辺に問題がある可能性を排除できな
 * かったため、そのステップ自体を無くす構成へ変更した。
 *
 * 成功・失敗いずれもここでサーバーへ報告し、inFlightもここでクリアする。
 */
async function runTransferViaExecuteScript(tabId, item) {
  logToServer('execute_script_attempt', { tabId, articleId: item.articleId })
  try {
    // 2026-09-14続き31（マロン指示）：画像はページコンテキストでfetchせず、
    // SW側（この関数、拡張の特権コンテキスト）で事前に取得・検証し、
    // 検証済みのbase64データをメッセージへ含める。categoryIconが無い
    // 場合はそのままnullで送る（既存のno_usable_image_file経路が
    // ページ側で処理する）。
    const categoryIconAsset = item.categoryIcon ? await fetchAndVerifyCategoryIconInBackground(item.categoryIcon) : null

    // ① 固定ファイルを注入する（トップレベルのリスナー登録まで完了して
    // からPromiseが解決する。二重登録防止ガードはinjected-transfer.js側）。
    await chrome.scripting.executeScript({ target: { tabId }, files: ['injected-transfer.js'] })
    logToServer('injected_file_injected', { tabId })

    // ② データをtabs.sendMessageで渡し、heartbeatベースのstall検知付きで
    // 結果を待つ（2026-09-14続き32、マロン指示：固定経過時間ではなく
    // 「stage更新が一定時間無いこと」で停止と判定する）。
    lastHeartbeatByTab.set(tabId, Date.now())
    const runPromise = chrome.tabs.sendMessage(tabId, {
      type: 'note-transfer:run',
      item,
      buildRevision: BUILD_REVISION,
      categoryIconAsset,
    })
    const stallPromise = new Promise((resolve) => {
      const startedAt = Date.now()
      const interval = setInterval(() => {
        const lastHeartbeat = lastHeartbeatByTab.get(tabId) ?? startedAt
        const sinceHeartbeat = Date.now() - lastHeartbeat
        const sinceStart = Date.now() - startedAt
        if (sinceHeartbeat >= HEARTBEAT_STALL_MS) {
          clearInterval(interval)
          resolve({ __stalled: true, reason: 'heartbeat_stall', sinceHeartbeat })
        } else if (sinceStart >= HEARTBEAT_ABSOLUTE_CAP_MS) {
          clearInterval(interval)
          resolve({ __stalled: true, reason: 'absolute_cap', sinceStart })
        }
      }, HEARTBEAT_POLL_MS)
      // runPromiseが先に解決した場合もこのintervalを止める（Promise.race
      // で決着後、不要なintervalを回し続けない）。
      runPromise.finally(() => clearInterval(interval)).catch(() => {})
    })
    const result = await Promise.race([runPromise, stallPromise])
    lastHeartbeatByTab.delete(tabId)

    if (result && result.__stalled) {
      // heartbeatベースのstall判定後の自動再試行はしない（マロン指示）。
      // 1回だけ失敗報告する——実行中のスクリプト（もし生きていれば）は
      // injected-transfer.js側のisRunningガードにより、この後の新規実行と
      // 重複しない設計。
      logToServer('injected_run_heartbeat_stall', { tabId, reason: result.reason, sinceHeartbeat: result.sinceHeartbeat, sinceStart: result.sinceStart })
      await reportResult(item.articleId, 'failure', {
        error: `stage=injected_run_heartbeat_stall: ${HEARTBEAT_STALL_MS}ms間stageの更新が無かったため停止と判定しました（reason=${result.reason}）`,
        mode: item.mode,
        runToken: item.runToken,
      })
      return
    }

    if (!result) {
      // 2026-09-14続き6で発見した重大バグの修正：ここで mode: item.mode を
      // 渡し忘れていたため、completion-onlyジョブの失敗がサーバー側で
      // 通常ジョブの失敗（recordFailure、既存のattempts/statusを破壊し
      // 'success'を'pending'へ格下げしてしまう）として処理され、3回で
      // status='failed'に恒久固定されてしまっていた（実機で発生・確認済み）。
      logToServer('execute_script_no_result', { tabId, mode: item.mode })
      await reportResult(item.articleId, 'failure', {
        error: 'stage=execute_script_no_result: 注入したスクリプトから結果が返りませんでした',
        mode: item.mode,
        runToken: item.runToken,
      })
      return
    }
    // 注入した関数が内部で記録した段階別ログ（stages）をまとめてサーバーへ転送する。
    for (const s of result.stages ?? []) {
      logToServer(s.event, { ...s.detail, tabId, via: 'injected-file' })
    }
    if (result.status === 'success') {
      // 2026-09-14続き23：statusがsuccessでも画像トリガーが編集画面で
      // 見つからなかった場合は iconResult.debug にdom_snapshotが入っている
      // ——success応答でも握りつぶさずサーバーへ転送し、診断できるようにする
      // （画像以外は成功してしまい失敗経路のdebug送信が一度も発火しなかった
      // 実機での反省を踏まえた対応）。
      // 2026-09-14続き32（マロン指示）：runTokenを結果報告に含め、サーバー
      // 側が「このクレームの結果であること」を検証できるようにする
      // （原子的1回claimの一部）。
      await reportResult(item.articleId, 'success', {
        draftUrl: result.draftUrl,
        mode: item.mode,
        hashtagsDone: result.hashtagsDone,
        iconDone: result.iconDone,
        iconDebug: result.iconResult?.debug ?? null,
        runToken: item.runToken,
      })
      // 2026-09-14続き24（マロン指示）：「既存の非表示タブで完了している
      // 場合は、そのタブを新規作成せず前面表示する」——ハッシュタグ・画像とも
      // 完全に完了した場合のみタブをアクティブ化する（マロンが手を止めて
      // 見に来る必要がある「本当に完了した」瞬間だけに限定し、まだ途中の
      // 自動再試行のたびに画面を奪わない）。
      if (result.hashtagsDone === true && result.iconDone === true) {
        try {
          await chrome.tabs.update(tabId, { active: true })
          logToServer('tab_focused_on_completion', { tabId })
        } catch (e) {
          logToServer('tab_focus_failed', { tabId, error: String(e?.message ?? e) })
        }
      }
    } else {
      await reportResult(item.articleId, 'failure', { error: result.error, debug: result.debug, mode: item.mode, runToken: item.runToken })
    }
  } catch (e) {
    logToServer('execute_script_error', { tabId, error: String(e?.message ?? e), stack: String(e?.stack ?? '').slice(0, 500) })
    await reportResult(item.articleId, 'failure', { error: `stage=execute_script_error: ${String(e?.message ?? e)}`, mode: item.mode, runToken: item.runToken })
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
    logToServer('pending_item_claimed', { articleId: item.articleId, mode: item.mode })
    await setInFlight(item.articleId)

    // 2026-09-14続き5：completion-onlyジョブ（既存の下書きのハッシュタグ・
    // アイコンだけ追加する）の場合は、既存の下書きURLへ優先的に戻る
    // （新規下書きを作らない・別記事のタブを誤って使わない）。
    const preferredUrl = item.mode === 'completion' ? item.existingDraftUrl : undefined
    const tab = await findOrOpenNoteEditorTab(preferredUrl)
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
  logToServer('on_installed', { reason: details?.reason, buildRevision: BUILD_REVISION })
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
    // content.js／injected-transfer.js からの段階別診断ログをそのまま
    // サーバーへ転送する。
    logToServer(msg.event, { ...msg.detail, tabId, frame: sender.frameId })
    // 2026-09-14続き32（マロン指示：「stage進行をheartbeatとして更新する」）
    // ——このtabIdで進行中のジョブがあれば、stageログの受信自体を
    // 「まだ生きて進行している」証跡として記録する。
    if (tabId != null) lastHeartbeatByTab.set(tabId, Date.now())
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
