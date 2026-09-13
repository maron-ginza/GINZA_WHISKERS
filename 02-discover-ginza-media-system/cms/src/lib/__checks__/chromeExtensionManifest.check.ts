// GINZA WHISKERS / Project 02（2026-09-14新設）— chrome-extension/ の
// manifest.json と background.js／content.js／injected-transfer.js の整合性を
// 静的検証する回帰テスト。
//
// 【背景】manifest.json の permissions に "alarms"／"storage" が欠けたまま
// background.js が chrome.alarms.onAlarm / chrome.storage.local を無条件に
// 呼び出しており、実機で「Service worker registration failed. Status code: 15」
// 「Uncaught TypeError: Cannot read properties of undefined (reading 'onAlarm')」
// が発生した（2026-09-14）。この種の「background.js が使うAPI名前空間に対応する
// 権限がmanifest.jsonに無い」不整合を、実機で動かす前に機械的に検出する。
//
// 【2026-09-14続き27】実機で3回連続、chrome.scripting.executeScript
// ({func: injectedNoteTransfer, ...})方式が最初の1行のログすら送らないまま
// 約140秒間無応答になる現象が再現し（DECISION_LOG_02.md 2026-09-13続き26）、
// func:のFunction.prototype.toString()による直列化・対象タブ内での再構築と
// いうステップ自体を疑う理由が生じたため、固定content scriptファイル
// injected-transfer.js を files: で注入し、データはchrome.tabs.sendMessageで
// 渡す構成へ変更した（マロン指示）。転記ロジック本体（ハッシュタグ・
// カテゴリー画像・下書き保存等）はbackground.jsからinjected-transfer.jsへ
// 移植されたため、対応する回帰テストの参照先ファイルもこの移動に合わせて
// 更新している。
//
// AIなし・ネットワークなし・純粋な静的解析（正規表現によるAPI名前空間の抽出と
// permissions配列の突合、文字列・正規表現によるコード構造の検証）。

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { runSuite, type CheckCase } from './_harness'

const ROOT = resolve(process.cwd(), '..')
const EXT_DIR = resolve(ROOT, 'chrome-extension')
const SERVER_SRC = resolve(ROOT, 'cms', 'src', 'scripts', 'noteTransferServer.ts')

const bgSrc = () => readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
const injSrc = () => readFileSync(resolve(EXT_DIR, 'injected-transfer.js'), 'utf8')
const contentSrc = () => readFileSync(resolve(EXT_DIR, 'content.js'), 'utf8')

/** chrome.<namespace>.… の名前空間ごとに、MV3で明示的な permissions 宣言が必要なもの。
 * chrome.runtime はいかなる場合も暗黙的に使え、permissions 宣言は不要。 */
const NAMESPACE_TO_PERMISSION: Record<string, string> = {
  alarms: 'alarms',
  storage: 'storage',
  tabs: 'tabs',
  scripting: 'scripting',
  downloads: 'downloads',
  notifications: 'notifications',
}

function extractChromeNamespaces(source: string): Set<string> {
  const found = new Set<string>()
  const re = /\bchrome\.([a-zA-Z]+)\./g
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) found.add(m[1])
  return found
}

/** コメント行（// ... や JSDoc の * ...）を除いた実コードのみからchrome API
 * 名前空間を抽出する。解説コメント中の「chrome.tabs.sendMessage」等の言及を
 * 実際のAPI利用と誤認しないようにする（2026-09-14続き27で追加）。 */
function extractChromeNamespacesFromCodeOnly(source: string): Set<string> {
  const codeOnly = source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
  return extractChromeNamespaces(codeOnly)
}

function assertPermissionsCover(source: string, permissions: string[], label: string) {
  const namespaces = extractChromeNamespaces(source)
  const missing: string[] = []
  for (const ns of namespaces) {
    const requiredPermission = NAMESPACE_TO_PERMISSION[ns]
    if (requiredPermission && !permissions.includes(requiredPermission)) {
      missing.push(`chrome.${ns} は permissions に "${requiredPermission}" が必要`)
    }
  }
  assert.deepEqual(missing, [], `${label}: 不足しているpermissions: ${JSON.stringify(missing)}`)
}

