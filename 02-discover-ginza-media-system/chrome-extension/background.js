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
    // content script の起動・onMessage登録を待つため、readyメッセージを待つ
    // （タブ作成／再読み込み直後は content script がまだ読み込まれていない
    // 可能性があるため）。
    pendingItemByTab.set(tab.id, item)
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
