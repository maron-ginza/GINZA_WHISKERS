// GINZA WHISKERS / Project 02（2026-09-14続き11新設）— resolveImageAsset.ts
// （note下書き自動転記の画像ファイル解決）の回帰テスト。実サーバー起動・
// DB接続なしで、「実ファイルが存在する場合のみMIME type・SHA-256・URLを
// 返す」「存在しない場合は必ずnullを返し他画像へ無断代替しない」を検証する。

import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

import { resolveImageAsset, mimeTypeForExt } from '../night/resolveImageAsset'
import { runSuite, type CheckCase } from './_harness'

const tmpDir = mkdtempSync(resolve(tmpdir(), 'resolve-image-asset-check-'))
process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // クリーンアップ失敗はテスト結果に影響させない。
  }
})
const realFileBytes = Buffer.from('GINZA WHISKERS test icon bytes 1234567890')
writeFileSync(resolve(tmpDir, 'real-icon.jpg'), realFileBytes)
writeFileSync(resolve(tmpDir, 'empty.png'), Buffer.alloc(0))
const expectedSha256 = createHash('sha256').update(realFileBytes).digest('hex')

const cases: CheckCase[] = [
  {
    name: '実在するファイルはfileName・mimeType・sha256（実計算）・sizeBytes・urlを返す',
    fn: () => {
      const result = resolveImageAsset('real-icon.jpg', tmpDir, 'http://localhost:4601')
      assert.ok(result, '実在ファイルなのにnullが返った')
      assert.equal(result!.fileName, 'real-icon.jpg')
      assert.equal(result!.mimeType, 'image/jpeg')
      assert.equal(result!.sha256, expectedSha256, 'SHA-256がファイル内容から正しく計算されていない')
      assert.equal(result!.sizeBytes, realFileBytes.length)
      assert.equal(result!.url, 'http://localhost:4601/assets/real-icon.jpg')
    },
  },
  {
    name: '【他画像への無断代替禁止】存在しないファイル名は必ずnullを返す',
    fn: () => {
      assert.equal(resolveImageAsset('does-not-exist.jpg', tmpDir, 'http://localhost:4601'), null)
    },
  },
  {
    name: 'fileNameが未指定（null/undefined）の場合もnullを返す',
    fn: () => {
      assert.equal(resolveImageAsset(null, tmpDir, 'http://localhost:4601'), null)
      assert.equal(resolveImageAsset(undefined, tmpDir, 'http://localhost:4601'), null)
    },
  },
  {
    name: '空ファイル（0バイト）はnullを返す（使用不可の画像として扱う）',
    fn: () => {
      assert.equal(resolveImageAsset('empty.png', tmpDir, 'http://localhost:4601'), null)
    },
  },
  {
    name: '【ディレクトリトラバーサル対策】"/"や".."を含むファイル名はnullを返す',
    fn: () => {
      assert.equal(resolveImageAsset('../secret.jpg', tmpDir, 'http://localhost:4601'), null)
      assert.equal(resolveImageAsset('sub/dir.jpg', tmpDir, 'http://localhost:4601'), null)
    },
  },
  {
    name: 'mimeTypeForExtが既知拡張子を正しく判定し、未知拡張子はoctet-streamを返す',
    fn: () => {
      assert.equal(mimeTypeForExt('.jpg'), 'image/jpeg')
      assert.equal(mimeTypeForExt('.JPEG'), 'image/jpeg')
      assert.equal(mimeTypeForExt('.png'), 'image/png')
      assert.equal(mimeTypeForExt('.webp'), 'image/webp')
      assert.equal(mimeTypeForExt('.gif'), 'image/gif')
      assert.equal(mimeTypeForExt('.exe'), 'application/octet-stream')
    },
  },
]

export const suite = () => runSuite('resolveImageAsset', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} resolveImageAsset (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
