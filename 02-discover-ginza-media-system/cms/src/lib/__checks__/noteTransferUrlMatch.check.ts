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
const { isNoteEditorTargetUrl, NOTE_NEW_DRAFT_URL, hasAssignedNoteId } = require(
  resolve(process.cwd(), '..', 'chrome-extension', 'urlMatch.js'),
) as {
  isNoteEditorTargetUrl: (url: string) => boolean
  NOTE_NEW_DRAFT_URL: string
  hasAssignedNoteId: (url: string) => boolean
}

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
  {
    // 2026-09-18新設（マロン指示・根本修正）：#73/#74のタブ混在事故の再発防止。
    name: '【hasAssignedNoteId】noteId採番済みの編集画面URLはtrue（新規記事のタブ選定で再利用してはならない）',
    fn: () => {
      assert.equal(hasAssignedNoteId('https://editor.note.com/notes/n8ce6303cb407/edit/'), true)
    },
  },
  {
    name: '【hasAssignedNoteId】公開設定画面（/publish/）も採番済みとしてtrue（編集画面と誤検出しない）',
    fn: () => {
      assert.equal(hasAssignedNoteId('https://editor.note.com/notes/n8ce6303cb407/publish/'), true, '実際の事故（#74がpublish画面のタブを再利用）の再現ケース')
    },
  },
  {
    name: '【hasAssignedNoteId】noteId未採番（新規作成入口・空白の中間状態）はfalse（唯一再利用してよい候補）',
    fn: () => {
      assert.equal(hasAssignedNoteId('https://editor.note.com/notes/new'), false)
      assert.equal(hasAssignedNoteId('https://editor.note.com/'), false)
      assert.equal(hasAssignedNoteId('https://note.com/notes/new'), false)
    },
  },
  {
    name: '【hasAssignedNoteId】旧URL（note.com/<username>/n/<noteId>/edit）は採番済みとしてtrue',
    fn: () => {
      assert.equal(hasAssignedNoteId('https://note.com/ginza_whiskers/n/abcdef123/edit'), true)
    },
  },
  {
    name: '【hasAssignedNoteId】無関係なURL・非httpsはfalse',
    fn: () => {
      assert.equal(hasAssignedNoteId('https://example.com/'), false)
      assert.equal(hasAssignedNoteId('http://editor.note.com/notes/abc/edit/'), false)
      assert.equal(hasAssignedNoteId(''), false)
      assert.equal(hasAssignedNoteId(undefined as unknown as string), false)
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
