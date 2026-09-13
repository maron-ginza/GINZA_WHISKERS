// GINZA WHISKERS / Project 02（2026-09-14新設）— chrome-extension/ の
// manifest.json と background.js／content.js の整合性を静的検証する回帰テスト。
//
// 【背景】manifest.json の permissions に "alarms"／"storage" が欠けたまま
// background.js が chrome.alarms.onAlarm / chrome.storage.local を無条件に
// 呼び出しており、実機で「Service worker registration failed. Status code: 15」
// 「Uncaught TypeError: Cannot read properties of undefined (reading 'onAlarm')」
// が発生した（2026-09-14）。この種の「background.js が使うAPI名前空間に対応する
// 権限がmanifest.jsonに無い」不整合を、実機で動かす前に機械的に検出する。
//
// AIなし・ネットワークなし・純粋な静的解析（正規表現によるAPI名前空間の抽出と
// permissions配列の突合）。

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { runSuite, type CheckCase } from './_harness'

const ROOT = resolve(process.cwd(), '..')
const EXT_DIR = resolve(ROOT, 'chrome-extension')
const SERVER_SRC = resolve(ROOT, 'cms', 'src', 'scripts', 'noteTransferServer.ts')

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
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
      const namespaces = extractChromeNamespaces(bg)

      const missing: string[] = []
      for (const ns of namespaces) {
        const requiredPermission = NAMESPACE_TO_PERMISSION[ns]
        if (requiredPermission && !permissions.includes(requiredPermission)) {
          missing.push(`chrome.${ns} は permissions に "${requiredPermission}" が必要`)
        }
      }
      assert.deepEqual(missing, [], `不足しているpermissions: ${JSON.stringify(missing)}`)
    },
  },
  {
    name: 'content.jsが使うchrome API名前空間もmanifest.jsonのpermissionsに宣言済み',
    fn: () => {
      const manifest = JSON.parse(readFileSync(resolve(EXT_DIR, 'manifest.json'), 'utf8'))
      const permissions: string[] = Array.isArray(manifest.permissions) ? manifest.permissions : []
      const content = readFileSync(resolve(EXT_DIR, 'content.js'), 'utf8')
      const namespaces = extractChromeNamespaces(content)

      const missing: string[] = []
      for (const ns of namespaces) {
        const requiredPermission = NAMESPACE_TO_PERMISSION[ns]
        if (requiredPermission && !permissions.includes(requiredPermission)) {
          missing.push(`chrome.${ns} は permissions に "${requiredPermission}" が必要`)
        }
      }
      assert.deepEqual(missing, [], `不足しているpermissions: ${JSON.stringify(missing)}`)
    },
  },
  {
    name: 'background.jsがchrome.alarms.onAlarmを呼ぶ箇所は必ずundefinedチェックを伴う（トップレベル無条件呼び出しの再発防止）',
    fn: () => {
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
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
      const content = readFileSync(resolve(EXT_DIR, 'content.js'), 'utf8')
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
      const content = readFileSync(resolve(EXT_DIR, 'content.js'), 'utf8')
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
      const content = readFileSync(resolve(EXT_DIR, 'content.js'), 'utf8')
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
      const content = readFileSync(resolve(EXT_DIR, 'content.js'), 'utf8')
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
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
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
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
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
    // 2026-09-14続き3：content_scriptsの宣言的注入・ready/startメッセージ往復
    // だけに依存せず、chrome.scripting.executeScriptで対象タブへ確実に注入する
    // 経路を実装すること（マロン指示）。静的に存在を確認する。
    name: '【確実な注入経路】background.jsがchrome.scripting.executeScriptで対象タブへ直接注入する',
    fn: () => {
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
      assert.ok(/chrome\.scripting\.executeScript/.test(bg), 'chrome.scripting.executeScript の呼び出しが見つからない')
      assert.ok(/func:\s*injectedNoteTransfer/.test(bg), 'executeScriptにinjectedNoteTransfer関数が渡されていない')
      assert.ok(/function injectedNoteTransfer/.test(bg), 'injectedNoteTransfer関数の定義が見つからない')
    },
  },
  {
    name: '【確実な注入経路】DOM読み込み完了（waitForTabComplete）を待ってから注入する',
    fn: () => {
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
      assert.ok(/function waitForTabComplete/.test(bg), 'waitForTabComplete関数が見つからない')
      assert.ok(/await waitForTabComplete\(/.test(bg), 'checkPending内でwaitForTabCompleteを待機していない')
      assert.ok(/onUpdated\.addListener/.test(bg), "status:'complete' 判定用の chrome.tabs.onUpdated リスナーが見つからない")
    },
  },
  {
    // executeScriptで注入されるinjectedNoteTransfer自身も、content.jsと同様に
    // 0文字のまま成功報告しないガードを持つこと（実行経路が変わっても安全境界は
    // 変わらないことの確認）。
    name: '【0文字成功禁止・executeScript経路】injectedNoteTransferもタイトル・本文0文字では成功を返さない',
    fn: () => {
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
      const start = bg.indexOf('function injectedNoteTransfer')
      const end = bg.indexOf('async function waitForTabComplete')
      assert.ok(start >= 0 && end > start, 'injectedNoteTransfer関数の範囲を特定できない')
      const body = bg.slice(start, end)
      assert.ok(/titleReadback\.length\s*===\s*0/.test(body), 'injectedNoteTransfer内にタイトル0文字ガードが見つからない')
      assert.ok(/bodyReadback\.length\s*===\s*0/.test(body), 'injectedNoteTransfer内に本文0文字ガードが見つからない')
      assert.ok(
        /finalTitle\.length\s*===\s*0\s*\|\|\s*finalBody\.length\s*===\s*0/.test(body),
        'injectedNoteTransfer内に保存後の最終確認ガードが見つからない',
      )
      assert.ok(/if\s*\(\s*\/公開\/\.test\(t\)\)\s*return\s*false/.test(body), 'injectedNoteTransfer内に「公開」ボタン除外ガードが見つからない')
    },
  },
  {
    name: '【最原始的な起動証跡】background.jsが他の何よりも早い段階でservice_worker_evaluatedログを送る',
    fn: () => {
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
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
    name: '【ハッシュタグ・アイコンのreveal-click】background.jsが最初に見つからない場合にクリックして出現を試みる',
    fn: () => {
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
      assert.ok(/function findClickableByLabel/.test(bg), 'findClickableByLabel（ラベル一致のクリック対象探索）が見つからない')
      assert.ok(/async function revealAndFindHashtagInput/.test(bg), 'revealAndFindHashtagInputが見つからない')
      assert.ok(/async function revealAndFindFileInput/.test(bg), 'revealAndFindFileInputが見つからない')
      // findClickableByLabel自体も「公開」を含む要素は除外すること（安全境界の踏襲）。
      const start = bg.indexOf('function findClickableByLabel')
      const end = bg.indexOf('async function revealAndFindHashtagInput')
      const body = bg.slice(start, end)
      assert.ok(/if\s*\(\s*\/公開\/\.test\(label\)\)\s*return\s*false/.test(body), 'findClickableByLabel内に「公開」除外ガードが見つからない')
    },
  },
  {
    name: '【completion-onlyモード】injectedNoteTransferがmode==="completion"でタイトル・本文の再入力をスキップする',
    fn: () => {
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
      assert.ok(/mode === 'completion'/.test(bg), "mode==='completion' の分岐が見つからない")
      assert.ok(/completion_sanity_check/.test(bg), 'completion-onlyモードでのタイトル/本文サニティチェックが見つからない')
    },
  },
  {
    name: '【completion-only配線】checkPendingがpreferredUrl（既存下書き）を優先してタブを探す',
    fn: () => {
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
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
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
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
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
      const m = bg.match(/const PUBLISH_FINAL_RE = (\/.+\/)\n/)
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
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
      assert.ok(/function findProceedToPublishButton/.test(bg), 'findProceedToPublishButtonが見つからない')
      const start = bg.indexOf('function findProceedToPublishButton')
      const end = bg.indexOf('function findConfirmLikeButton')
      const body = bg.slice(start, end)
      assert.ok(/isForbiddenPublishLabel\(t\)/.test(body), '最終公開ボタン除外チェックが呼ばれていない')
      assert.ok(/\/公開に進む\//.test(body), '「公開に進む」への一致条件が見つからない')
    },
  },
  {
    name: '【読み戻し検証】ハッシュタグ4個・画像設定状態をDOMから読み戻す関数が存在する',
    fn: () => {
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
      assert.ok(/function countAppliedHashtags/.test(bg), 'countAppliedHashtagsが見つからない')
      assert.ok(/function checkIconApplied/.test(bg), 'checkIconAppliedが見つからない')
      assert.ok(/appliedTagCount/.test(bg) && /iconApplied/.test(bg), '読み戻し結果の使用箇所が見つからない')
    },
  },
  {
    name: '【タイトル・本文の不変性検証】completion-onlyジョブは正規化ハッシュで前後一致を確認し、不一致なら失敗扱いにする',
    fn: () => {
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
      assert.ok(/async function normalizedHash/.test(bg), 'normalizedHash（SHA-256）が見つからない')
      assert.ok(/content_hash_before/.test(bg) && /content_hash_after/.test(bg), 'ハッシュの前後比較ログが見つからない')
      assert.ok(/content_integrity_check_failed/.test(bg), 'ハッシュ不一致時の失敗ステージが見つからない')
    },
  },
  {
    // 2026-09-14続き7：実機で「executeScriptから結果が返らない」障害が繰り返し
    // 発生したが、injectedNoteTransfer内で未捕捉例外が起きるとPromiseが
    // rejectし、蓄積したstagesも含めて一切の診断情報が返らなかった
    // （原因不明のまま3回失敗し恒久failed化していた）。関数全体を
    // try/catchで包み、例外発生時も必ずstages＋例外情報を返す構造に
    // なっていることを確認する。
    name: '【重大バグ再発防止】injectedNoteTransferは未捕捉例外が起きても必ずstages付きの結果を返す（結果なし＝原因不明を構造的に無くす）',
    fn: () => {
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
      const start = bg.indexOf('function injectedNoteTransfer(item) {')
      assert.ok(start >= 0, 'injectedNoteTransferの定義が見つからない')
      const nearby = bg.slice(start, start + 1200)
      assert.ok(/try\s*\{/.test(nearby), 'injectedNoteTransfer冒頭にtry節が見つからない')
      assert.ok(/await runInjectedTransfer\(\)/.test(nearby), 'runInjectedTransferの呼び出しが見つからない')
      assert.ok(/catch\s*\(e\)\s*\{/.test(nearby), 'catch節が見つからない')
      assert.ok(/uncaught_exception_in_injected_function/.test(nearby), '例外時のステージ名・エラーコードが見つからない')
      // catch節がstagesを含む結果を返していることを確認する。
      const catchIdx = nearby.indexOf('catch (e)')
      const afterCatch = nearby.slice(catchIdx, catchIdx + 500)
      assert.ok(/stages,?\s*\}/.test(afterCatch), 'catch節の戻り値にstagesが含まれていない')
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
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
      assert.ok(/function nearestClickable/.test(bg), 'nearestClickableが見つからない')
      assert.ok(/function clickElement/.test(bg), 'clickElementが見つからない')
      // コメント文中の言及を除外し、実コードで trigger.click()／proceedBtn.click()／
      // confirmBtn.click()／saveBtn.click() を直接呼んでいる行が無いことを確認する。
      const codeLines = bg.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
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
      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
      const start = bg.indexOf('async function findOrOpenNoteEditorTab')
      const end = bg.indexOf('function injectedNoteTransfer')
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

      const bg = readFileSync(resolve(EXT_DIR, 'background.js'), 'utf8')
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

export const suite = () => runSuite('chromeExtensionManifest', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} chromeExtensionManifest (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
