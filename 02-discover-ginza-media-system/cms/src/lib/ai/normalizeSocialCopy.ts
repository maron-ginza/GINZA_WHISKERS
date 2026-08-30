// Project 02-2 収益化② Tier 1（2026-08-30）／Tier S1（同日、媒体別最適化）：
// Social Copy の決定的正規化。AI呼び出しなし。
//
// 生成後の socialCopyNote / socialCopyX / socialCopyInstagram それぞれに対して、
//   1. 重複ハッシュタグの除去（先勝ち）
//   2. ハッシュタグ上限（既定 note 3 / X 3 / Instagram 2）への切り詰め（末尾から、
//      #銀座 は必ず1枠残す）
//   3. 「#銀座」タグの存在保証（無ければ末尾に付与）
// を「その場編集」で行う。本文の言い回し・改行構造は極力壊さない。
// 上限は呼び出し側から caps で上書き可能（config.ts の SOCIALCOPY_*_MAX_TAGS）。

const HASHTAG_RE = /#[^\s#、。，,]+/g
const GINZA_TAG = '#銀座'

export interface SocialCopyCaps {
  note: number
  x: number
  instagram: number
}

export const DEFAULT_SOCIAL_COPY_CAPS: SocialCopyCaps = { note: 3, x: 3, instagram: 2 }

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function tagsOf(text: string): string[] {
  return text.match(HASHTAG_RE) ?? []
}

function normalizeOne(text: string, maxTags: number, changed: string[], label: string): string {
  let out = text ?? ''

  // 1. 重複除去（大文字小文字・先頭#無視で比較、2つ目以降を本文から削除）
  const seen = new Set<string>()
  for (const tag of tagsOf(out)) {
    const key = tag.replace(/^#/, '').toLowerCase()
    if (seen.has(key)) {
      out = out.replace(new RegExp(`\\s*${escapeRegExp(tag)}`), '')
      changed.push(`${label}:重複タグ除去(${tag})`)
    } else {
      seen.add(key)
    }
  }

  // 2. 上限を守りつつ #銀座 は必ず残す。#銀座 以外のタグを末尾から削って
  //    「#銀座以外 ≤ maxTags-1」に収め、#銀座 が無ければ末尾に付与する。
  const remaining = tagsOf(out)
  const isGinza = (t: string) => t.replace(/^#/, '') === '銀座'
  const hasGinza = remaining.some(isGinza)
  const nonGinza = remaining.filter((t) => !isGinza(t))
  if (nonGinza.length > maxTags - 1) {
    for (const tag of nonGinza.slice(maxTags - 1)) {
      out = out.replace(new RegExp(`\\s*${escapeRegExp(tag)}`), '')
    }
    changed.push(`${label}:タグ数を${maxTags}に制限`)
  }
  if (!hasGinza) {
    out = `${out.replace(/\s+$/, '')} ${GINZA_TAG}`
    changed.push(`${label}:#銀座を付与`)
  }

  // 体裁の軽い整え（行末の空白・末尾の連続空行）
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')
}

export interface NormalizeSocialCopyInput {
  note: string
  x: string
  instagram: string
}

export interface NormalizeSocialCopyResult {
  note: string
  x: string
  instagram: string
  /** 実際に変更した内容のリスト（ログ用、空なら無変更） */
  changed: string[]
}

export function normalizeSocialCopy(
  input: NormalizeSocialCopyInput,
  caps: SocialCopyCaps = DEFAULT_SOCIAL_COPY_CAPS,
): NormalizeSocialCopyResult {
  const changed: string[] = []
  return {
    note: normalizeOne(input.note ?? '', caps.note, changed, 'note'),
    x: normalizeOne(input.x ?? '', caps.x, changed, 'x'),
    instagram: normalizeOne(input.instagram ?? '', caps.instagram, changed, 'instagram'),
    changed,
  }
}
