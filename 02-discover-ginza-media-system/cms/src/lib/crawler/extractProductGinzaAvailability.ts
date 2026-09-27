// GINZA WHISKERS / Project 02（2026-09-27新設、マロン指示）
//
// 【背景】DiscoveredContent.venue（会場）は既存方針（extractStructuredDates.ts
// 参照）でJSON-LDのみを対象とし、本文の自由テキストからは一切推測しない。この
// 方針自体は変更しない。一方、スイーツ商品ページの実データ（パティスリー GIN NO
// MORI・Mr. CHEESECAKE）では、対象商品を「どの店舗で買えるか」という取扱店舗の
// 一覧が本文に明記されており、その中に「銀座」が含まれるかどうかは、ページ内の
// 無関係な「銀座」の文字（ナビゲーション・パンくず等）とは異なり、対象商品と
// 銀座の購入場所が直接対応する強い根拠になる。
//
// 本モジュールは、この「対象商品の取扱店舗一覧に銀座が含まれるか」だけを、
// venueとは別の新規フィールド（productGinzaAvailability）として、根拠テキスト
// 付きで構造化抽出する。既存のvenue・日付抽出ロジックには一切手を入れない。
//
// 【安全策（推測しない原則の徹底）】
//   1. 「販売店舗」「取扱店舗」等、店舗一覧を示す明示的なラベルの直後（150字
//      以内）だけを対象にする——ページ全体から「銀座」を検索すると、ナビ
//      ゲーション・パンくず・別商品の記述等、無関係な「銀座」まで拾ってしまう。
//   2. 「銀座」は区切り文字（/、,，・空白（）等）で区切られた1トークンとして
//      一致する場合のみ採用する——長い無関係な語の中に偶然「銀座」が部分
//      文字列として含まれるケースを避ける。
//   3. 一致した「銀座」の近傍（前後15字）に否定表現（対象外／除く／取り扱って
//      おりません／ございません等）があれば、明記があっても採用しない
//      （「銀座店は対象外です」等を誤って「銀座で買える」と確定しない）。
//   4. 該当ラベルが本文に見つからない、または銀座が一覧に含まれない場合は
//      available=false ではなく null（「確認できない」）を返す——「銀座では
//      買えないと確認した」わけではなく「本文からは確認できなかった」だけの
//      違いを保持する（他の推測しない原則と同じ区別）。

export interface ProductGinzaAvailabilityResult {
  /** true=取扱店舗一覧に銀座を確認 / null=本文から確認できない（false扱いにはしない） */
  available: true | null
  /** 一致したラベル（「販売店舗」等） */
  label: string | null
  /** 抽出元（現状はbody_labelのみ） */
  source: 'body_label' | null
  confidence: 'medium' | null
  /** 根拠となった本文の生テキスト片 */
  rawMatch: string | null
  // Payload's json field type requires an index signature to accept
  // an arbitrary object shape on write（processDiscoveredLinks.tsの
  // DateExtractionMetaと同じ理由）。
  [key: string]: unknown
}

function emptyResult(): ProductGinzaAvailabilityResult {
  return { available: null, label: null, source: null, confidence: null, rawMatch: null }
}

// 対象商品の取扱・販売店舗一覧を示すことが多いラベル（実データ：GIN NO MORI
// 「販売店舗：」、Mr. CHEESECAKEの文中「常設ストア5店舗（...）」相当の表現）。
const STORE_LIST_LABELS = ['販売店舗', '取扱店舗', '取扱店', 'お取り扱い店舗', '販売箇所', '常設ストア', '店舗一覧', '取り扱い店舗']

const STORE_LIST_WINDOW_CHARS = 150

// 「銀座」を区切り文字で区切られた1トークンとして検出する（前後は文字列端・
// 区切り文字・空白のいずれか）。「店」が付く場合（銀座店）も許容する。
const GINZA_TOKEN_RE = /(?:^|[/、,，・\s（(])銀座(?:店)?(?=$|[/、,，・\s）)]|$)/

// 「銀座」一致箇所の前後15字以内にこの否定表現があれば、明記があっても採用
// しない（「銀座店は対象外です」等を誤って確定しない）。
const NEGATION_NEAR_RE = /(対象外|除く|除きます|取り扱っておりません|お取り扱いしておりません|ございません|終了しました|対象となりません)/
const NEGATION_PROXIMITY_CHARS = 15

function stripTagsForBodySearch(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
}

function findAllIndices(text: string, label: string): number[] {
  const idxs: number[] = []
  let from = 0
  for (;;) {
    const idx = text.indexOf(label, from)
    if (idx === -1) break
    idxs.push(idx)
    from = idx + label.length
  }
  return idxs
}

/**
 * HTML本文から「対象商品の取扱店舗一覧に銀座が含まれるか」を抽出する。
 * venue（会場）フィールドとは独立——この結果はvenueを上書き・代替しない。
 */
export function extractProductGinzaAvailability(html: string): ProductGinzaAvailabilityResult {
  const bodyText = stripTagsForBodySearch(html)

  for (const label of STORE_LIST_LABELS) {
    const idxs = findAllIndices(bodyText, label)
    for (const idx of idxs) {
      const window = bodyText.slice(idx, idx + label.length + STORE_LIST_WINDOW_CHARS)
      const m = GINZA_TOKEN_RE.exec(window)
      if (!m) continue

      const matchStart = m.index
      const matchEnd = matchStart + m[0].length
      const near = window.slice(Math.max(0, matchStart - NEGATION_PROXIMITY_CHARS), matchEnd + NEGATION_PROXIMITY_CHARS)
      if (NEGATION_NEAR_RE.test(near)) continue // 否定表現が近傍にあれば採用しない（推測しない）

      return { available: true, label, source: 'body_label', confidence: 'medium', rawMatch: window.trim() }
    }
  }

  return emptyResult()
}
