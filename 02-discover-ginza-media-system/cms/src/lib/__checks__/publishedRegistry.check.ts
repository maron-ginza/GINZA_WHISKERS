// GINZA WHISKERS / Project 02（2026-09-12）— PUBLISHED_REGISTRY（既公開テーマ補助台帳）の
// 読み込み・追記ロジックの回帰テスト。2026-09-12、MANUAL_PUBLISHED_SEEDのTypeScript直書きを
// git管理JSON台帳＋追記専用CLI（./p2 publishlog add）へ切り替えた際に新設。
//
// 実ファイル（publishedRegistry.json）は書き換えない——一時ディレクトリに複製して検証する。

import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { loadPublishedRegistry, appendPublishedRegistryEntry, MANUAL_PUBLISHED_SEED } from '../publish/loadPublishedThemes'
import type { PublishedTheme } from '../publish/publishedThemes'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

function withTempRegistry(initial: PublishedTheme[], fn: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'published-registry-check-'))
  const path = join(dir, 'registry.json')
  writeFileSync(path, JSON.stringify(initial, null, 2), 'utf8')
  try {
    fn(path)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const SAMPLE: PublishedTheme = {
  noteUrl: null,
  title: 'テスト候補A',
  eventName: 'テスト候補A',
  venue: 'テスト会場',
  period: '2026年9月1日〜9月10日',
  dcId: 90001,
  source: 'test:seed',
  publishedAt: null,
}

const cases: CheckCase[] = [
  {
    name: '実ファイル（publishedRegistry.json）は存在し、DC#352・#246・#365・#327を含む',
    fn: () => {
      const real = loadPublishedRegistry()
      const ids = real.map((e) => e.dcId)
      for (const id of [327, 352, 246, 365]) {
        assert(ids.includes(id), `dcId=${id} が実台帳に見つからない`)
      }
    },
  },
  {
    name: 'MANUAL_PUBLISHED_SEED（後方互換エイリアス）は実台帳と同じ中身を返す',
    fn: () => {
      const real = loadPublishedRegistry()
      assert(MANUAL_PUBLISHED_SEED.length === real.length, `件数不一致: alias=${MANUAL_PUBLISHED_SEED.length} real=${real.length}`)
      assert(
        MANUAL_PUBLISHED_SEED.every((e) => real.some((r) => r.dcId === e.dcId)),
        'MANUAL_PUBLISHED_SEED の一部が実台帳に無い',
      )
    },
  },
  {
    name: '存在しないファイルパスを渡すと空配列を返す（推測補完しない・例外を投げない）',
    fn: () => {
      const out = loadPublishedRegistry('/nonexistent/path/does-not-exist.json')
      assert(Array.isArray(out) && out.length === 0, '空配列ではない結果が返った')
    },
  },
  {
    name: '壊れたJSONファイルは空配列を返す（例外を投げない）',
    fn: () => {
      const dir = mkdtempSync(join(tmpdir(), 'published-registry-check-'))
      const path = join(dir, 'broken.json')
      writeFileSync(path, '{not valid json', 'utf8')
      try {
        const out = loadPublishedRegistry(path)
        assert(Array.isArray(out) && out.length === 0, '壊れたJSONでも空配列を返すべき')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  },
  {
    name: 'JSON配列でないファイル（オブジェクト直書き等）も空配列を返す',
    fn: () => {
      const dir = mkdtempSync(join(tmpdir(), 'published-registry-check-'))
      const path = join(dir, 'notarray.json')
      writeFileSync(path, JSON.stringify({ foo: 'bar' }), 'utf8')
      try {
        const out = loadPublishedRegistry(path)
        assert(Array.isArray(out) && out.length === 0, '配列でないJSONは空配列を返すべき')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  },
  {
    name: 'appendPublishedRegistryEntry：新規dcIdは末尾に追加される',
    fn: () => {
      withTempRegistry([], (path) => {
        const out = appendPublishedRegistryEntry(SAMPLE, path)
        assert(out.length === 1, `件数が1件でない: ${out.length}`)
        assert(out[0].dcId === 90001, 'dcIdが一致しない')
        const persisted = JSON.parse(readFileSync(path, 'utf8')) as PublishedTheme[]
        assert(persisted.length === 1 && persisted[0].dcId === 90001, 'ファイルへ永続化されていない')
      })
    },
  },
  {
    name: 'appendPublishedRegistryEntry：同一dcIdは上書きされる（重複追加しない）',
    fn: () => {
      withTempRegistry([SAMPLE], (path) => {
        const updated: PublishedTheme = { ...SAMPLE, title: 'テスト候補A（更新後）', noteUrl: 'https://note.com/ginza_whiskers/n/nabcdef123' }
        const out = appendPublishedRegistryEntry(updated, path)
        assert(out.length === 1, `重複追加された: ${out.length}件`)
        assert(out[0].title === 'テスト候補A（更新後）', '上書き内容が反映されていない')
        assert(out[0].noteUrl === 'https://note.com/ginza_whiskers/n/nabcdef123', 'noteUrlが上書きされていない')
      })
    },
  },
  {
    name: 'appendPublishedRegistryEntry：既存の他エントリは保持される',
    fn: () => {
      const other: PublishedTheme = { ...SAMPLE, dcId: 90002, title: 'テスト候補B' }
      withTempRegistry([other], (path) => {
        const out = appendPublishedRegistryEntry(SAMPLE, path)
        assert(out.length === 2, `件数が2件でない: ${out.length}`)
        assert(out.some((e) => e.dcId === 90002), '既存エントリ(#90002)が消えた')
        assert(out.some((e) => e.dcId === 90001), '新規エントリ(#90001)が追加されていない')
      })
    },
  },
]

export const suite = () => runSuite('publishedRegistry', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
