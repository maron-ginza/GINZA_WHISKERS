// 再発防止 #2（2026-09-01 Trial）：B2F / B1F / B3F など地下階表記の先頭「B」欠落を防ぐ。
//
// 背景：2026-09-01 の Trial で、店舗フロアが「B2F（地下2階）」であるべきところ
// 取得データ側に「2F」表記の混入が見つかった（先頭 B の欠落＝地上2階と誤読させる）。
// 今回の Trial ではどのコードが "2F" を生んだかは特定できなかったため、
// (a) フロア文字列を正規化する際に先頭 B を絶対に落とさない関数、
// (b) 本文と出典を突き合わせて「B が落ちている」ことを検知する関数、
// の2つを決定的に用意する。AI 呼び出しなし。

/** 全角数字 → 半角 */
function toHalfDigits(s: string): string {
  return s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xff10 + 0x30))
}

/**
 * 地下階トークン（B / Ｂ + 数字 + F / Ｆ、幅・空白ゆれ含む）を "B<n>F" へ正規化する。
 * - 先頭 B は保持（潰さない）
 * - 地上階（"2F" など B なし）はそのまま
 * - 「地下2階」表記は変換しない（別系統の正規表現。日本語表記はそのまま残す）
 */
export function normalizeFloorTokens(text: string): string {
  if (!text) return text
  return text.replace(/([BbＢ])\s*([0-9０-９]+)\s*([FfＦ])/g, (_m, _b, digits) => {
    return `B${toHalfDigits(String(digits))}F`
  })
}

/** テキストに地下階表記（B1F 等 / 地下N階）が含まれるか */
export function hasBasementFloor(text: string | null | undefined): boolean {
  if (!text) return false
  return /[BbＢ]\s*[0-9０-９]+\s*[FfＦ]/.test(text) || /地下\s*[0-9０-９]+\s*階/.test(text)
}

export interface BasementFloorDropResult {
  /** 本文で先頭 B が落ちた地下階表記が見つかったか */
  dropped: boolean
  /** 落ちていた階（出典表記 → 本文表記） */
  floors: { source: string; body: string }[]
}

/** 本文中の「Bなしの N F」トークンを拾う（英単語の一部＝"...F" は除外） */
function bareFloorDigits(body: string): string[] {
  const out: string[] = []
  // 直前が B/Ｂ/数字/英字/「地下」でない、直後が英字でない "<digits>F"
  const re = /(^|[^BbＢA-Za-z0-9０-９])([0-9０-９]+)\s*[FfＦ](?![A-Za-z])/g
  for (const m of body.matchAll(re)) {
    // 「地下2階」由来ではないこと（直前 3 文字に「地下」が無い）を軽く確認
    const idx = m.index ?? 0
    const preceding = body.slice(Math.max(0, idx - 3), idx + m[1].length)
    if (preceding.includes('地下')) continue
    out.push(toHalfDigits(m[2]))
  }
  return out
}

/**
 * 出典テキストに "B<n>F" があるのに、本文では同じ数字が "<n>F"（Bなし）に
 * なっている場合を検出する。9月Trial は WARNING 想定。
 */
export function detectBasementFloorDrop(
  bodyText: string,
  sourceTexts: (string | null | undefined)[],
): BasementFloorDropResult {
  const source = sourceTexts.filter(Boolean).join('\n')
  const body = bodyText ?? ''

  // 出典側の地下階数字（"B2F" → "2"）
  const sourceBasementDigits = new Set<string>()
  for (const m of source.matchAll(/[BbＢ]\s*([0-9０-９]+)\s*[FfＦ]/g)) {
    sourceBasementDigits.add(toHalfDigits(m[1]))
  }
  if (sourceBasementDigits.size === 0) return { dropped: false, floors: [] }

  const floors: { source: string; body: string }[] = []
  for (const d of bareFloorDigits(body)) {
    if (sourceBasementDigits.has(d)) {
      floors.push({ source: `B${d}F`, body: `${d}F` })
    }
  }
  // 本文に正しい "B<d>F" が別途あれば取り下げ（誤検知抑制）
  const filtered = floors.filter((f) => !new RegExp(`[BbＢ]\\s*${f.body.replace('F', '')}\\s*[FfＦ]`).test(body))

  return { dropped: filtered.length > 0, floors: filtered }
}
