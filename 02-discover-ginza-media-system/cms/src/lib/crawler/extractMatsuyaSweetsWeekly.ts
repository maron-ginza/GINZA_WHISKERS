// GINZA WHISKERS / Project 02（2026-09-14新設）— 松屋銀座「今週のGINZAスイート」
// 週替わり催事ページ（fetchJsRenderedPageで取得したレンダリング後テキスト）から、
// 店舗別の商品・価格・共通の開催期間を決定的に抽出する（純粋関数・推測しない）。
//
// ページ構造（実データで確認、2026-09-14）：
//   地下1F GINZAスイート
//   2026年9月9日(水)－15日(火)          ← 全店舗共通の開催期間
//
//   ＜銀座 清月堂本店＞                  ← 店舗名（山括弧で囲まれる）
//   抹茶クラッシュゼリーラテ             ← 商品名
//   990円                                ← 価格
//   （説明文、複数行のことがある）
//
//   ＜ジッカ＞
//   ...
//
// 商品名・価格が同一行に並ぶ店舗（例：レアチーズケーキ　341円）にも対応する。
// 説明文中の「※」注記（出店日限定等）はcaveatとして保持する（本文生成では使わない）。

export interface MatsuyaSweetsItem {
  vendorName: string
  /** 1店舗で複数商品があり得るため配列 */
  products: { name: string; priceYen: number | null }[]
  /** 商品説明（明記があれば）。無ければ空文字。 */
  description: string
  /** 「※」で始まる注記（出店日限定等）。無ければ空文字。 */
  caveat: string
}

export interface MatsuyaSweetsWeeklyResult {
  /** 全店舗共通の開催期間（明記テキストそのまま）。抽出できなければ null。 */
  periodText: string | null
  location: string | null
  items: MatsuyaSweetsItem[]
}

const PERIOD_RE = /(\d{4}年\d{1,2}月\d{1,2}日[（(][日月火水木金土][）)]\s*[－\-〜～]\s*\d{1,2}日[（(][日月火水木金土][）)])/
const LOCATION_RE = /^(地下[０-９0-9]F.*スイート.*)$/m
const PRICE_RE = /([\d,]+)\s*円/g

/** 全角スペース・ゼロ幅スペース等を通常の半角スペースへ正規化する。 */
function normalizeSpaces(s: string): string {
  return s.replace(/[​​　]/g, ' ').trim()
}

/** ゼロ幅スペース（U+200B）等、日本語サイトの見えない文字を正規表現マッチ前に除去する。 */
function stripZeroWidth(s: string): string {
  return s.replace(/[​‌‍﻿]/g, '')
}

export function extractMatsuyaSweetsWeekly(rawText: string): MatsuyaSweetsWeeklyResult {
  const text = stripZeroWidth(rawText.replace(/\r\n/g, '\n'))

  const periodMatch = text.match(PERIOD_RE)
  const periodText = periodMatch ? normalizeSpaces(periodMatch[1]) : null

  const locationMatch = text.match(LOCATION_RE)
  const location = locationMatch ? normalizeSpaces(locationMatch[1]) : null

  // ページ冒頭には「今週の GINZAスイート」の見出し直後に、本文と同じ
  // ＜店舗名＞表記の短いプレビュー一覧（商品情報を伴わない）が別途出現する。
  // 実際の商品・価格を含む本文ブロックは、開催期間・場所の行より後に来るため、
  // その位置より前の＜店舗名＞出現はプレビュー一覧としてスキップする。
  const contentStartIndex = Math.min(
    periodMatch ? periodMatch.index! : Infinity,
    locationMatch ? locationMatch.index! : Infinity,
  )
  const scanFrom = Number.isFinite(contentStartIndex) ? contentStartIndex : 0

  // ＜店舗名＞ を区切りに本文を分割する（本文ブロック開始位置以降のみ）
  const vendorBlockRe = /＜([^＞]+)＞/g
  const vendorPositions: { name: string; start: number; contentStart: number }[] = []
  let m: RegExpExecArray | null
  while ((m = vendorBlockRe.exec(text)) !== null) {
    if (m.index < scanFrom) continue
    vendorPositions.push({ name: normalizeSpaces(m[1]), start: m.index, contentStart: m.index + m[0].length })
  }

  const items: MatsuyaSweetsItem[] = []
  for (let i = 0; i < vendorPositions.length; i++) {
    const cur = vendorPositions[i]
    const next = vendorPositions[i + 1]
    const blockText = text.slice(cur.contentStart, next ? next.start : text.length)
    const lines = blockText
      .split('\n')
      .map((l) => normalizeSpaces(l))
      .filter((l) => l.length > 0)

    const products: MatsuyaSweetsItem['products'] = []
    const descLines: string[] = []
    const caveatLines: string[] = []

    for (const line of lines) {
      if (line.startsWith('※')) {
        caveatLines.push(line)
        continue
      }
      PRICE_RE.lastIndex = 0
      const priceMatches = [...line.matchAll(PRICE_RE)]
      if (priceMatches.length > 0) {
        // 「レアチーズケーキ　341円」のように商品名+価格が同一行、
        // または「990円」のように価格のみの行（直前行が商品名）の両方に対応する。
        const priceOnly = /^[\d,]+\s*円$/.test(line)
        if (priceOnly) {
          const price = Number(priceMatches[0][1].replace(/,/g, ''))
          const lastProduct = products[products.length - 1]
          if (lastProduct && lastProduct.priceYen == null) {
            lastProduct.priceYen = price
          } else {
            // 直前に商品名候補が無ければ、直近のdescLinesの最後を商品名とみなす
            const name = descLines.pop() ?? '商品名不明'
            products.push({ name, priceYen: price })
          }
        } else {
          // 商品名+価格が同一行（1件、または複数件が並ぶ場合もある）。
          // 例："レアチーズケーキ　341円"、"A　100円　B　200円" 等。
          // 各価格マッチの直前〜前の価格の終端までを商品名として切り出す
          // （文字列分割の先読み方式は数字の途中で誤分割する不具合があったため、
          // 位置ベースの単純な切り出しに変更した）。
          let cursor = 0
          for (const pm of priceMatches) {
            const name = normalizeSpaces(line.slice(cursor, pm.index).trim()) || '商品名不明'
            const price = Number(pm[1].replace(/,/g, ''))
            products.push({ name, priceYen: price })
            cursor = pm.index! + pm[0].length
          }
        }
      } else {
        descLines.push(line)
      }
    }

    items.push({
      vendorName: cur.name,
      products,
      description: descLines.join(' '),
      caveat: caveatLines.join(' '),
    })
  }

  // 本文中の注記（例：「※11日は＜西洋菓子 しろたえ＞出店のため休業」）が、他店舗名への
  // 言及として＜店舗名＞表記を含むことがあり、同名の空ブロックが誤って生成される
  // ことがある。同一店舗名のブロックはまとめる（価格・商品情報が実在するブロックの
  // データを失わないため、単純結合する）。
  const merged = new Map<string, MatsuyaSweetsItem>()
  for (const item of items) {
    const existing = merged.get(item.vendorName)
    if (!existing) {
      merged.set(item.vendorName, item)
      continue
    }
    existing.products.push(...item.products)
    existing.description = [existing.description, item.description].filter(Boolean).join(' ')
    existing.caveat = [existing.caveat, item.caveat].filter(Boolean).join(' ')
  }

  return { periodText, location, items: [...merged.values()] }
}
