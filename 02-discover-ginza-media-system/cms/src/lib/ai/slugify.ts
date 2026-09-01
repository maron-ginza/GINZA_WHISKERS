// 再発防止 #3（2026-09-01 Trial）：記事 slug 生成前の正規化。
//
// 背景：既存の draft 生成は `slug: draft.title` を素通しで代入しており
// （createMultiAngleDraftsFromDiscoveredContent.ts:211 の既知 TODO）、
// クローラ由来タイトルの HTML 文字参照（&#8211;）や施設ボイラープレート
// （「… | GSIX | ギンザ シックス | 銀座シックス」）や角括弧タグ（【フェア】）が
// そのまま slug に入っていた。この関数で「デコード → ボイラープレート除去 →
// 角括弧タグ除去 → URL 危険文字を除去」まで決定的に行う。日本語は残す
// （既存 slug も日本語）。ローマ字化は将来課題（§20）。

import { decodeHtmlEntities } from '../crawler/htmlEntities'

// `｜` / `|` で区切られた末尾セグメントのうち、これらを含むものは施設・媒体名の
// ボイラープレートとみなして落とす（本文タイトルは先頭セグメントに来る前提）。
const BOILERPLATE_SEGMENT_HINTS = [
  'GINZA SIX',
  'GSIX',
  'ギンザ シックス',
  '銀座シックス',
  '銀座 蔦屋書店',
  '蔦屋書店',
  'GINZA OFFICIAL',
  '銀座公式',
  'お知らせ・新着情報',
  'おすすめニュース',
  '生活提案型商業施設',
  'ニュース',
]

/** 先頭・末尾の角括弧タグ（【…】〈…〉［…］(…)）を除去する */
function stripBracketTags(s: string): string {
  let out = s
  // 先頭側
  out = out.replace(/^\s*(?:【[^】]*】|〈[^〉]*〉|［[^］]*］|\([^)]*\))\s*/g, '')
  // 末尾側
  out = out.replace(/\s*(?:【[^】]*】|〈[^〉]*〉|［[^］]*］|\([^)]*\))\s*$/g, '')
  return out
}

export interface SlugifyOptions {
  /** slug の最大長（文字数、既定 80） */
  maxLength?: number
}

export function slugify(rawTitle: string, options: SlugifyOptions = {}): string {
  const maxLength = options.maxLength ?? 80
  if (!rawTitle) return ''

  let s = decodeHtmlEntities(rawTitle)

  // 「タイトル – サイト名」「タイトル — 施設名」形式（前後に空白のあるダッシュ）も
  // セグメント区切りとして扱う（多くのサイトの <title> 慣習）。
  s = s.replace(/\s+[–—―]\s+/g, '｜')

  // 「｜」「|」区切りの末尾ボイラープレートを削る（先頭セグメント＝本文タイトルは残す）
  const segments = s
    .split(/\s*[｜|]\s*/)
    .map((seg) => seg.trim())
    .filter(Boolean)
  if (segments.length > 1) {
    const kept: string[] = []
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const isBoilerplate = BOILERPLATE_SEGMENT_HINTS.some((h) => seg.includes(h))
      // 先頭セグメントは（ボイラープレートでない限り）常に残す
      if (i === 0 && !isBoilerplate) {
        kept.push(seg)
      } else if (!isBoilerplate) {
        kept.push(seg)
      }
    }
    s = (kept.length > 0 ? kept : [segments[0]]).join(' ')
  }

  s = stripBracketTags(s)

  s = s
    // 各種ダッシュ・波ダッシュを標準ハイフンへ
    .replace(/[–—―ー−~〜]/g, '-')
    // URL パスで危険／不要な文字を空白へ
    .replace(/[\\/#?%&<>"'`^*={}[\]:;,.。、！!？?｜|＠@＃$￥¥（）()「」『』…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // 空白と連続ハイフンをハイフン1つへ
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if ([...s].length > maxLength) {
    s = [...s].slice(0, maxLength).join('').replace(/-+$/g, '')
  }
  return s
}