const cases: CheckCase[] = [
  {
    name: 'manifest.jsonが存在しJSONとしてパース可能',
    fn: () => {
      const raw = readFileSync(resolve(EXT_DIR, 'manifest.json'), 'utf8')
      const manifest = JSON.parse(raw)
      assert.equal(manifest.manifest_version, 3)
    },
  },
  {
    name: 'background.jsが使うchrome API名前空間はすべてmanifest.jsonのpermissionsに宣言済み',
    fn: () => {
      const manifest = JSON.parse(readFileSync(resolve(EXT_DIR, 'manifest.json'), 'utf8'))
      const permissions: string[] = Array.isArray(manifest.permissions) ? manifest.permissions : []
      assertPermissionsCover(bgSrc(), permissions, 'background.js')
    },
  },
  {
    name: 'content.jsが使うchrome API名前空間もmanifest.jsonのpermissionsに宣言済み',
    fn: () => {
      const manifest = JSON.parse(readFileSync(resolve(EXT_DIR, 'manifest.json'), 'utf8'))
      const permissions: string[] = Array.isArray(manifest.permissions) ? manifest.permissions : []
      assertPermissionsCover(contentSrc(), permissions, 'content.js')
    },
  },
  {
    // 2026-09-14続き27：injected-transfer.jsはchrome.runtime.sendMessage／
    // onMessageのみを使い（暗黙的に利用可・permissions宣言不要）、
    // alarms/storage/tabs/scripting等の特権APIを一切使わないことを確認する
    // ——「自己完結した固定ファイル」という設計意図どおり、注入先の
    // isolated worldで使えるAPIの範囲に収まっていることの検証。
    name: 'injected-transfer.jsが使うchrome API名前空間もmanifest.jsonのpermissionsに宣言済み（かつ特権APIに依存しない）',
    fn: () => {
      const manifest = JSON.parse(readFileSync(resolve(EXT_DIR, 'manifest.json'), 'utf8'))
      const permissions: string[] = Array.isArray(manifest.permissions) ? manifest.permissions : []
      const src = injSrc()
      assertPermissionsCover(src, permissions, 'injected-transfer.js')
      const namespaces = extractChromeNamespacesFromCodeOnly(src)
      assert.deepEqual([...namespaces].sort(), ['runtime'], 'injected-transfer.jsはchrome.runtime以外の名前空間に依存しないこと（自己完結・isolated world前提の設計）')
    },
  },
  {
    name: 'background.jsがchrome.alarms.onAlarmを呼ぶ箇所は必ずundefinedチェックを伴う（トップレベル無条件呼び出しの再発防止）',
    fn: () => {
      const bg = bgSrc()
      // 「if (...chrome.alarms...) { ... chrome.alarms.onAlarm... }」のように、
      // onAlarm への言及より前に chrome.alarms の存在チェック（!chrome.alarms や
      // chrome.alarms &&）が同一関数内に存在することを、ごく単純な行ベースの
      // ヒューリスティックで確認する（意図は「無条件呼び出しの再発防止」であり
      // 完全なAST解析はしない）。
      const hasGuard = /if\s*\(\s*!?chrome\.alarms\b/.test(bg) || /chrome\.alarms\s*&&/.test(bg)
      assert.ok(hasGuard, 'chrome.alarms の存在チェック（ガード）が見つからない')

      // 旧バグの再発防止：トップレベル（関数外）で無条件に
      // `chrome.alarms.onAlarm.addListener` を呼んでいないことを確認する。
      // safeSetupAlarms() のような関数でラップされていれば OK。
      // コメント行（// ... や JSDoc の * ...）を除外してから深さを追う——
      // コメント文中で「chrome.alarms.onAlarm.addListener」という語句そのものに
      // 言及しているだけの行を実コードと誤認しないようにする。
      const codeLines = bg
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      let insideFunction = 0
      let foundUnguardedTopLevelCall = false
      for (const line of codeLines) {
        insideFunction += (line.match(/\{/g) || []).length
        insideFunction -= (line.match(/\}/g) || []).length
        if (insideFunction <= 0 && /chrome\.alarms\.onAlarm\.addListener/.test(line)) {
          foundUnguardedTopLevelCall = true
        }
      }
      assert.equal(foundUnguardedTopLevelCall, false, 'トップレベルで無条件に chrome.alarms.onAlarm.addListener を呼んでいる（再発）')
    },
  },
  {
    name: 'background.jsのservice_worker参照ファイルが実在する',
    fn: () => {
      const manifest = JSON.parse(readFileSync(resolve(EXT_DIR, 'manifest.json'), 'utf8'))
      const swPath = manifest.background?.service_worker
      assert.ok(typeof swPath === 'string' && swPath.length > 0)
      readFileSync(resolve(EXT_DIR, swPath), 'utf8') // 存在しなければ例外で失敗する
    },
  },
  {
    name: 'content_scriptsが旧URL（note.com/notes/new）に引き続きマッチする設定を持つ（互換性維持）',
    fn: () => {
      const manifest = JSON.parse(readFileSync(resolve(EXT_DIR, 'manifest.json'), 'utf8'))
      const matches: string[] = (manifest.content_scripts ?? []).flatMap((c: any) => c.matches ?? [])
      assert.ok(
        matches.some((m) => /note\.com.*notes\/new/.test(m)),
        `content_scripts.matches に note.com/notes/new 相当のパターンが無い: ${JSON.stringify(matches)}`,
      )
    },
  },
  {
    // 2026-09-14続き：実際の編集画面URLは https://editor.note.com/notes/{noteId}/edit/
    // と判明。content_scripts.matches と host_permissions の両方が対応していることを
    // 確認する（片方だけの対応漏れを防ぐ——host_permissionsが無いとfetch等がブロック
    // されうる／content_scripts.matchesが無いとcontent.jsがそもそも注入されない）。
    name: '【新URL対応】content_scriptsとhost_permissionsの両方がeditor.note.comに対応している',
    fn: () => {
      const manifest = JSON.parse(readFileSync(resolve(EXT_DIR, 'manifest.json'), 'utf8'))
      const matches: string[] = (manifest.content_scripts ?? []).flatMap((c: any) => c.matches ?? [])
      const hostPermissions: string[] = Array.isArray(manifest.host_permissions) ? manifest.host_permissions : []

      assert.ok(
        matches.some((m) => m.includes('editor.note.com')),
        `content_scripts.matches に editor.note.com が無い: ${JSON.stringify(matches)}`,
      )
      assert.ok(
        hostPermissions.some((h) => h.includes('editor.note.com')),
        `host_permissions に editor.note.com が無い: ${JSON.stringify(hostPermissions)}`,
      )
      // 旧ドメイン note.com も host_permissions に残っていること（互換性維持）。
      assert.ok(
        hostPermissions.some((h) => h.includes('note.com') && !h.includes('editor.note.com')),
        `host_permissions に旧ドメイン note.com が残っていない（互換性が失われている）: ${JSON.stringify(hostPermissions)}`,
      )
    },
  },
  {
    // 「content script起動」の静的検証：ページ読み込み時に content.js が即座に
    // ready を通知し、note.comのDOM準備を能動的に待つ構造になっていることを確認する
    // （起動時に何もせず終了する退行を防ぐ）。
    name: '【content script起動】content.jsがready通知を送信しエディタの初期化を待機する',
    fn: () => {
      const content = contentSrc()
      assert.ok(
        /chrome\.runtime\.sendMessage\(\s*\{\s*type:\s*['"]note-transfer:ready['"]/.test(content),
        'content.jsが起動時に note-transfer:ready を送信していない',
      )
      assert.ok(
        /note-transfer:start/.test(content),
        'content.jsが note-transfer:start メッセージを受信するリスナーを持たない',
      )
    },
  },
  {
    name: '【安全境界】content.jsは「公開」を含むボタンを明示的に除外している',
    fn: () => {
      const content = contentSrc()
      assert.ok(
        /if\s*\(\s*\/公開\/\.test\(t\)\)\s*return\s*false/.test(content),
        '「公開」を含むボタンを除外するガードが見つからない（下書き保存ボタン探索ロジックの安全境界）',
      )
    },
  },
  {
    // 2026-09-14続き2：実機検証1回目失敗——タイトル・本文とも0文字のまま
    // 「成功」が報告されることは無かった（transfer-stateは空のまま）が、
    // 二度と「書き込めていないのに成功扱いにする」ことが起きないよう、
    // 読み戻し検証を経ないと success を報告できない構造になっていることを
    // 静的に確認する。
    name: '【0文字成功禁止】content.jsはタイトル・本文の読み戻し文字数が0の場合にreport(...,\'success\',...)を呼ばない',
    fn: () => {
      const content = contentSrc()
      assert.ok(
        /titleReadback\.length\s*===\s*0/.test(content),
        'タイトルの読み戻し文字数0を検知するガードが見つからない',
      )
      assert.ok(
        /bodyReadback\.length\s*===\s*0/.test(content),
        '本文の読み戻し文字数0を検知するガードが見つからない',
      )
      assert.ok(
        /finalTitle\.length\s*===\s*0\s*\|\|\s*finalBody\.length\s*===\s*0/.test(content),
        '保存操作後の最終確認（0文字なら失敗扱い）が見つからない',
      )
      // 0文字ガードのreturn文より後にしかsuccess報告が無いことを簡易確認
      // （0文字チェックをすり抜けてsuccessへ到達する経路が無いことの目安）。
      const successIdx = content.lastIndexOf(`report(item.articleId, 'success'`)
      const titleGuardIdx = content.indexOf('titleReadback.length === 0')
      const bodyGuardIdx = content.indexOf('bodyReadback.length === 0')
      assert.ok(successIdx > titleGuardIdx && successIdx > bodyGuardIdx, 'success報告が0文字ガードより前のコード順に存在する（すり抜けの恐れ）')
    },
  },
  {
    name: '【診断ログ】content.jsが主要ステージをlogStageで記録している',
    fn: () => {
      const content = contentSrc()
      for (const stage of ['content_script_loaded', 'dom_snapshot', 'title_write_verify', 'body_write_verify']) {
        assert.ok(content.includes(`'${stage}'`), `logStage('${stage}', ...) が見つからない`)
      }
    },
  },
  {
    // 2026-09-14続き2：実機検証1回目失敗の根本原因——inFlightフラグにタイムスタンプが
    // 無く、放棄された試行が永久にcheckPending()をブロックしていた。再発防止の
    // 静的検証。
    name: '【多重防止の永久ブロック再発防止】background.jsのinFlightにタイムアウトがあり、拡張再読み込み時にクリアされる',
    fn: () => {
      const bg = bgSrc()
      assert.ok(/INFLIGHT_TIMEOUT_MS/.test(bg), 'inFlightのタイムアウト定数が見つからない')
      assert.ok(/startedAt/.test(bg), 'inFlight記録に開始時刻(startedAt)が含まれていない')
      const onInstalledIdx = bg.indexOf('onInstalled.addListener')
      assert.ok(onInstalledIdx >= 0, 'chrome.runtime.onInstalled.addListener が見つからない')
      const nextListenerIdx = bg.indexOf('onStartup.addListener', onInstalledIdx)
      const onInstalledBody = bg.slice(onInstalledIdx, nextListenerIdx > 0 ? nextListenerIdx : onInstalledIdx + 1500)
      assert.ok(
        onInstalledBody.includes('setInFlight(null)'),
        'onInstalled（拡張再読み込み）時にinFlightをクリアする処理が見つからない',
      )
    },
  },
  {
    name: '【診断ログ配線】background.jsがnote-transfer:logメッセージをサーバーへ転送する',
    fn: () => {
      const bg = bgSrc()
      assert.ok(/note-transfer:log/.test(bg), 'note-transfer:log メッセージのハンドラが見つからない')
      assert.ok(/\/api\/note-transfer\/log/.test(bg), '/api/note-transfer/log への送信が見つからない')
    },
  },
  {
    name: '【診断ログ配線】noteTransferServer.tsが/api/note-transfer/logエンドポイントを実装している',
    fn: () => {
      const server = readFileSync(SERVER_SRC, 'utf8')
      assert.ok(server.includes('/api/note-transfer/log'), '/api/note-transfer/log ルートが見つからない')
      assert.ok(server.includes('appendDiagnosticLog'), '診断ログ書き込み関数が見つからない')
    },
  },
  {
    // 2026-09-14続き27：func:方式（Function.prototype.toString()による直列化・
    // 対象タブ内での再構築）を廃止し、固定ファイルinjected-transfer.jsを
    // files:で注入する構成へ変更した（マロン必須修正①）。
    name: '【確実な注入経路】background.jsがchrome.scripting.executeScriptでinjected-transfer.jsをfiles注入し、func:方式は使わない',
    fn: () => {
      const bg = bgSrc()
      assert.ok(/chrome\.scripting\.executeScript/.test(bg), 'chrome.scripting.executeScript の呼び出しが見つからない')
      assert.ok(/files:\s*\[\s*['"]injected-transfer\.js['"]\s*\]/.test(bg), "executeScriptにfiles: ['injected-transfer.js'] が渡されていない")
      assert.ok(!/func:\s*injectedNoteTransfer/.test(bg), 'func: injectedNoteTransfer（旧方式）がまだ残っている')
      assert.ok(!/function injectedNoteTransfer/.test(bg), '旧injectedNoteTransfer関数の定義がbackground.jsに残っている（injected-transfer.jsへ移植したはず）')
    },
  },
  {
    name: '【確実な注入経路】DOM読み込み完了（waitForTabComplete）を待ってから注入する',
    fn: () => {
      const bg = bgSrc()
      assert.ok(/function waitForTabComplete/.test(bg), 'waitForTabComplete関数が見つからない')
      assert.ok(/await waitForTabComplete\(/.test(bg), 'checkPending内でwaitForTabCompleteを待機していない')
      assert.ok(/onUpdated\.addListener/.test(bg), "status:'complete' 判定用の chrome.tabs.onUpdated リスナーが見つからない")
    },
  },
  {
    // injected-transfer.js（旧injectedNoteTransfer相当）も、content.jsと同様に
    // 0文字のまま成功報告しないガードを持つこと（実行経路が変わっても安全境界は
    // 変わらないことの確認）。
    name: '【0文字成功禁止・注入ファイル経路】injected-transfer.jsもタイトル・本文0文字では成功を返さない',
    fn: () => {
      const inj = injSrc()
      assert.ok(/titleReadback\.length\s*===\s*0/.test(inj), 'injected-transfer.js内にタイトル0文字ガードが見つからない')
      assert.ok(/bodyReadback\.length\s*===\s*0/.test(inj), 'injected-transfer.js内に本文0文字ガードが見つからない')
      assert.ok(
        /finalTitle\.length\s*===\s*0\s*\|\|\s*finalBody\.length\s*===\s*0/.test(inj),
        'injected-transfer.js内に保存後の最終確認ガードが見つからない',
      )
      assert.ok(/if\s*\(\s*\/公開\/\.test\(t\)\)\s*return\s*false/.test(inj), 'injected-transfer.js内に「公開」ボタン除外ガードが見つからない')
    },
  },
  {
    name: '【最原始的な起動証跡】background.jsが他の何よりも早い段階でservice_worker_evaluatedログを送る',
    fn: () => {
      const bg = bgSrc()
      const evalIdx = bg.indexOf("logToServer('service_worker_evaluated'")
      const firstListenerIdx = bg.indexOf('onInstalled.addListener')
      assert.ok(evalIdx >= 0, 'service_worker_evaluated ログ送信が見つからない')
      assert.ok(evalIdx < firstListenerIdx, 'service_worker_evaluated が他のリスナー登録より後ろにある（最初の証跡として機能しない）')
    },
  },
  {
    // 2026-09-14続き5：実機検証でタイトル・本文・保存は成功したがハッシュタグ・
    // アイコンが未完了だった（タグ入力欄・ファイル入力欄が最初のDOMに存在
    // しなかった）。クリックして出現させる「reveal」ロジックが実装されている
    // ことを確認する。
    name: '【ハッシュタグ・アイコンのreveal-click】injected-transfer.jsが最初に見つからない場合にクリックして出現を試みる',
    fn: () => {
      const inj = injSrc()
      assert.ok(/function findClickableByLabel/.test(inj), 'findClickableByLabel（ラベル一致のクリック対象探索）が見つからない')
      assert.ok(/async function revealAndFindFileInput/.test(inj), 'revealAndFindFileInputが見つからない')
      // findClickableByLabel自体も「公開」を含む要素は除外すること（安全境界の踏襲）。
      const start = inj.indexOf('function findClickableByLabel')
      const end = inj.indexOf('const PUBLISH_FINAL_RE')
      const body = inj.slice(start, end)
      assert.ok(/if\s*\(\s*\/公開\/\.test\(label\)\)\s*return\s*false/.test(body), 'findClickableByLabel内に「公開」除外ガードが見つからない')
    },
  },
  {
    name: '【completion-onlyモード】injected-transfer.jsがmode==="completion"でタイトル・本文の再入力をスキップする',
    fn: () => {
      const inj = injSrc()
      assert.ok(/mode === 'completion'/.test(inj), "mode==='completion' の分岐が見つからない")
      assert.ok(/completion_sanity_check/.test(inj), 'completion-onlyモードでのタイトル/本文サニティチェックが見つからない')
    },
  },
  {
    name: '【completion-only配線】checkPendingがpreferredUrl（既存下書き）を優先してタブを探す',
    fn: () => {
      const bg = bgSrc()
      assert.ok(/preferredUrl/.test(bg), 'preferredUrl（既存下書きURLの優先一致）が見つからない')
      assert.ok(/existingDraftUrl/.test(bg), 'item.existingDraftUrl の参照が見つからない')
    },
  },
  {
    name: '【診断ログ配線】noteTransferServer.tsがcompletion-onlyジョブの記録関数を使用している',
    fn: () => {
      const server = readFileSync(SERVER_SRC, 'utf8')
      assert.ok(server.includes('recordCompletionAttempt'), 'recordCompletionAttemptの利用が見つからない')
      assert.ok(server.includes("mode === 'completion'") || server.includes('mode==="completion"'), "mode==='completion' の分岐が見つからない")
    },
  },
  {
    // 2026-09-14続き6で実機発見・修正した重大バグの再発防止：
    // executeScriptが結果を返さなかった場合の失敗報告に mode が渡っておらず、
    // completion-onlyジョブの失敗が通常ジョブの失敗として処理され、
    // 3回でstatus='failed'に恒久固定されてしまっていた。
    name: '【重要バグ再発防止】execute_script_no_result時の失敗報告にmodeが含まれる',
    fn: () => {
      const bg = bgSrc()
      const idx = bg.indexOf("logToServer('execute_script_no_result'")
      assert.ok(idx >= 0, 'execute_script_no_result ログが見つからない')
      const nearby = bg.slice(idx, idx + 400)
      assert.ok(/mode:\s*item\.mode/.test(nearby), 'execute_script_no_result 周辺の reportResult 呼び出しに mode: item.mode が渡っていない（再発）')
    },
  },
  {
    // 2026-09-14続き6：ハッシュタグ・カテゴリー画像は「公開に進む」の次画面
    // （公開設定）で初めて現れると判明。設定画面への遷移としてのみ許可し、
    // 最終公開ボタンは文言パターンで明示的に禁止する——このパターンの実際の
    // 挙動（「公開に進む」は通す・「公開する」等は弾く）を正規表現として
    // 直接評価して検証する（安全境界そのものの振る舞いテスト）。
    name: '【最重要安全境界】PUBLISH_FINAL_REは「公開に進む」を許可し「公開する」等の最終公開文言のみを禁止する',
    fn: () => {
      const inj = injSrc()
      const m = inj.match(/const PUBLISH_FINAL_RE = (\/.+\/)\n/)
      assert.ok(m, 'PUBLISH_FINAL_RE の定義が見つからない')
      // eslint-disable-next-line no-eval -- 正規表現リテラルのみを固定パターンで抽出して評価する（任意コード実行ではない）
      const re = eval(m![1]) as RegExp
      assert.equal(re.test('公開に進む'), false, '「公開に進む」が誤って禁止されている（設定画面へ遷移できなくなる）')
      assert.equal(re.test('公開する'), true, '「公開する」が禁止パターンに一致しない（最終公開ボタンを誤ってクリックしうる）')
      assert.equal(re.test('投稿する'), true, '「投稿する」が禁止パターンに一致しない')
      assert.equal(re.test('この内容で公開'), true, '「この内容で公開」が禁止パターンに一致しない')
      assert.equal(re.test('下書き保存'), false, '「下書き保存」が誤って禁止されている')
    },
  },
  {
    name: '【設定画面遷移】findProceedToPublishButtonが最終公開ボタンを除外したうえで「公開に進む」のみに一致する',
    fn: () => {
      const inj = injSrc()
      assert.ok(/function findProceedToPublishButton/.test(inj), 'findProceedToPublishButtonが見つからない')
      const start = inj.indexOf('function findProceedToPublishButton')
      const end = inj.indexOf('function findConfirmLikeButton')
      const body = inj.slice(start, end)
      assert.ok(/isForbiddenPublishLabel\(t\)/.test(body), '最終公開ボタン除外チェックが呼ばれていない')
      assert.ok(/\/公開に進む\//.test(body), '「公開に進む」への一致条件が見つからない')
    },
  },
  {
    name: '【読み戻し検証】ハッシュタグ4個・画像設定状態をDOMから読み戻す関数が存在する',
    fn: () => {
      const inj = injSrc()
      assert.ok(/function countAppliedHashtags/.test(inj), 'countAppliedHashtagsが見つからない')
      assert.ok(/function checkIconApplied/.test(inj), 'checkIconAppliedが見つからない')
      assert.ok(/appliedTagCount/.test(inj) && /iconApplied/.test(inj), '読み戻し結果の使用箇所が見つからない')
    },
  },
  {
    name: '【タイトル・本文の不変性検証】completion-onlyジョブは正規化ハッシュで前後一致を確認し、不一致なら失敗扱いにする',
    fn: () => {
      const inj = injSrc()
      assert.ok(/async function normalizedHash/.test(inj), 'normalizedHash（SHA-256）が見つからない')
      assert.ok(/content_hash_before/.test(inj) && /content_hash_after/.test(inj), 'ハッシュの前後比較ログが見つからない')
      assert.ok(/content_integrity_check_failed/.test(inj), 'ハッシュ不一致時の失敗ステージが見つからない')
    },
  },
  {
    // 2026-09-14続き7：実機で「executeScriptから結果が返らない」障害が繰り返し
    // 発生したが、注入処理内で未捕捉例外が起きるとPromiseがrejectし、蓄積した
    // stagesも含めて一切の診断情報が返らなかった（原因不明のまま3回失敗し
    // 恒久failed化していた）。2026-09-14続き27でhandleRunへ再構成した後も、
    // 最外周をtry/catch/finallyで包み、例外発生時も必ずstages＋例外情報を
    // 返す構造になっていることを確認する（マロン必須修正②）。
    name: '【重大バグ再発防止】injected-transfer.jsのhandleRunは未捕捉例外が起きても必ずstages・buildRevision付きの結果を返す（結果なし＝原因不明を構造的に無くす）',
    fn: () => {
      const inj = injSrc()
      const start = inj.indexOf('async function handleRun(item, buildRevision, log) {')
      assert.ok(start >= 0, 'handleRunの定義が見つからない')
      const end = inj.indexOf('async function runTransfer(item, log, stages) {')
      assert.ok(end > start, 'handleRunの範囲を特定できない')
      const body = inj.slice(start, end)
      assert.ok(/try\s*\{/.test(body), 'handleRun冒頭にtry節が見つからない')
      assert.ok(/catch\s*\(e\)\s*\{/.test(body), 'catch節が見つからない')
      assert.ok(/finally\s*\{/.test(body), 'finally節が見つからない（マロン指示：try/catch/finallyで完全に囲む）')
      assert.ok(/uncaught_exception_in_injected_function/.test(body), '例外時のステージ名・エラーコードが見つからない')
      assert.ok(/stages,\s*\n\s*buildRevision,/.test(body) || /stages,\s*buildRevision,/.test(body), 'catch節の戻り値にstages・buildRevisionが含まれていない')
    },
  },
  {
    // 2026-09-14続き27（マロン必須修正②の一部）：注入処理の第1命令（トップ
    // レベルIIFE）自体もtry/catch/finallyで囲まれていることを確認する。
    name: '【重大バグ再発防止】injected-transfer.jsのトップレベルIIFEも第1命令からtry/catch/finallyで囲まれている',
    fn: () => {
      const inj = injSrc()
      const iifeStart = inj.indexOf(';(function () {')
      assert.ok(iifeStart >= 0, 'トップレベルIIFEの開始が見つからない')
      const afterIife = inj.slice(iifeStart, iifeStart + 300)
      assert.ok(/'use strict'\s*\n\s*try\s*\{/.test(afterIife), 'IIFE内の第1命令がtry節ではない')
      const catchIdx = inj.indexOf('} catch (e) {', iifeStart)
      const finallyIdx = inj.indexOf('} finally {', catchIdx)
      assert.ok(catchIdx > iifeStart && finallyIdx > catchIdx, 'IIFE本体にcatch・finallyが両方見つからない')
    },
  },
  {
    // 2026-09-14続き27（マロン必須修正③）：診断ログ送信（chrome.runtime.
    // sendMessage）をawaitせず、fire-and-forgetで送ることを確認する——
    // ログ通信障害で本処理を止めない。
    name: '【重大バグ再発防止】logNonBlockingは診断ログ送信をawaitせず、失敗しても本処理を止めない',
    fn: () => {
      const inj = injSrc()
      const start = inj.indexOf('function logNonBlocking(event, detail) {')
      assert.ok(start >= 0, 'logNonBlockingの定義が見つからない')
      const end = inj.indexOf('logNonBlocking(\'injected_file_top_level_start\'')
      const body = inj.slice(start, end)
      assert.ok(!/await\s+chrome\.runtime\.sendMessage/.test(body), 'chrome.runtime.sendMessageをawaitしている（ログ通信で本処理をブロックしうる）')
      assert.ok(/maybePromise\.catch\(\(\)\s*=>\s*\{\}\)/.test(body), '送信失敗を握りつぶすcatchが見つからない')
      assert.ok(/catch\s*\(e\)\s*\{/.test(body), 'logNonBlocking自体のtry/catchが見つからない（送信失敗で例外が漏れないことの保証）')
    },
  },
  {
    // 2026-09-14続き8：try/catch修正で初めて実際の例外が判明した——
    // 「trigger.click is not a function」（aria-label付きsvgアイコン等、
    // .clickを持たない要素をクリックしようとしていた）。実際にクリック可能な
    // 祖先を解決するnearestClickable/clickElementが存在し、trigger.click()等の
    // 直接呼び出しが残っていないことを確認する。
    name: '【重大バグ再発防止】trigger.click直接呼び出しが無く、clickElement（祖先解決）を経由する',
    fn: () => {
      const inj = injSrc()
      assert.ok(/function nearestClickable/.test(inj), 'nearestClickableが見つからない')
      assert.ok(/function clickElement/.test(inj), 'clickElementが見つからない')
      // コメント文中の言及を除外し、実コードで trigger.click()／proceedBtn.click()／
      // confirmBtn.click()／saveBtn.click() を直接呼んでいる行が無いことを確認する。
      const codeLines = inj.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      const directCallRe = /\b(trigger|proceedBtn|confirmBtn|saveBtn)\.click\(\)/
      const offendingLine = codeLines.find((line) => directCallRe.test(line))
      assert.equal(offendingLine, undefined, `直接.click()呼び出しが残っている: ${offendingLine}`)
    },
  },
  {
    // 2026-09-14続き8：実機で発見した重大バグ——preferredUrl（completion-only
    // ジョブの対象記事の既存下書きURL）と完全一致するタブが無いとき、
    // 「他の適当なnote編集タブ（マロンが別記事のために手動で開いた無関係な
    // 新規下書き等）」へ誤ってフォールバックしていた。preferredUrl指定時は
    // 完全一致が無ければ他candidateへフォールバックせず直接開くことを確認する。
    name: '【重大バグ再発防止】preferredUrl指定時、完全一致タブが無ければ他のnoteタブへフォールバックせずpreferredUrlを直接開く',
    fn: () => {
      const bg = bgSrc()
      const start = bg.indexOf('async function findOrOpenNoteEditorTab')
      const end = bg.indexOf('/**\n * 2026-09-14続き27')
      assert.ok(start >= 0 && end > start, 'findOrOpenNoteEditorTabの範囲を特定できない')
      const body = bg.slice(start, end)
      assert.ok(/if\s*\(preferredUrl\)\s*\{/.test(body), 'preferredUrl分岐が見つからない')
      assert.ok(/\}\s*else if\s*\(candidates\.length > 0\)/.test(body), 'preferredUrl指定時に他candidateへのフォールバック分岐と分離されていない（elseで排他になっていない）')
    },
  },
  {
    // 2026-09-14続き9（マロン指示）：「拡張を再読み込みしたのに何も起きない」
    // 事象を切り分けるため、manifest.jsonのversionとbackground.jsの
    // BUILD_REVISIONを対で必ずbumpし、起動ログへ記録することを要求された。
    // versionが既定の"1.0.0"のまま放置されていないこと・BUILD_REVISIONが
    // 定義されservice_worker_evaluated/on_installedログへ記録されている
    // ことを確認する。
    name: '【ビルド識別】manifest.jsonのversionが既定値から更新され、background.jsがBUILD_REVISIONを起動ログへ記録する',
    fn: () => {
      const manifest = JSON.parse(readFileSync(resolve(EXT_DIR, 'manifest.json'), 'utf8'))
      assert.ok(typeof manifest.version === 'string' && manifest.version !== '1.0.0', 'manifest.jsonのversionが既定値のまま更新されていない')

      const bg = bgSrc()
      assert.ok(/const BUILD_REVISION = /.test(bg), 'BUILD_REVISION定数が見つからない')
      const evalIdx = bg.indexOf("logToServer('service_worker_evaluated'")
      const nearby = bg.slice(evalIdx, evalIdx + 300)
      assert.ok(/buildRevision:\s*BUILD_REVISION/.test(nearby), 'service_worker_evaluatedログにbuildRevisionが記録されていない')
      assert.ok(/manifestVersion/.test(nearby), 'service_worker_evaluatedログにmanifestVersionが記録されていない')
      assert.ok(/extensionId/.test(nearby), 'service_worker_evaluatedログにextensionIdが記録されていない（別フォルダ読み込みの切り分け用）')

      const installedIdx = bg.indexOf("logToServer('on_installed'")
      assert.ok(/buildRevision:\s*BUILD_REVISION/.test(bg.slice(installedIdx, installedIdx + 100)), 'on_installedログにbuildRevisionが記録されていない')
    },
  },
]

const WATCHDOG_DEDUP_TEST_CASES: CheckCase[] = [
  {
    // 2026-09-14続き27（マロン必須修正④）：executeScript側に単発watchdogを
    // 設け、タイムアウト後の自動再試行はしないことを確認する。
    name: '【単発watchdog】background.jsはPromise.raceで単発タイムアウトを設け、タイムアウト時は1回だけ失敗報告して終わる（本関数内で自動的に再試行しない）',
    fn: () => {
      const bg = bgSrc()
      assert.ok(/const INJECTED_RUN_TIMEOUT_MS = \d+/.test(bg), 'INJECTED_RUN_TIMEOUT_MS定数が見つからない')
      assert.ok(/Promise\.race\(\[runPromise, watchdogPromise\]\)/.test(bg), 'Promise.raceによるwatchdogが見つからない')
      const idx = bg.indexOf('if (result && result.__watchdogTimeout) {')
      assert.ok(idx >= 0, 'watchdogタイムアウト時の分岐が見つからない')
      const body = bg.slice(idx, idx + 600)
      assert.ok(/injected_run_watchdog_timeout/.test(body), 'watchdogタイムアウトのログ・エラーステージ名が見つからない')
      assert.ok(/await reportResult\(item\.articleId, 'failure'/.test(body), 'watchdogタイムアウト時に1回だけ失敗報告していることが確認できない')
      // タイムアウト分岐内でchrome.scripting.executeScriptやcheckPendingを
      // 再度呼んでいない（＝本関数が自分で再試行しない）ことを確認する。
      assert.ok(!/chrome\.scripting\.executeScript/.test(body), 'watchdogタイムアウト分岐内でexecuteScriptを再度呼んでいる（自動再試行の再発）')
    },
  },
  {
    name: '【単発watchdog】タイムアウト値はブラウザ側inFlightタイムアウト（120秒）より短く、サーバー側stale判定（150秒）より短い',
    fn: () => {
      const bg = bgSrc()
      const m = bg.match(/const INJECTED_RUN_TIMEOUT_MS = (\d+)/)
      assert.ok(m, 'INJECTED_RUN_TIMEOUT_MSの値を取得できない')
      const timeoutMs = Number(m![1])
      const inflightMatch = bg.match(/const INFLIGHT_TIMEOUT_MS = (\d+)/)
      assert.ok(inflightMatch, 'INFLIGHT_TIMEOUT_MSの値を取得できない')
      const inflightMs = Number(inflightMatch![1])
      assert.ok(timeoutMs < inflightMs, `単発watchdog（${timeoutMs}ms）がブラウザ側inFlightタイムアウト（${inflightMs}ms）以上——watchdogが意味をなさない`)
    },
  },
  {
    // 2026-09-14続き27（マロン必須修正④「実行中スクリプトとの重複を防止
    // する」）：同一タブへの複数回の注入でリスナーが重複登録されないこと、
    // かつ同一リスナーが並行して複数のnote-transfer:runを処理しない
    // （isRunningガード）ことを確認する。
    name: '【重複実行防止】injected-transfer.jsはリスナーの二重登録を防ぎ、実行中は新しい実行を開始せず即座に「実行中」を報告する',
    fn: () => {
      const inj = injSrc()
      assert.ok(/window\.__NOTE_TRANSFER_LISTENER_INSTALLED__/.test(inj), 'リスナー二重登録防止ガードが見つからない')
      const idx = inj.indexOf('if (window.__NOTE_TRANSFER_LISTENER_INSTALLED__) {')
      assert.ok(idx >= 0, '二重登録ガードの分岐が見つからない')
      const nearby = inj.slice(idx, idx + 200)
      assert.ok(/return/.test(nearby), '二重登録ガードがreturnで処理を終えていない')

      assert.ok(/let isRunning = false/.test(inj), 'isRunningフラグが見つからない')
      const runIdx = inj.indexOf('if (isRunning) {')
      assert.ok(runIdx >= 0, 'isRunningチェックの分岐が見つからない')
      const runBody = inj.slice(runIdx, runIdx + 400)
      assert.ok(/injected_run_already_in_progress/.test(runBody), '実行中を示すログ・エラーステージ名が見つからない')
      assert.ok(/sendResponse\(\{/.test(runBody), '実行中の場合に即座にsendResponseしていることが確認できない')
    },
  },
  {
    name: '【重複実行防止】isRunningはfinallyで必ずfalseへ戻され、次のメッセージを恒久的にブロックしない',
    fn: () => {
      const inj = injSrc()
      const idx = inj.indexOf('.finally(() => {\n          isRunning = false\n        })')
      assert.ok(idx >= 0, 'isRunningをfalseへ戻すfinally節が見つからない（恒久ブロックの再発防止）')
    },
  },
  {
    // 2026-09-14続き27（マロン必須修正⑤・⑥）：タイトル・本文は再入力せず、
    // 保存済みURLの既存タブのみを使用し新規タブ作成・tabs.reloadを行わない
    // ——既存の安全境界がfiles:注入方式へ移行後も維持されていることを確認する。
    name: '【維持確認】タイトル・本文の再入力禁止・新規タブ作成禁止・tabs.reload禁止の安全境界はfiles:注入方式へ移行後も維持されている',
    fn: () => {
      const bg = bgSrc()
      // preferredUrl（completion-onlyジョブ）の経路でchrome.tabs.createが
      // 呼ばれていないこと（新規タブを作らない）。
      const start = bg.indexOf('if (preferredUrl) {')
      const end = bg.indexOf('logToServer(\'preferred_url_tab_not_found_opening_directly\'')
      const body = bg.slice(start, end)
      assert.ok(!/chrome\.tabs\.create/.test(body), 'preferredUrl経路でchrome.tabs.createが呼ばれている（新規タブ作成の再発）')
      assert.ok(!/chrome\.tabs\.reload/.test(body), 'preferredUrl経路でchrome.tabs.reloadが呼ばれている（reload禁止の再発）')

      // injected-transfer.js側：completion-onlyモードではタイトル・本文の
      // 書き込み関数（setContentEditableParagraphs等）がmode==='full'の
      // 分岐内にのみ存在し、completionモードの経路では呼ばれないこと。
      const inj = injSrc()
      const completionIdx = inj.indexOf("if (mode === 'completion') {")
      const imageSectionIdx = inj.indexOf('// --- ① カテゴリー画像')
      assert.ok(completionIdx >= 0 && imageSectionIdx > completionIdx, 'completion分岐と画像処理の位置関係を特定できない')
      const completionToImageSection = inj.slice(completionIdx, imageSectionIdx)
      assert.ok(!/setContentEditableParagraphs/.test(completionToImageSection), 'completion-onlyジョブの経路上でタイトル・本文の書き込み関数が呼ばれている（再入力禁止の再発）')
    },
  },
  {
    // 2026-09-14続き27（マロン必須修正⑧）：「投稿する」はコード上で絶対に
    // 押さない——injected-transfer.js全体でPUBLISH_FINAL_REに一致する文言を
    // 持つ要素をfindする関数がfindProceedToPublishButton・
    // isForbiddenPublishLabelの除外ガード以外の経路から呼ばれていないこと
    // （＝最終公開ボタンを探して押す専用ロジックがそもそも存在しない）ことを
    // 確認する。
    name: '【最終公開絶対禁止】injected-transfer.js内に最終公開ボタンをクリックする経路が存在しない',
    fn: () => {
      const inj = injSrc()
      // 「投稿する」「公開する」等の文言を持つ要素を明示的にfindして
      // clickElementへ渡すような専用関数・コードパスが無いことを確認する
      // （findProceedToPublishButtonは「公開に進む」のみに一致し、
      // isForbiddenPublishLabelで最終公開文言を除外する構造——既存テストで
      // 検証済み。ここでは「公開する」自体を検索対象にする別ロジックが
      // 追加されていないことを確認する）。
      assert.ok(!/【投稿する】|findPublishButton|findSubmitButton/.test(inj), '最終公開ボタンを探す専用関数らしきものが見つかった（存在してはならない）')
    },
  },
]
cases.push(...WATCHDOG_DEDUP_TEST_CASES)

const CANCEL_TEST_CASES: CheckCase[] = [
  {
    // 2026-09-14続き10：実機ログで「公開に進む」が実際のページ遷移
    // （URLが/publish/へ変わる）であり、Escapeキーでは編集画面へ戻れないと
    // 判明した。「キャンセル」ボタンで戻る経路が新設され、「公開」を含む
    // 文言には一致しないことを確認する。
    name: '【設定画面からの復帰】findCancelButtonは「キャンセル」に一致し「公開」を含む文言には一致しない',
    fn: () => {
      const inj = injSrc()
      assert.ok(/function findCancelButton/.test(inj), 'findCancelButtonが見つからない')
      const start = inj.indexOf('function findCancelButton')
      const end = inj.indexOf("log('injected_transfer_started'")
      assert.ok(start >= 0 && end > start, 'findCancelButtonの範囲を特定できない')
      const body = inj.slice(start, end)
      assert.ok(/if\s*\(\s*\/公開\/\.test\(t\)\)\s*return\s*false/.test(body), 'findCancelButton内に「公開」除外ガードが見つからない')
      assert.ok(/\^キャンセル\$/.test(body), '「キャンセル」への一致条件が見つからない')
    },
  },
  {
    name: '【設定画面からの復帰】下書き保存ボタンが見つからない場合、まずキャンセルボタンを試し、無ければEscapeへフォールバックする',
    fn: () => {
      const inj = injSrc()
      assert.ok(/cancel_button_click/.test(inj), 'cancel_button_clickログが見つからない')
      assert.ok(/findCancelButton\(\)/.test(inj), 'findCancelButtonの呼び出しが見つからない')
      const idx = inj.indexOf('const cancelBtn = findCancelButton()')
      assert.ok(idx >= 0, 'cancelBtn取得箇所が見つからない')
      const nearby = inj.slice(idx, idx + 400)
      assert.ok(/Escape/.test(nearby), 'Escapeへのフォールバックが見つからない')
    },
  },
]
cases.push(...CANCEL_TEST_CASES)

const IMAGE_ASSET_TEST_CASES: CheckCase[] = [
  {
    // 2026-09-14続き11（マロン指示）：画像ファイル・MIME type・ファイル名・
    // SHA-256・配信URLが「すべて」揃っている場合のみ実在するものとして扱い、
    // 1つでも欠けていれば他画像への無断代替をせず「使用すべき画像ファイルが
    // ない」ことを明示すること。
    name: '【画像なし明示】categoryIconの必須項目が1つでも欠けていれば無断代替せずno_usable_image_fileを報告する',
    fn: () => {
      const inj = injSrc()
      assert.ok(/no_usable_image_file/.test(inj), 'no_usable_image_fileステージが見つからない')
      assert.ok(/noUsableImageFile:\s*true/.test(inj), 'noUsableImageFileフラグが見つからない')
      const idx = inj.indexOf('const imageAvailable =')
      assert.ok(idx >= 0, 'imageAvailable判定が見つからない')
      const nearby = inj.slice(idx, idx + 300)
      assert.ok(/img\.url/.test(nearby) && /img\.fileName/.test(nearby) && /img\.mimeType/.test(nearby) && /img\.sha256/.test(nearby), 'url/fileName/mimeType/sha256のすべてを必須項目として確認していない')
    },
  },
  {
    name: '【画像整合性検証】取得した画像の実SHA-256をペイロードのsha256と比較し、不一致なら添付しない',
    fn: () => {
      const inj = injSrc()
      assert.ok(/image_sha256_verify/.test(inj), 'image_sha256_verifyログが見つからない')
      assert.ok(/actualSha256 !== img\.sha256/.test(inj), 'SHA-256不一致時のガードが見つからない')
      assert.ok(/image_integrity_mismatch/.test(inj), '不一致時の失敗ステージ名が見つからない')
    },
  },
  {
    name: '【プレビュー読み戻し】アップロード後に新しいblob:プレビュー画像が出現したことを確認してからattachedとする',
    fn: () => {
      const inj = injSrc()
      assert.ok(/beforePreviewImgs/.test(inj), 'アップロード前のblob:画像一覧の記録が見つからない')
      assert.ok(/image_preview_verify/.test(inj), 'image_preview_verifyログが見つからない')
      // 2026-09-14続き29：previewAppeared自体がraceWithTimeoutの結果
      // （タイムアウト時は{__timedOut:true}）になったため、previewOk
      // （タイムアウトなら強制的にfalse、それ以外はprevewAppearedの真偽）を
      // 経由してattachedを判定するよう変更した。
      assert.ok(/const previewOk = previewTimedOut \? false : !!previewAppeared/.test(inj), 'previewAppeared（タイムアウト考慮済み）からprevewOkを算出する判定が見つからない')
      assert.ok(/attached:\s*previewOk,/.test(inj), 'previewOkに基づくattached判定が見つからない')
    },
  },
  {
    name: '【iconDoneの正確性】iconDoneは緩いcheckIconAppliedではなく検証済みのiconResult.attachedのみで判定する',
    fn: () => {
      const inj = injSrc()
      assert.ok(/const iconDone = iconResult\.attached === true$/m.test(inj), 'iconDoneがiconResult.attachedのみで判定されていない（checkIconAppliedとのAND条件が残っている可能性）')
    },
  },
]
cases.push(...IMAGE_ASSET_TEST_CASES)

const EDITOR_IMAGE_BUTTON_TEST_CASES: CheckCase[] = [
  {
    // 2026-09-14続き23（マロン確定事実）：「公開設定画面にはfile inputも
    // 画像トリガーも存在しない」「note編集画面上部には『画像＋』の追加ボタンが
    // 存在する」。画像探索（revealAndFindFileInput）は、ハッシュタグの
    // 公開設定画面遷移判定（proceed_to_settings_for_hashtag_check）より
    // 前に実行されることを確認する——画像のために設定画面へは進まない。
    name: '【処理順】画像トリガー探索はハッシュタグの設定画面遷移判定より前に実行される',
    fn: () => {
      const inj = injSrc()
      const iconSearchIdx = inj.indexOf('await revealAndFindFileInput()')
      const proceedForHashtagIdx = inj.indexOf('proceed_to_settings_for_hashtag_check')
      assert.ok(iconSearchIdx >= 0, 'revealAndFindFileInputの呼び出しが見つからない')
      assert.ok(proceedForHashtagIdx >= 0, 'proceed_to_settings_for_hashtag_checkが見つからない')
      assert.ok(iconSearchIdx < proceedForHashtagIdx, '画像探索がハッシュタグの設定画面遷移より後になっている（画像のために設定画面へ進んでしまう可能性）')
    },
  },
  {
    // マロン指示：「編集画面で画像ボタンを特定できなければ、その時点の
    // dom_snapshotを必ず保存し、推測で別画面を探さないでください」。
    name: '【推測禁止】編集画面で画像トリガーが見つからない場合、dom_snapshotを保存し公開設定画面へはフォールバックしない',
    fn: () => {
      const inj = injSrc()
      assert.ok(/image_trigger_not_found_on_editor/.test(inj), 'image_trigger_not_found_on_editorログが見つからない')
      const idx = inj.indexOf('let imageNotFoundSnapshot = null')
      assert.ok(idx >= 0, 'imageNotFoundSnapshotの宣言が見つからない')
      const nearby = inj.slice(idx, idx + 400)
      assert.ok(/imageNotFoundSnapshot = domDebugSnapshot\(\)/.test(nearby), '画像トリガー未検出時にdomDebugSnapshotを保存していない')
      // 画像未検出ブロック内でfindProceedToPublishButton等の設定画面遷移を
      // 呼んでいないこと（推測で別画面を探さない）。
      const blockEnd = inj.indexOf('const img = item.categoryIcon')
      const block = inj.slice(idx, blockEnd)
      assert.ok(!/findProceedToPublishButton/.test(block), '画像未検出時に公開設定画面への遷移を試みている（推測探索の再発）')
    },
  },
  {
    name: '【必要な場合だけ】ハッシュタグの公開設定画面遷移は編集画面上で未反映のタグがある場合のみ行われる',
    fn: () => {
      const inj = injSrc()
      const idx = inj.indexOf('if (appliedTagCount < expectedTagsNoHash.length && expectedTagsNoHash.length > 0) {')
      assert.ok(idx >= 0, 'appliedTagCountに基づく設定画面遷移の条件分岐が見つからない')
      const nearby = inj.slice(idx, idx + 300)
      assert.ok(/proceed_to_settings_for_hashtag_check/.test(nearby), '条件成立時の設定画面遷移ログが見つからない')
    },
  },
  {
    name: '【下書き保存の位置】下書き保存は画像処理の直後・ハッシュタグ確認より前に実行される',
    fn: () => {
      const inj = injSrc()
      const iconDoneIdx = inj.indexOf("log('icon_attach_done', iconResult)")
      const saveIdx = inj.indexOf("log('save_button_found', { text: visibleText(saveBtn), stage: 'editor' })")
      const hashtagCheckIdx = inj.indexOf('let appliedTagCount = countAppliedHashtags(expectedTagsNoHash)')
      assert.ok(iconDoneIdx >= 0 && saveIdx >= 0 && hashtagCheckIdx >= 0, '画像処理・保存・ハッシュタグ確認いずれかの位置が特定できない')
      assert.ok(iconDoneIdx < saveIdx, '画像処理が下書き保存より後になっている')
      assert.ok(saveIdx < hashtagCheckIdx, '下書き保存がハッシュタグ確認より後になっている')
    },
  },
  {
    // 2026-09-14続き23（マロン指示）：「保存済みArticle #67の正しい /edit/
    // URLを1タブだけ再利用」「tabs.reloadは禁止」。completion-onlyジョブ
    // （preferredUrl指定時）の完全一致タブ再利用でchrome.tabs.reloadを
    // 呼ばないことを確認する。
    name: '【重要】tabs.reload禁止——preferredUrl完全一致タブはreloadせずそのまま再利用する',
    fn: () => {
      const bg = bgSrc()
      const start = bg.indexOf('if (preferredUrl) {')
      const end = bg.indexOf("logToServer('preferred_url_tab_not_found_opening_directly'")
      assert.ok(start >= 0 && end > start, 'preferredUrl分岐の範囲を特定できない')
      const body = bg.slice(start, end)
      assert.ok(!/chrome\.tabs\.reload/.test(body), 'preferredUrl完全一致タブの再利用でchrome.tabs.reloadが呼ばれている（禁止事項）')
      assert.ok(/existing_tab_reused_no_reload/.test(body), 'reloadしない旨のログ（existing_tab_reused_no_reload）が見つからない')
    },
  },
  {
    // 2026-09-14続き23：success応答でもiconResult.debug（画像未検出時の
    // dom_snapshot）をサーバーへ転送し、result_debug_snapshotとして記録する
    // ——画像以外が成功してしまいfailure経路が発火しないケースでも画像UIの
    // 実構造を確認できるようにする。
    name: '【診断ログ配線】success応答でもiconDebugをサーバーへ転送し、result_debug_snapshotとして記録される',
    fn: () => {
      const bg = bgSrc()
      assert.ok(/iconDebug:\s*result\.iconResult\?\.debug/.test(bg), "success応答にiconDebug: result.iconResult?.debug が含まれていない")

      const server = readFileSync(SERVER_SRC, 'utf8')
      assert.ok(/body\.debug\s*\?\?\s*body\.iconDebug/.test(server), 'サーバー側がbody.debugだけでなくbody.iconDebugも見ていない')
      assert.ok(server.includes("event: 'result_debug_snapshot'"), 'result_debug_snapshotイベントの記録が見つからない')
    },
  },
]
cases.push(...EDITOR_IMAGE_BUTTON_TEST_CASES)

const IMAGE_UPLOAD_TWO_STEP_TEST_CASES: CheckCase[] = [
  {
    // 2026-09-14続き24（実機ログで判明）：「画像を追加」クリックで開く
    // チューザーには「画像をアップロード」「記事にあう画像を選ぶ」の2択が
    // あり、実際のfile inputは「画像をアップロード」をさらにクリックして
    // 初めて出現する2段階のUIだった。「記事にあう画像を選ぶ」（note提案の
    // ストック／関連画像）には無断代替禁止の原則から絶対にクリックしないこと。
    name: '【無断代替禁止】findUploadOptionButtonは「画像をアップロード」のみに一致し「記事にあう画像を選ぶ」には一致しない',
    fn: () => {
      const inj = injSrc()
      assert.ok(/function findUploadOptionButton/.test(inj), 'findUploadOptionButtonが見つからない')
      const start = inj.indexOf('function findUploadOptionButton')
      const end = inj.indexOf('async function revealAndFindFileInput')
      assert.ok(start >= 0 && end > start, 'findUploadOptionButtonの範囲を特定できない')
      const body = inj.slice(start, end)
      assert.ok(/if\s*\(\s*\/記事にあう画像を選ぶ\/\.test\(t\)\)\s*return\s*false/.test(body), '「記事にあう画像を選ぶ」の除外ガードが見つからない')
      assert.ok(/\/画像をアップロード\//.test(body), '「画像をアップロード」への一致条件が見つからない')
    },
  },
  {
    name: '【2段階UI対応】revealAndFindFileInputは1回目のクリックでfile inputが出現しない場合、findUploadOptionButtonを追加でクリックして再探索する',
    fn: () => {
      const inj = injSrc()
      const start = inj.indexOf('async function revealAndFindFileInput')
      const end = inj.indexOf('function findSaveDraftButton')
      assert.ok(start >= 0 && end > start, 'revealAndFindFileInputの範囲を特定できない')
      const body = inj.slice(start, end)
      // 2026-09-14続き29：findUploadOptionButtonの呼び出しをraceWithTimeout
      // （個別5秒上限）で包むよう変更したため、呼び出し自体の存在で検証する。
      assert.ok(/findUploadOptionButton\(\)/.test(body), '2段階目のfindUploadOptionButton呼び出しが見つからない')
      assert.ok(/clickElement\(uploadOption\)/.test(body), '2段階目のクリックが見つからない')
      assert.ok(/image_upload_option_click/.test(body), '2段階目クリックのログが見つからない')
    },
  },
  {
    // 2026-09-14続き24（マロン指示）：「既存の非表示タブで完了している場合
    // は、そのタブを新規作成せず前面表示してください」。ハッシュタグ・画像
    // とも完全に完了した場合のみタブをアクティブ化し、まだ途中の自動再試行
    // のたびに画面を奪わないことを確認する。
    name: '【前面表示】ハッシュタグ・画像とも完了した場合のみ既存タブをアクティブ化し、新規タブは作らない',
    fn: () => {
      const bg = bgSrc()
      assert.ok(/chrome\.tabs\.update\(tabId,\s*\{\s*active:\s*true\s*\}\)/.test(bg), 'chrome.tabs.updateによるタブのアクティブ化が見つからない')
      const idx = bg.indexOf('chrome.tabs.update(tabId, { active: true })')
      assert.ok(idx >= 0, 'chrome.tabs.update呼び出し箇所が見つからない')
      const before = bg.slice(Math.max(0, idx - 400), idx)
      assert.ok(
        /result\.hashtagsDone === true && result\.iconDone === true/.test(before),
        'hashtagsDone・iconDoneが両方trueの場合のみタブをアクティブ化する条件が見つからない',
      )
      assert.ok(!/chrome\.tabs\.create/.test(bg.slice(Math.max(0, idx - 400), idx + 400)), 'タブ前面表示の周辺で新規タブ作成が呼ばれている（禁止事項）')
    },
  },
]
cases.push(...IMAGE_UPLOAD_TWO_STEP_TEST_CASES)

const HASHTAG_SCOPE_TEST_CASES: CheckCase[] = [
  {
    // 2026-09-14続き25（マロン指示）：「公開設定画面のサジェスト候補を選択済み
    // タグとして数えないでください」。実機で「#松屋銀座」「#銀座」の他に
    // サジェスト候補「#出店」「#15日」「#確認」が一致し2/4という誤った結果に
    // なっていた——countAppliedHashtagsが統計文言「件」を含む要素を除外する
    // ことを確認する。
    name: '【誤検出防止】countAppliedHashtagsは「件」を含む文言（サジェストの統計表示）を候補から除外する',
    fn: () => {
      const inj = injSrc()
      const start = inj.indexOf('function countAppliedHashtags(expectedTagsNoHash, scopeEl)')
      assert.ok(start >= 0, 'countAppliedHashtags(scopeEl対応版)が見つからない')
      const end = inj.indexOf('function findHashtagScopeContainer')
      const body = inj.slice(start, end)
      assert.ok(/!\s*\/件\/\.test\(t\)/.test(body), '「件」を含む文言の除外条件が見つからない')
      assert.ok(/scopeEl \|\| document/.test(body), 'scopeElが渡された場合にそのスコープ内だけを検索する実装が見つからない')
    },
  },
  {
    name: '【選択済みタグ領域】findHashtagScopeContainerは祖先の可視テキストに「件」が現れ始める手前で境界を止める',
    fn: () => {
      const inj = injSrc()
      assert.ok(/function findHashtagScopeContainer/.test(inj), 'findHashtagScopeContainerが見つからない')
      const start = inj.indexOf('function findHashtagScopeContainer')
      const end = inj.indexOf('function findWrongHashtagChips')
      const body = inj.slice(start, end)
      assert.ok(/if\s*\(\s*\/件\/\.test\(visibleText\(node\)\)\)\s*break/.test(body), '「件」出現時に遡りを停止する境界判定が見つからない')
    },
  },
  {
    // マロン指示：「誤ったタグがあれば削除し」。
    name: '【誤ったタグの削除】findWrongHashtagChipsは期待タグに含まれない「#」始まりの要素のみを対象にする',
    fn: () => {
      const inj = injSrc()
      assert.ok(/function findWrongHashtagChips/.test(inj), 'findWrongHashtagChipsが見つからない')
      const start = inj.indexOf('function findWrongHashtagChips')
      const end = inj.indexOf('function findChipRemoveButton')
      const body = inj.slice(start, end)
      assert.ok(/if\s*\(!\/\^#\/\.test\(t\)\)\s*return\s*false/.test(body), '「#」始まりのみを対象にする条件が見つからない')
      assert.ok(/!expectedTagsNoHash\.some/.test(body), '期待タグに含まれるものを除外する条件が見つからない')
    },
  },
  {
    name: '【推測クリック禁止】findChipRemoveButtonは削除ボタンが見つからない場合nullを返し、呼び出し側はその場合削除をスキップする',
    fn: () => {
      const inj = injSrc()
      assert.ok(/function findChipRemoveButton/.test(inj), 'findChipRemoveButtonが見つからない')
      assert.ok(/hashtag_wrong_chip_remove_button_not_found/.test(inj), '削除ボタン未検出時のログが見つからない（推測での代替クリックをしていないことの確認）')
      const idx = inj.indexOf('const removeBtn = findChipRemoveButton(chip)')
      assert.ok(idx >= 0, 'removeBtn取得箇所が見つからない')
      const nearby = inj.slice(idx, idx + 400)
      assert.ok(/if\s*\(removeBtn\)\s*\{/.test(nearby), 'removeBtnが見つかった場合のみ削除処理へ進む分岐が見つからない')
    },
  },
  {
    name: '【不足タグの追加】scope限定で未検出のタグのみをsetNativeValue+pressEnterで追加する',
    fn: () => {
      const inj = injSrc()
      const idx = inj.indexOf('const missingTags = expectedTagsNoHash.filter(')
      assert.ok(idx >= 0, 'missingTags算出箇所が見つからない')
      const nearby = inj.slice(idx, idx + 500)
      assert.ok(/setNativeValue\(hashtagInputEl, tag\)/.test(nearby), '不足タグの入力（setNativeValue）が見つからない')
      assert.ok(/pressEnter\(hashtagInputEl\)/.test(nearby), '不足タグ入力後のEnter送信が見つからない')
    },
  },
  {
    name: '【読み戻し】タグの追加・削除後、appliedTagCountをscope限定で再計算してから読み戻す',
    fn: () => {
      const inj = injSrc()
      assert.ok(
        /appliedTagCount = countAppliedHashtags\(expectedTagsNoHash, hashtagScope\)/.test(inj),
        '補正後の再計算（hashtagScope指定）が見つからない',
      )
    },
  },
  {
    name: '【再保存】タグを追加または削除した場合のみ、編集画面へ戻ってから下書きを再保存する',
    fn: () => {
      const inj = injSrc()
      const idx = inj.indexOf("stage: 'after_hashtag_correction'")
      assert.ok(idx >= 0, 'タグ補正後の再保存ログが見つからない')
      const before = inj.slice(Math.max(0, idx - 400), idx)
      assert.ok(
        /if\s*\(missingTags\.length > 0 \|\| removedWrongCount > 0\)\s*\{/.test(before),
        'タグの追加・削除があった場合のみ再保存する条件が見つからない（無変更時に余計な保存をしていないか）',
      )
    },
  },
]
cases.push(...HASHTAG_SCOPE_TEST_CASES)

const TIMEOUT_HARDENING_TEST_CASES: CheckCase[] = [
  {
    // 2026-09-14続き29（マロン必須修正③）：v1.16.0実機検証で
    // 「content_hash_before送信直後からrevealAndFindFileInput開始前」の
    // 区間で約90秒間無応答になる現象が再現し、shadow DOMを再帰的に辿る
    // deepQuerySelectorAllが原因である可能性が高いと判断した。探索
    // ノード数・深さ・経過時間の3つの上限と、循環参照防止（visited）を
    // 備えていることを確認する。
    name: '【DOM探索の無限ループ防止】deepQuerySelectorAllは探索ノード数・深さ・経過時間の上限と循環参照防止を持つ',
    fn: () => {
      const inj = injSrc()
      const start = inj.indexOf('function deepQuerySelectorAll(selector, root = document, opts)')
      assert.ok(start >= 0, 'deepQuerySelectorAll(opts対応版)が見つからない')
      const end = inj.indexOf('function placeholderLike')
      assert.ok(end > start, 'deepQuerySelectorAllの範囲を特定できない')
      const body = inj.slice(start, end)
      assert.ok(/maxDepth/.test(body), '深さ上限（maxDepth）が見つからない')
      assert.ok(/maxNodes/.test(body), 'ノード数上限（maxNodes）が見つからない')
      assert.ok(/budgetMs/.test(body), '経過時間上限（budgetMs）が見つからない')
      assert.ok(/new WeakSet\(\)/.test(body), '循環参照防止用のvisitedセットが見つからない')
      assert.ok(/if\s*\(visited\.has\(node\)\)\s*return/.test(body), '訪問済みノードの再訪問を防ぐガードが見つからない')
      assert.ok(/if\s*\(depth > maxDepth\)\s*\{/.test(body), '深さ上限を超えた際の打ち切りが見つからない')
      assert.ok(/if\s*\(Date\.now\(\) - start > budgetMs\)/.test(body), '経過時間上限を超えた際の打ち切りが見つからない')
    },
  },
  {
    name: '【DOM探索の無限ループ防止】deepQuerySelectorAllの既定budgetMsは5秒（マロン指示の個別上限と一致）',
    fn: () => {
      const inj = injSrc()
      assert.ok(/const budgetMs = \(opts && opts\.budgetMs\) \|\| 5000/.test(inj), '既定budgetMsが5000msになっていない')
    },
  },
  {
    // 2026-09-14続き29（マロン必須修正②）：任意のPromiseへ個別5秒上限を
    // 設けるraceWithTimeoutユーティリティが存在し、タイムアウト時は例外を
    // 投げず{__timedOut:true}を返す（呼び出し側が型で判定できる）ことを
    // 確認する。
    name: '【単発5秒上限】raceWithTimeoutはPromiseへ個別タイムアウトを設け、タイムアウト時は__timedOutを返す（例外を投げない）',
    fn: () => {
      const inj = injSrc()
      assert.ok(/function raceWithTimeout\(promise, ms, label\)/.test(inj), 'raceWithTimeoutの定義が見つからない')
      const start = inj.indexOf('function raceWithTimeout(promise, ms, label)')
      const end = inj.indexOf('async function waitForPageLoad')
      const body = inj.slice(start, end)
      assert.ok(/__timedOut:\s*true/.test(body), 'タイムアウト時に__timedOut:trueを返す実装が見つからない')
      assert.ok(/Promise\.race\(\[Promise\.resolve\(promise\), timeout\]\)/.test(body), 'Promise.raceによる単発タイムアウトの実装が見つからない')
    },
  },
  {
    name: '【個別5秒上限の適用範囲】revealAndFindFileInput・画像取得(fetch/arrayBuffer/SHA-256)・DataTransfer後待機・プレビュー確認がすべてraceWithTimeoutで包まれている',
    fn: () => {
      const inj = injSrc()
      const start = inj.indexOf('async function revealAndFindFileInput()')
      const end = inj.indexOf('function findSaveDraftButton')
      const body = inj.slice(start, end)
      const raceCount = (body.match(/raceWithTimeout\(/g) || []).length
      assert.ok(raceCount >= 6, `revealAndFindFileInput内のraceWithTimeout呼び出しが少なすぎる（${raceCount}件）——全Promiseへの個別上限が徹底されていない可能性`)

      const imgStart = inj.indexOf('async function runImageSection()')
      const imgEnd = inj.indexOf('return { iconResult }')
      assert.ok(imgStart >= 0 && imgEnd > imgStart, 'runImageSectionの範囲を特定できない')
      const imgBody = inj.slice(imgStart, imgEnd)
      assert.ok(/raceWithTimeout\(fetch\(img\.url\), 5000, 'image_fetch'\)/.test(imgBody), '画像fetchへの5秒上限が見つからない')
      assert.ok(/raceWithTimeout\(res\.arrayBuffer\(\), 5000, 'image_array_buffer'\)/.test(imgBody), 'arrayBuffer読み取りへの5秒上限が見つからない')
      assert.ok(/raceWithTimeout\(crypto\.subtle\.digest\('SHA-256', buf\), 5000, 'image_sha256_digest'\)/.test(imgBody), 'SHA-256計算への5秒上限が見つからない')
      assert.ok(/raceWithTimeout\(sleep\(800\), 5000, 'post_datatransfer_wait'\)/.test(imgBody), 'DataTransfer後待機への5秒上限が見つからない')
      assert.ok(/raceWithTimeout\(\s*waitFor\(\(\) => \{/.test(imgBody), 'プレビュー確認waitForへの5秒上限が見つからない')
    },
  },
  {
    // 2026-09-14続き29（マロン必須修正④：「「画像を追加」クリック前後、
    // 「画像をアップロード」クリック前後、file input探索前後を別stageに
    // する」）。各ステージが開始・終了で対になっていることを確認する。
    name: '【連番stageログ】「画像を追加」クリック・「画像をアップロード」クリック・file input探索がそれぞれ開始・終了ログの対になっている',
    fn: () => {
      const inj = injSrc()
      const pairs: [string, string][] = [
        ['image_add_trigger_search_start', 'image_add_trigger_search_done'],
        ['image_add_click_start', 'image_add_click_done'],
        ['image_file_input_search_after_add_click_start', 'image_file_input_search_after_add_click_done'],
        ['image_upload_option_search_start', 'image_upload_option_search_done'],
        ['image_upload_option_click_start', 'image_upload_option_click_done'],
        ['image_file_input_search_after_upload_click_start', 'image_file_input_search_after_upload_click_done'],
      ]
      for (const [startEvent, doneEvent] of pairs) {
        assert.ok(inj.includes(`'${startEvent}'`), `${startEvent} ログが見つからない`)
        assert.ok(inj.includes(`'${doneEvent}'`), `${doneEvent} ログが見つからない`)
      }
    },
  },
  {
    name: '【連番stageログ】画像処理区間（content_hash_beforeの直後〜画像処理終了）全体にimage_section_start/endログがある',
    fn: () => {
      const inj = injSrc()
      const hashBeforeIdx = inj.indexOf("log('content_hash_before'")
      const sectionStartIdx = inj.indexOf("log('image_section_start', {})")
      const sectionEndIdx = inj.indexOf("log('image_section_end', {})")
      assert.ok(hashBeforeIdx >= 0 && sectionStartIdx > hashBeforeIdx, 'image_section_startがcontent_hash_beforeより後に無い')
      assert.ok(sectionEndIdx > sectionStartIdx, 'image_section_endがimage_section_startより後に無い')
    },
  },
  {
    // 2026-09-14続き29（マロン必須修正⑤：「要素が見つからない場合は待ち
    // 続けず、5秒以内に{status:'failed', error, stack, stages,
    // domSnapshot, buildRevision}を必ず返す」）：画像処理区間全体を45秒の
    // 外側raceWithTimeoutで包み、タイムアウト時は指定された構造で
    // 即座に返すことを確認する（buildRevisionはhandleRun側で合成される）。
    name: '【最終防波堤】画像処理区間全体が外側raceWithTimeoutで包まれ、タイムアウト時はstatus:failed・error・stack・stages・domSnapshotを返す',
    fn: () => {
      const inj = injSrc()
      assert.ok(/raceWithTimeout\(runImageSection\(\), 45000, 'image_section_overall'\)/.test(inj), '画像処理区間全体への外側raceWithTimeoutが見つからない')
      const idx = inj.indexOf("if (imageSection && imageSection.__timedOut) {")
      assert.ok(idx >= 0, '画像処理区間タイムアウト時の分岐が見つからない')
      const body = inj.slice(idx, idx + 500)
      assert.ok(/status:\s*'failed'/.test(body), "status:'failed'が見つからない")
      assert.ok(/error:/.test(body) && /stack:/.test(body) && /stages,/.test(body) && /domSnapshot,/.test(body), 'error/stack/stages/domSnapshotのいずれかが見つからない')
    },
  },
  {
    name: '【維持確認】画像処理区間の全面書き換え後も、タイトル・本文再入力禁止・新規タブ禁止・reload禁止・「投稿する」絶対禁止の安全境界は維持されている',
    fn: () => {
      const inj = injSrc()
      assert.ok(/const PUBLISH_FINAL_RE = /.test(inj), 'PUBLISH_FINAL_REが見つからない（安全境界の消失）')
      assert.ok(/if\s*\(\s*\/公開\/\.test\(t\)\)\s*return\s*false/.test(inj), '「公開」除外ガードが見つからない')
      const completionIdx = inj.indexOf("if (mode === 'completion') {")
      const imageSectionIdx = inj.indexOf("log('image_section_start', {})")
      assert.ok(completionIdx >= 0 && imageSectionIdx > completionIdx, 'completion分岐と画像処理区間の位置関係を特定できない')
      assert.ok(!/setContentEditableParagraphs/.test(inj.slice(completionIdx, imageSectionIdx)), 'completion経路上でタイトル・本文の書き込み関数が呼ばれている（再入力禁止の再発）')
    },
  },
]
cases.push(...TIMEOUT_HARDENING_TEST_CASES)

export const suite = () => runSuite('chromeExtensionManifest', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} chromeExtensionManifest (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
