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
]

export const suite = () => runSuite('chromeExtensionManifest', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} chromeExtensionManifest (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
