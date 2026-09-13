// GINZA WHISKERS / Project 02（2026-09-14続き11新設）— note下書き自動転記の
// completion-onlyペイロードへ渡す画像ファイル情報の解決（純粋・決定的・
// AIなし・ファイルI/Oのみ）。
//
// noteTransferServer.ts（HTTP・Payloadアクセスを担う薄いラッパー、importする
// だけでHTTPサーバーとPayload接続が起動してしまうため単体テストに向かない）
// から中核ロジックをここへ切り出し、回帰テストで実サーバー起動・DB接続なしに
// 「実画像ファイルの存在確認」「MIME type・SHA-256の実計算」「存在しない場合は
// 必ずnullを返し他画像へ無断代替しない」を検証できるようにする。

import { existsSync, readFileSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { createHash } from 'node:crypto'

export function mimeTypeForExt(ext: string): string {
  const e = ext.toLowerCase()
  if (e === '.png') return 'image/png'
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg'
  if (e === '.webp') return 'image/webp'
  if (e === '.gif') return 'image/gif'
  return 'application/octet-stream'
}

export interface ResolvedImageAsset {
  fileName: string
  mimeType: string
  sha256: string
  sizeBytes: number
  url: string
}

/**
 * iconDir配下に実際にファイルが存在し読み取れる場合のみ、ファイル名・
 * MIME type・SHA-256（ファイル内容から実際に計算）・サイズ・配信URLを返す。
 * 存在しない／読み取れない／パスが不正な場合は必ずnullを返す——他の画像への
 * 無断代替はしない（呼び出し側がnullを見て「使用すべき画像ファイルがない」と
 * 明示する）。
 */
export function resolveImageAsset(
  fileName: string | undefined | null,
  iconDir: string,
  serverBaseUrl: string,
): ResolvedImageAsset | null {
  if (!fileName) return null
  // ディレクトリトラバーサル対策。
  if (fileName.includes('/') || fileName.includes('..')) return null
  const filePath = resolve(iconDir, fileName)
  if (!filePath.startsWith(iconDir) || !existsSync(filePath)) return null
  let bytes: Buffer
  try {
    bytes = readFileSync(filePath)
  } catch {
    return null
  }
  if (bytes.length === 0) return null
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return {
    fileName,
    mimeType: mimeTypeForExt(extname(filePath)),
    sha256,
    sizeBytes: bytes.length,
    url: `${serverBaseUrl}/assets/${encodeURIComponent(fileName)}`,
  }
}
