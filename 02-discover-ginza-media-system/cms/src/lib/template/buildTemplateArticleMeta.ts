import type { AppliedTemplate } from './readyGate'
import type { EventArticleFields } from './templates'

// GINZA WHISKERS / Project 02 改善 Stage 4（2026-09-02）。
//
// テンプレート経路で Article を保存する際に必要な seo / socialCopy を、
// EventArticleFields ＋ 生成済みブロックから **決定的に** 組み立てる。
// Claude API・他の生成AI は呼ばない。同じ入力からは必ず同じ出力。
//
// AI 経路（generateMultiAngleArticleDrafts）は seo・socialCopy も AI 出力だが、
// テンプレ経路は差し込みのみ——「入力にない事実を足さない」「AI 定型句を
// 使わない」方針で最小限にする。

export interface TemplateArticleMeta {
  seo: { metaTitle: string; metaDescription: string }
  socialCopy: { note: string; x: string; instagram: string }
}

/** 文字数上限で切り詰め（コードポイント単位・決定的） */
function clip(s: string, max: number): string {
  const arr = [...s]
  return arr.length <= max ? s : arr.slice(0, max - 1).join('') + '…'
}

/** noteBody のプレーンテキスト先頭を metaDescription 用に取り出す（ハッシュタグ行・空行を除去） */
function leadParagraph(noteBody: string): string {
  const first = noteBody
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('#'))
  return first ?? ''
}

/** 末尾の句点を 1 つに正規化 */
function tidyPunct(x: string): string {
  return x.replace(/。+/g, '。').replace(/。\s*$/u, '。')
}

export function buildTemplateArticleMeta(
  fields: EventArticleFields,
  rendered: { title: string; noteBody: string; hashtags: string[] },
  appliedTemplate?: AppliedTemplate,
): TemplateArticleMeta {
  const metaTitle = clip(rendered.title, 60)
  const metaDescription = clip(leadParagraph(rendered.noteBody), 120)

  const tagLine = rendered.hashtags.map((t) => t.trim()).filter(Boolean).join(' ')
  const isSale = appliedTemplate === 'sale'

  // note: 事実の短い要約 ＋ ハッシュタグ行（本文の読む理由は本文側にある）
  //   sale は「イベント名を三重に繰り返す」告知調にしない——販売期間 ＋ 価格の有無 だけを簡潔に。
  const noteCore = isSale
    ? tidyPunct(
        `${fields.eventName}、${fields.eventDate}。` +
          `${fields.priceText ? '価格・購入条件は本文にまとめています。' : '詳しくは本文で。'}`,
      )
    : tidyPunct(
        `${fields.eventName}${fields.editionLabel ? `（${fields.editionLabel}）` : ''}、${fields.eventDate}に開催。` +
          `${fields.applyDeadline ? `お申し込みは${fields.applyDeadline}まで。` : ''}` +
          `${fields.areaLead}`,
      )
  const noteCopy = clip(noteCore, 140) + (tagLine ? `\n${tagLine}` : '')

  // x: タイトル ＋ 開催日 ＋ ハッシュタグ1〜2（横展開・定型句を避ける）
  const xTags = rendered.hashtags.slice(0, 2).map((t) => t.trim()).filter(Boolean).join(' ')
  const xCopy = clip(`${rendered.title}（${fields.eventDate}）`, 120) + (xTags ? ` ${xTags}` : '')

  // instagram: 情景ではなく事実の一言（推測・詩的表現なし）
  const igCopy = clip(
    `${fields.season}の銀座で「${fields.eventName}」。${fields.whatHappens}`,
    120,
  )

  return {
    seo: { metaTitle, metaDescription },
    socialCopy: { note: noteCopy, x: xCopy, instagram: igCopy },
  }
}
