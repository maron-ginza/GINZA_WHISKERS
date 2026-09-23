// GINZA WHISKERS / Project 02（2026-09-16続き6）— atomic write の回帰テスト。
//
//   node --import=tsx/esm src/lib/util/atomicWrite.check.ts

import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { atomicWriteFileSync } from './atomicWrite'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const cases: CheckCase[] = [
  {
    name: '新規ファイルへの書き込みは成功し、内容が読み戻せる',
    fn: () => {
      const dir = mkdtempSync(resolve(tmpdir(), 'atomic-write-'))
      try {
        const target = resolve(dir, 'out.json')
        const r = atomicWriteFileSync(target, JSON.stringify({ a: 1 }))
        assert(r.written === true, '書き込み成功')
        assert(readFileSync(target, 'utf8') === JSON.stringify({ a: 1 }), '内容が一致')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  },
  {
    name: '既に存在するファイルへは force:false（既定）だと書き込まず、元の内容を保持する',
    fn: () => {
      const dir = mkdtempSync(resolve(tmpdir(), 'atomic-write-'))
      try {
        const target = resolve(dir, 'out.json')
        writeFileSync(target, 'original')
        const r = atomicWriteFileSync(target, 'new-content')
        assert(r.written === false, '書き込まれない')
        assert(readFileSync(target, 'utf8') === 'original', '元の内容が保持される')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  },
  {
    name: 'force:true では既存ファイルを上書きできる',
    fn: () => {
      const dir = mkdtempSync(resolve(tmpdir(), 'atomic-write-'))
      try {
        const target = resolve(dir, 'out.json')
        writeFileSync(target, 'original')
        const r = atomicWriteFileSync(target, 'new-content', { force: true })
        assert(r.written === true, '書き込み成功')
        assert(readFileSync(target, 'utf8') === 'new-content', '上書きされる')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  },
  {
    name: '書き込み後、ディレクトリに一時ファイル（.tmp-）が残らない',
    fn: () => {
      const dir = mkdtempSync(resolve(tmpdir(), 'atomic-write-'))
      try {
        const target = resolve(dir, 'out.json')
        atomicWriteFileSync(target, 'content')
        const files = readdirSync(dir)
        assert(files.length === 1 && files[0] === 'out.json', `一時ファイルが残っていない（実際 ${JSON.stringify(files)}）`)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  },
  {
    // 【2026-09-24追加・実障害の再発防止】2026-09-23 6:00の自動収集で
    // sweets_detail_fetch が3回とも `.devlogs/crawler/url-health-registry.json.tmp-...
    // ENOENT: no such file or directory` で失敗した。原因は atomicWriteFileSync が
    // targetPath の親ディレクトリの存在を一切確認・作成していなかったこと
    // （呼び出し元の urlHealthRegistry.ts 側もディレクトリを作成していなかった）。
    name: 'targetPathの親ディレクトリが未作成でも自動作成して書き込みに成功する（多段階の未作成ディレクトリを含む）',
    fn: () => {
      const dir = mkdtempSync(resolve(tmpdir(), 'atomic-write-'))
      try {
        const nested = resolve(dir, 'a', 'b', 'c')
        assert(!existsSync(nested), '事前条件：nestedディレクトリは存在しない')
        const target = resolve(nested, 'out.json')
        const r = atomicWriteFileSync(target, 'content')
        assert(r.written === true, '未作成ディレクトリ配下でも書き込み成功するはず')
        assert(readFileSync(target, 'utf8') === 'content', '内容が一致するはず')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  },
  {
    name: '書き込み失敗（存在チェックで拒否）時も一時ファイルを残さない',
    fn: () => {
      const dir = mkdtempSync(resolve(tmpdir(), 'atomic-write-'))
      try {
        const target = resolve(dir, 'out.json')
        writeFileSync(target, 'original')
        atomicWriteFileSync(target, 'new-content')
        const files = readdirSync(dir)
        assert(files.length === 1 && files[0] === 'out.json', `一時ファイルが残っていない（実際 ${JSON.stringify(files)}）`)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('atomicWrite', cases)
