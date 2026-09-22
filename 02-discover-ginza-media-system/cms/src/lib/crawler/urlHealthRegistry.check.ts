// GINZA WHISKERS / Project 02（2026-09-22）— urlHealthRegistry の回帰テスト。
// 2026-09-22の6:00復旧措置で判明した「既知の取得不能URL（404/非HTML等）へ
// 毎日同じリクエストを繰り返す」問題の再発防止策。
//
//   node --import=tsx/esm src/lib/crawler/urlHealthRegistry.check.ts

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { runSuite, type CheckCase } from '../__checks__/_harness'
import {
  classifyFailureReason,
  loadUrlHealthRegistry,
  recordUrlHealth,
  saveUrlHealthRegistry,
  shouldSkipUrl,
  type UrlHealthRegistry,
} from './urlHealthRegistry'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const cases: CheckCase[] = [
  {
    name: '記録なしのURLはスキップしない（初回は必ず試行できる）',
    fn: () => {
      assert(shouldSkipUrl(undefined, '2026-09-22T00:00:00.000Z') === false, '記録なしはスキップしない')
    },
  },
  {
    name: 'status:ok の記録はスキップしない',
    fn: () => {
      const entry = { status: 'ok' as const, lastCheckedAt: '2026-09-22T00:00:00.000Z' }
      assert(shouldSkipUrl(entry, '2026-09-22T00:00:00.000Z') === false, 'okはスキップしない')
    },
  },
  {
    name: '404（恒久失敗）はcooldown期間中（既定14日）スキップする',
    fn: () => {
      const entry = {
        status: 'unreachable' as const,
        reasonCategory: 'http_404' as const,
        reasonDetail: 'HTTPエラー: 404 Not Found',
        lastCheckedAt: '2026-09-20T00:00:00.000Z',
      }
      assert(shouldSkipUrl(entry, '2026-09-22T00:00:00.000Z') === true, '2日後（cooldown内）はスキップする')
    },
  },
  {
    name: '404（恒久失敗）でもcooldown経過後（14日超）は再試行を許可する（恒久的な黒穴にしない）',
    fn: () => {
      const entry = {
        status: 'unreachable' as const,
        reasonCategory: 'http_404' as const,
        reasonDetail: 'HTTPエラー: 404 Not Found',
        lastCheckedAt: '2026-09-01T00:00:00.000Z',
      }
      assert(shouldSkipUrl(entry, '2026-09-22T00:00:00.000Z') === false, '21日後（cooldown超）は再試行を許可する')
    },
  },
  {
    name: 'timeout（一時的失敗）はpermanentより短いcooldown（既定1日）で再試行を許可する',
    fn: () => {
      const entry = {
        status: 'unreachable' as const,
        reasonCategory: 'timeout' as const,
        reasonDetail: 'タイムアウト',
        lastCheckedAt: '2026-09-20T00:00:00.000Z',
      }
      assert(shouldSkipUrl(entry, '2026-09-22T00:00:00.000Z') === false, '2日後（timeoutのcooldown超）は再試行を許可する')
    },
  },
  {
    name: 'classifyFailureReason: 404を正しく分類する',
    fn: () => {
      const r = classifyFailureReason({ httpStatus: 404 })
      assert(r.category === 'http_404', `http_404のはず（実際 ${r.category}）`)
    },
  },
  {
    name: 'classifyFailureReason: 403を正しく分類する',
    fn: () => {
      const r = classifyFailureReason({ httpStatus: 403 })
      assert(r.category === 'http_403', `http_403のはず（実際 ${r.category}）`)
    },
  },
  {
    name: 'classifyFailureReason: 非HTMLレスポンスを正しく分類する',
    fn: () => {
      const r = classifyFailureReason({ contentTypeMismatch: true, errorMessage: '非HTMLレスポンス（Content-Type: text/css）のため対象外' })
      assert(r.category === 'non_html', `non_htmlのはず（実際 ${r.category}）`)
    },
  },
  {
    name: 'classifyFailureReason: 判別できない場合はother（推測しない）',
    fn: () => {
      const r = classifyFailureReason({ errorMessage: '謎のエラー' })
      assert(r.category === 'other', `otherのはず（実際 ${r.category}）`)
    },
  },
  {
    name: 'recordUrlHealth: 元のレジストリを変更せず新しいオブジェクトを返す（純粋関数）',
    fn: () => {
      const before: UrlHealthRegistry = {}
      const after = recordUrlHealth(before, 'https://example.com/x', {
        status: 'unreachable',
        reasonCategory: 'http_404',
        lastCheckedAt: '2026-09-22T00:00:00.000Z',
      })
      assert(Object.keys(before).length === 0, '元のオブジェクトは変更されない')
      assert(after['https://example.com/x']?.status === 'unreachable', '新しいオブジェクトに反映される')
    },
  },
  {
    name: 'recordUrlHealth: 連続失敗回数を積算する',
    fn: () => {
      let reg: UrlHealthRegistry = {}
      reg = recordUrlHealth(reg, 'https://example.com/x', {
        status: 'unreachable', reasonCategory: 'http_404', lastCheckedAt: '2026-09-20T00:00:00.000Z',
      })
      reg = recordUrlHealth(reg, 'https://example.com/x', {
        status: 'unreachable', reasonCategory: 'http_404', lastCheckedAt: '2026-09-21T00:00:00.000Z',
      })
      assert(reg['https://example.com/x'].consecutiveFailures === 2, `2回連続失敗のはず（実際 ${reg['https://example.com/x'].consecutiveFailures}）`)
    },
  },
  {
    name: 'recordUrlHealth: status:okを記録すると連続失敗回数が0にリセットされる',
    fn: () => {
      let reg: UrlHealthRegistry = {}
      reg = recordUrlHealth(reg, 'https://example.com/x', {
        status: 'unreachable', reasonCategory: 'http_404', lastCheckedAt: '2026-09-20T00:00:00.000Z',
      })
      reg = recordUrlHealth(reg, 'https://example.com/x', { status: 'ok', lastCheckedAt: '2026-09-21T00:00:00.000Z' })
      assert(reg['https://example.com/x'].consecutiveFailures === 0, '成功でリセットされるはず')
    },
  },
  {
    name: '存在しないファイルの読み込みは空レジストリを返す（推測補完しない）',
    fn: () => {
      const dir = mkdtempSync(resolve(tmpdir(), 'url-health-'))
      try {
        const reg = loadUrlHealthRegistry(resolve(dir, 'not-exists.json'))
        assert(Object.keys(reg).length === 0, '空のはず')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  },
  {
    name: '保存→読み込みのラウンドトリップで内容が一致する',
    fn: () => {
      const dir = mkdtempSync(resolve(tmpdir(), 'url-health-'))
      try {
        const target = resolve(dir, 'registry.json')
        const reg: UrlHealthRegistry = {
          'https://example.com/a': { status: 'ok', lastCheckedAt: '2026-09-22T00:00:00.000Z' },
        }
        saveUrlHealthRegistry(target, reg)
        const loaded = loadUrlHealthRegistry(target)
        assert(loaded['https://example.com/a']?.status === 'ok', 'ラウンドトリップで内容が一致するはず')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  },
  {
    name: '2回目の保存（force）は既存ファイルを上書きできる（atomicWriteの既定force:falseとは異なる用途）',
    fn: () => {
      const dir = mkdtempSync(resolve(tmpdir(), 'url-health-'))
      try {
        const target = resolve(dir, 'registry.json')
        saveUrlHealthRegistry(target, { a: { status: 'ok', lastCheckedAt: '2026-09-22T00:00:00.000Z' } })
        saveUrlHealthRegistry(target, { b: { status: 'ok', lastCheckedAt: '2026-09-22T00:00:00.000Z' } })
        const loaded = loadUrlHealthRegistry(target)
        assert(loaded.a === undefined && loaded.b !== undefined, '2回目の保存が反映されるはず（毎日更新できる）')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  },
  {
    name: '壊れたJSONファイルの読み込みは空レジストリを返す（クラッシュしない）',
    fn: () => {
      const dir = mkdtempSync(resolve(tmpdir(), 'url-health-'))
      try {
        const target = resolve(dir, 'broken.json')
        writeFileSync(target, '{not valid json')
        const reg = loadUrlHealthRegistry(target)
        assert(Object.keys(reg).length === 0, '壊れたファイルは空扱い（推測復元しない）')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('urlHealthRegistry', cases)
