// GINZA WHISKERS / Project 02（2026-09-14新設）— chrome-extension/urlMatch.js の
// URL判定ロジックの回帰テスト。実際の編集画面URL
// https://editor.note.com/notes/{noteId}/edit/ への対応、および旧URL
// （note.com/notes/new・note.com/<username>/n/<noteId>/edit）との互換性を検証する。
//
// urlMatch.js は Chrome拡張（background.js から importScripts で読み込む）と
// このテストの両方から**同一のファイル**を使う（ロジックの二重実装によるズレを防ぐ）。
// chrome-extension/ 配下には type:module を宣言するpackage.jsonが無いため
// CommonJSとして解決され、createRequire経由でそのままrequireできる。

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { runSuite, type CheckCase } from './_harness'

const require = createRequire(import.meta.url)
const { isNoteEditorTargetUrl, NOTE_NEW_DRAFT_URL } = require(
  resolve(process.cwd(), '..', 'chrome-extension', 'urlMatch.js'),
) as { isNoteEditorTargetUrl: (url: string) => boolean; NOTE_NEW_DRAFT_URL: string }

const cases: CheckCase[] = [
  {
    name: '【新URL】https://editor.note.com/notes/{noteId}/edit/ を対象と判定する',
    fn: () => {
      assert.equal(isNoteEditorTargetUrl('https://editor.note.com/notes/abc123/edit/'), true)
    },
  },
  {
    name: '【新URL】editor.note.com配下の他のパスも広く対象と判定する（noteId採番前の中間状態等）',
    fn: () => {
      assert.equal(isNoteEditorTargetUrl('https://editor.note.com/notes/new'), true)
      assert.equal(isNoteEditorTargetUrl('https://editor.note.com/'), true)
    },
  },
  {
    name: '【旧URL・互換性】https://note.com/notes/new を引き続き対象と判定する',
    fn: () => {
      assert.equal(isNoteEditorTargetUrl('https://note.com/notes/new'), true)
    },
  },
  {
    name: '【旧URL・互換性】https://note.com/<username>/n/<noteId>/edit を引き続き対象と判定する',
    fn: () => {
      assert.equal(isNoteEditorTargetUrl('https://note.com/ginza_whiskers/n/abcdef123/edit'), true)
    },
  },
  {
    name: '無関係なURL・非httpsは対象外と判定する',
    fn: () => {
      assert.equal(isNoteEditorTargetUrl('https://example.com/'), false)
      assert.equal(isNoteEditorTargetUrl('https://note.com/'), false)
      assert.equal(isNoteEditorTargetUrl('https://note.com/notes'), false, '/notes/new ではない')
      assert.equal(isNoteEditorTargetUrl('http://editor.note.com/notes/abc/edit/'), false, 'httpsのみ対象')
      assert.equal(isNoteEditorTargetUrl(''), false)
      assert.equal(isNoteEditorTargetUrl(undefined as unknown as string), false)
    },
  },
  {
    name: 'なりすましドメイン（editor.note.com.evil.example等）は対象外と判定する',
    fn: () => {
      assert.equal(isNoteEditorTargetUrl('https://editor.note.com.evil.example/notes/abc/edit/'), false)
      assert.equal(isNoteEditorTargetUrl('https://evil.example/?u=editor.note.com'), false)
    },
  },
  {
    name: 'NOTE_NEW_DRAFT_URL（background.jsが新規タブを開く既定URL）は旧note.com URLのまま',
    fn: () => {
      assert.equal(NOTE_NEW_DRAFT_URL, 'https://note.com/notes/new')
    },
  },
]

export const suite = () => runSuite('noteTransferUrlMatch', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} noteTransferUrlMatch (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
