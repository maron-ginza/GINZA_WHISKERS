// GINZA WHISKERS / Project 02（2026-09-16続き6、マロン指示：V1 Stage4/5の同時書き込み対策）
//
// 同一ディレクトリ内への一時ファイル書き込み→rename による atomic write。
// rename は POSIX 上 atomic なため、読み手は「存在するが中身が半端」なファイルを
// 絶対に見ない（プロセスが書き込み途中で落ちても、target には旧内容か新内容の
// どちらかしか存在しない）。
//
// force:false（既定）のとき、一時ファイル書き込み直前・rename直前の2回 target の
// 存在を確認し、他プロセスが先に作成していれば書き込みを中止する
// （チェック→書き込みの間に生じる TOCTOU レースの窓を最小化する。単一
// オペレーター運用を前提とした実用的な対策であり、完全な排他ロックではない）。

import { writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

export interface AtomicWriteResult {
  written: boolean
  /** written:false のときの理由 */
  reason?: string
}

export function atomicWriteFileSync(
  targetPath: string,
  content: string,
  opts: { force?: boolean } = {},
): AtomicWriteResult {
  if (!opts.force && existsSync(targetPath)) {
    return { written: false, reason: `既に存在します: ${targetPath}` }
  }
  const tmpPath = `${targetPath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`
  writeFileSync(tmpPath, content, { encoding: 'utf8' })
  try {
    if (!opts.force && existsSync(targetPath)) {
      unlinkSync(tmpPath)
      return { written: false, reason: `書き込み準備中に他プロセスが作成しました: ${targetPath}` }
    }
    renameSync(tmpPath, targetPath)
    return { written: true }
  } catch (err) {
    try {
      unlinkSync(tmpPath)
    } catch {
      /* 一時ファイル削除の失敗は握りつぶす（本エラーをそのまま投げる） */
    }
    throw err
  }
}
