import { readFileSync } from 'fs'

import type { ImportRowInput } from './importMusicTracksCandidates'

// CSV/JSON両対応のインポートファイルパーサー（2026-08-27）。外部ライブラリを
// 追加せず、最小限のRFC4180風パーサーを自前実装する（本プロジェクトの
// 「フルNLP・重量級ライブラリは使わず素朴な実装で十分」という既存方針を踏襲）。

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      cells.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells
}

export function parseMusicTracksImportFile(filePath: string): ImportRowInput[] {
  const content = readFileSync(filePath, 'utf-8')

  if (filePath.endsWith('.json')) {
    const parsed = JSON.parse(content)
    const tracks = Array.isArray(parsed) ? parsed : parsed.tracks
    if (!Array.isArray(tracks)) {
      throw new Error(
        'JSONの形式が不正です。トップレベルが配列であるか、{"tracks": [...]}の形式である必要があります。',
      )
    }
    return tracks as ImportRowInput[]
  }

  if (filePath.endsWith('.csv')) {
    const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '')
    if (lines.length === 0) return []

    const header = parseCsvLine(lines[0]).map((h) => h.trim())
    return lines.slice(1).map((line) => {
      const cells = parseCsvLine(line)
      const row: Record<string, string> = {}
      header.forEach((key, idx) => {
        row[key] = (cells[idx] ?? '').trim()
      })
      return row as unknown as ImportRowInput
    })
  }

  throw new Error(`未対応のファイル形式です（.csvまたは.jsonのみ対応）: ${filePath}`)
}
