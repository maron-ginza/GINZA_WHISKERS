// GINZA WHISKERS Note Auto-Transfer — background service worker（2026-09-14新設、
// 2026-09-14 実機エラー修正、2026-09-14 続き editor.note.com 対応）。
//
// 【2026-09-14 続き】実際の編集画面URLは https://editor.note.com/notes/{noteId}/edit/
// であることが判明した（note.com/notes/new は新規作成の入口にすぎず、実際の
// 編集はeditor.note.comサブドメインへ遷移してから行われる）。URL判定を
// urlMatch.js（isomorphic・Node のテストからも同じ関数を検証できる）へ切り出し、
// checkPending() は新規タブを無条件に作るのではなく、まず「既に開いている
// note編集タブ」（今回のケースではマロンが既に開いていた空のeditor.note.com編集
// 画面）を chrome.tabs.query で探し、見つかればそれを再読み込みして使う
// （新しいmanifestのcontent_scripts.matchesが効くのは新規ナビゲーション時のみの
// ため、既存タブへは reload が必要）。見つからなければ従来どおり
// note.com/notes/new を新規タブで開く（旧URLとの互換性を維持）。
//
// ローカルサーバー（cms/src/scripts/noteTransferServer.ts、既定 http://localhost:4601）へ
// 定期的に「未転記の承認済み記事はあるか」を問い合わせ、あれば note.com/notes/new を
// 新規タブで開き、content script（同一拡張、note.com側で自動実行される）へ
// タイトル・本文・ハッシュタグ・カテゴリーアイコンを渡す。結果（成功／失敗）は
// content script から受け取り、そのままローカルサーバーへ報告する。
//
// 【2026-09-14 実機エラー修正】manifest.json の permissions に "alarms"／"storage" が
// 欠けており、①"Service worker registration failed. Status code: 15" ②"Uncaught
// TypeError: Cannot read properties of undefined (reading 'onAlarm')" が発生していた
// （権限が無いと chrome.alarms 自体が undefined になり、トップレベルで
// `chrome.alarms.onAlarm.addListener(...)` を呼ぶと即座に例外→Service Worker
// 全体の登録が失敗する）。manifest.json 側で権限を追加したうえで、**この
// スクリプト側にも**「chrome.alarms が万一利用できない場合でもトップレベル
// 例外でService Worker全体を落とさない」防御処理を追加した（safeSetupAlarms
// が undefined チェックしてから呼び出し、失敗時は setTimeout ベースの
// フォールバックポーリングへ切り替える）。chrome.storage についても同様に
// 存在チェックを行い、無ければメモリ内変数へフォールバックする
// （Service Worker再起動をまたぐ永続性は失うが、起動不能にはしない）。
//
// 【安全境界】
//   - このスクリプトは note の「公開」ボタンには一切触れない（content.js 側で
//     物理的に除外している）。
//   - 同一 articleId を二重に処理しないよう、進行中の articleId は
//     chrome.storage.local（`inFlightArticleId`、利用不能ならメモリ内変数）で
//     管理する。
//   - ローカルサーバー側でも「in_progress」「success」「failed（3回失敗）」の
//     状態を持ち、多重防止・リトライ上限（3回）を二重に担保している。

const SERVER_BASE = 'http://localhost:4601'
const POLL_ALARM = 'note-transfer-poll'
const POLL_INTERVAL_MS = 20000

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

// --- chrome.storage が使えない場合のメモリ内フォールバック ---
let memoryInFlightArticleId = null
const storageAvailable = !!(chrome.storage && chrome.storage.local)
if (!storageAvailable) {
  console.warn('[note-transfer] chrome.storage.local が利用できません（"storage" 権限を確認してください）。' +
    'Service Worker再起動をまたぐ永続性なしのメモリ内フォールバックで動作します。')
}

async function getInFlight() {
  if (!storageAvailable) return memoryInFlightArticleId
  try {
    const { inFlightArticleId } = await chrome.storage.local.get('inFlightArticleId')
    return inFlightArticleId ?? null
  } catch (e) {
    console.error('[note-transfer] chrome.storage.local.get 失敗', e)
    return memoryInFlightArticleId
  }
}
async function setInFlight(articleId) {
  memoryInFlightArticleId = articleId
  if (!storageAvailable) return
  try {
    if (articleId == null) await chrome.storage.local.remove('inFlightArticleId')
    else await chrome.storage.local.set({ inFlightArticleId: articleId })
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
    if (candidates.length > 0) {
      // editor.note.com（実際の編集画面）を優先し、note.com/notes/new（入口）は次点。
      candidates.sort((a, b) => {
        const score = (t) => (new URL(t.url).hostname === 'editor.note.com' ? 0 : 1)
        return score(a) - score(b)
      })
      const target = candidates[0]
      await chrome.tabs.reload(target.id)
      return target
    }
  } catch (e) {
    console.error('[note-transfer] 既存タブの検索に失敗、新規タブを開きます', e)
  }
  return chrome.tabs.create({ url: NOTE_NEW_DRAFT_URL, active: false })
}

async function checkPending() {
  try {
    const inFlight = await getInFlight()
    if (inFlight != null) return // 既に処理中の記事がある間は新規に取りに行かない

    const res = await fetch(`${SERVER_BASE}/api/note-transfer/pending`)
    if (!res.ok) return
    const data = await res.json()
    if (!data.ok || !data.item) return

    const item = data.item
    await setInFlight(item.articleId)

    const tab = await findOrOpenNoteEditorTab()
    // content script の起動・onMessage登録を待つため、readyメッセージを待つ
    // （タブ作成／再読み込み直後は content script がまだ読み込まれていない
    // 可能性があるため）。
    pendingItemByTab.set(tab.id, item)
  } catch (e) {
    console.error('[note-transfer] pending check failed', e)
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

chrome.runtime.onInstalled.addListener(() => {
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id
  if (!tabId) return

  if (msg?.type === 'note-transfer:ready') {
    const item = pendingItemByTab.get(tabId)
    if (item) {
      chrome.tabs.sendMessage(tabId, { type: 'note-transfer:start', item })
      pendingItemByTab.delete(tabId)
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
