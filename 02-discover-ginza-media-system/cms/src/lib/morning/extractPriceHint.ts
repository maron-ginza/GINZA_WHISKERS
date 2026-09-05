// GINZA WHISKERS / Project 02（2026-09-05、記事生成レディ最終候補ダイジェスト）
//
// 公式ページ本文（fetchOfficialSignals.bodyText）から、「料金」表示を
// **明記されたラベルの近傍にある場合だけ** 決定的に抽出する。
// 推測補完はしない——見つからなければ null（呼び出し側は「確認できません」と表示する）。
// ArticleFacts.paid（有料/無料の正式確定）はこれとは別物で、人間が admin で確定する
// 既存フローに一切影響しない（このファイルは表示用の best-effort ヒントに留める）。

export interface PriceHintResult {
  /** 見つかった料金表示（複数あれば「／」区切り、出現順・重複除去）。見つからなければ null */
  price: string | null
  /** 抽出方法（監査用） */
  method: string
}

const LABEL_WORDS = ['料金', '価格', '参加費', '入場料', 'チケット', '受講料']
// 全角/半角の数字・カンマを両方許容。3桁区切り（1,500 / １，５００）と区切りなし（1500）の両方にマッチ
const AMOUNT_RE = /([0-9０-９]{1,3}(?:[,，][0-9０-９]{3})+|[0-9０-９]{2,6})\s*円/g
// 「無料」は明示的な修飾語つきのときだけ採用（修飾語なしの単独「無料」は不採用）
const FREE_RE = /(入場|参加費|観覧|見学|参加|入館|鑑賞)\s*無料/

function findLabelEndPositions(text: string): number[] {
  const positions: number[] = []
  for (const w of LABEL_WORDS) {
    let idx = text.indexOf(w)
    while (idx !== -1) {
      positions.push(idx + w.length)
      idx = text.indexOf(w, idx + w.length)
    }
  }
  return positions.sort((a, b) => a - b)
}

/** 全角数字・全角カンマを半角化し、カンマを除去した数値を返す。数字以外が混じれば null（推測しない） */
function normalizeAmount(raw: string): number | null {
  const halfWidth = raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/，/g, ',')
  const digitsOnly = halfWidth.replace(/,/g, '')
  if (!/^[0-9]+$/.test(digitsOnly)) return null
  const n = Number(digitsOnly)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export function extractPriceHint(bodyText: string | null | undefined): PriceHintResult {
  if (!bodyText || !bodyText.trim()) return { price: null, method: 'no-body' }

  const hits: string[] = []
  for (const pos of findLabelEndPositions(bodyText)) {
    // ラベル直後 120 字以内・次の段落区切りより手前だけを探索範囲にする（無関係な後方の金額を拾わない）
    const windowEnd = Math.min(bodyText.length, pos + 120)
    const window = bodyText.slice(pos, windowEnd)
    const paraBreak = window.search(/\n\s*\n/)
    const scoped = paraBreak >= 0 ? window.slice(0, paraBreak) : window

    AMOUNT_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = AMOUNT_RE.exec(scoped)) && hits.length < 6) {
      const amount = normalizeAmount(m[1])
      if (amount == null) continue
      const yen = `${amount.toLocaleString('en-US')}円`
      if (!hits.includes(yen)) hits.push(yen)
    }
  }
  if (hits.length > 0) return { price: hits.join('／'), method: 'label近傍120字以内・複数可' }

  // 明示的な無料表記（金額ラベルが無くても「入場無料」等は明記情報として扱う）
  if (FREE_RE.test(bodyText)) return { price: '無料', method: 'label:明示的な無料表記（入場/参加費/観覧 等＋無料）' }

  return { price: null, method: 'not-found（推測補完しない）' }
}
