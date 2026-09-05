// GINZA WHISKERS / Project 02（2026-09-05、記事生成レディ最終候補ダイジェスト）
//
// 「マロンが1件選べば、そのまま記事生成へ進める品質」の一部として、決定的テンプレートで
// 編集ブリーフ（20代後半〜30代女性への適合理由・GINZA WHISKERS独自の切り口・タイトル案・
// 導入案・構成案・推奨記事量・無料/有料候補）を組み立てる。AI 呼び出しなし・純粋関数。
//
// ここで生成するタイトル案・導入案・構成案は「たたき台」であり、Editorial Style Engine
// （CLAUDE.md 第8章）が定める最終的な文体・構成規則を代替しない——マロンの編集判断が
// 常に最終工程であることを前提にした下ごしらえに留める。

import { computeTargetFitScore } from '../pipeline/targetFitScore'
import type { EditorialBrief } from './types'

export interface EditorialBriefInput {
  displayTitle: string
  venue: string | null
  /** "YYYY-MM-DD" もしくは "YYYY-MM-DD 〜 YYYY-MM-DD" もしくは "不明" */
  eventPeriod: string
  templateType?: string | null
  /** 18カテゴリー（暫定でも可） */
  category?: string | null
  contentType?: string | null
  uxType?: string | null
}

const ANGLE_BY_CATEGORY: Record<string, string> = {
  ART: '作品や作家性そのものの解説ではなく、「今週、この空間でこの時間を過ごす意味」を編集する視点',
  PHOTO: '写真集や作家紹介の要約にとどめず、「なぜ今、この一枚を銀座で見るのか」を編集する視点',
  FOOD: '味の紹介にとどめず、「忙しい平日にどう自分を労うか」という生活文脈から編集する視点',
  CAFE: '喫茶体験の紹介にとどめず、「一息つく時間をどう銀座で確保するか」を編集する視点',
  WELLNESS: '施術・メニューの紹介ではなく、「自分を整える時間をどう銀座で持つか」を編集する視点',
  BEAUTY: '新作紹介にとどめず、「銀座で自分に少し手をかける」体験として編集する視点',
  SHOPPING: '新作情報の羅列ではなく、「銀座でこの一着・一品を選ぶ意味」を編集する視点',
  MUSIC: '公演情報の告知にとどめず、「銀座の夜にどんな音を選ぶか」を編集する視点',
  WORKSHOP: '体験教室の案内にとどめず、「銀座で手を動かして得る発見」を編集する視点',
  ARCHITECTURE: '建築様式の解説にとどめず、「銀座の街を歩きながら気づく意匠」を編集する視点',
  EVENT: 'イベント告知にとどめず、「今週の銀座の空気」を体現する催しとして編集する視点',
  HOTEL: '宿泊プランの紹介にとどめず、「銀座で非日常を過ごす」体験として編集する視点',
  GIFT: '商品紹介にとどめず、「銀座で誰かを想って選ぶ」体験として編集する視点',
  FAMILY: '施設案内にとどめず、「銀座で家族と過ごす時間」として編集する視点',
  NIGHT: '営業時間の案内にとどめず、「銀座の夜だけの表情」を編集する視点',
}
const DEFAULT_ANGLE = '銀座の「今週性」を軸に、GINZA WHISKERS独自の視点で意味づけする編集の切り口'

const HOOK_SENTENCE_BY_CATEGORY: Record<string, string> = {
  ART: '足を止めて眺めるだけで、今週の気分が少し変わる',
  PHOTO: '一枚の写真が、今週の銀座を歩く理由になる',
  FOOD: '忙しい毎日の合間に、少し立ち止まる理由になる',
  CAFE: '一杯のために、少しだけ寄り道したくなる',
  WELLNESS: '整えるための時間を、今週の予定にひとつ足しておきたい',
  BEAUTY: '鏡の前の自分を、少しだけ機嫌よくしてくれる',
  SHOPPING: '今週だけの一点物として、選ぶ理由になる',
  MUSIC: '耳に残る一曲が、今週の銀座の記憶になる',
  WORKSHOP: '手を動かすことで、いつもと違う銀座の顔に出会える',
}
const DEFAULT_HOOK = '銀座の「今」を映す一つの手がかりになる'

interface StructureSpec {
  outline: string[]
}
const STRUCTURE_BY_TEMPLATE: Record<string, StructureSpec> = {
  exhibition: {
    outline: [
      'Hook（今週の銀座の空気）',
      'What/Where/When（会場・会期・時間）',
      'Why Now?（なぜ今か）',
      "Editor's Note（GINZA WHISKERS独自の視点）",
      'Source（出典・公式URL・確認日）',
      '結び（次の行動を1つだけ）',
    ],
  },
  sale: {
    outline: [
      'Hook（今週の銀座の空気）',
      '商品概要・対象（何が・いつから・どこで）',
      '購入条件・販売期間・価格',
      "Editor's Note（GINZA WHISKERS独自の視点）",
      'Source（出典・公式URL・確認日）',
      '結び（次の行動を1つだけ）',
    ],
  },
  workshop: {
    outline: [
      'Hook（今週の銀座の空気）',
      '体験内容・所要時間',
      '対象者・参加条件・予約要否',
      "Editor's Note（GINZA WHISKERS独自の視点）",
      'Source（出典・公式URL・確認日）',
      '結び（次の行動を1つだけ）',
    ],
  },
  application: {
    outline: [
      'Hook（今週の銀座の空気）',
      '募集内容・応募条件',
      '応募締切・結果発表',
      "Editor's Note（GINZA WHISKERS独自の視点）",
      'Source（出典・公式URL・確認日）',
      '結び（次の行動を1つだけ）',
    ],
  },
  recurring_event: {
    outline: [
      'Hook（今週の銀座の空気）',
      '開催概要・頻度',
      '参加方法・当日の流れ',
      "Editor's Note（GINZA WHISKERS独自の視点）",
      'Source（出典・公式URL・確認日）',
      '結び（次の行動を1つだけ）',
    ],
  },
}
const DEFAULT_STRUCTURE = STRUCTURE_BY_TEMPLATE.exhibition

const LENGTH_BY_TEMPLATE: Record<string, EditorialBrief['recommendedLength']> = {
  sale: { tier: 'short', charRange: '600〜800字', reason: '商品ニュースは対象・価格・販売期間の要点を簡潔に伝えれば十分' },
  exhibition: { tier: 'medium', charRange: '800〜1000字', reason: '展覧会紹介は概要とWhy Now?・Editor\'s Noteに一定の厚みが必要' },
  workshop: { tier: 'long', charRange: '1000〜1300字', reason: '体験価値を伝えるには文脈説明・参加条件の記載が必要' },
  application: { tier: 'medium', charRange: '800〜1000字', reason: '応募条件・締切を正確に伝える必要がある' },
  recurring_event: { tier: 'medium', charRange: '800〜1000字', reason: '継続開催の背景を含め一定の厚みが必要' },
}
const DEFAULT_LENGTH = LENGTH_BY_TEMPLATE.exhibition

/** 収益化②（有料候補）を検討する余地があるとみなすカテゴリー（Editorial Compass「自分を整える」寄り） */
const PAID_LEAN_CATEGORIES = new Set(['WELLNESS', 'BEAUTY'])

export function buildEditorialBrief(input: EditorialBriefInput): EditorialBrief {
  const category = (input.category ?? '').trim().toUpperCase() || null
  const venueLabel = (input.venue ?? '').trim() || '銀座'
  const periodLabel = input.eventPeriod && input.eventPeriod !== '不明' ? input.eventPeriod : '会期は公式情報で要確認'
  const templateKey = (input.templateType ?? '').trim().toLowerCase()

  const tf = computeTargetFitScore({
    title: input.displayTitle,
    venue: input.venue,
    categoryKey: category,
    contentType: input.contentType,
    uxType: input.uxType,
    templateType: input.templateType,
  })

  const angle = (category && ANGLE_BY_CATEGORY[category]) || DEFAULT_ANGLE
  const hookSentence = (category && HOOK_SENTENCE_BY_CATEGORY[category]) || DEFAULT_HOOK

  const titleCandidates = [
    `${input.displayTitle}——${venueLabel}で見つける、今週の銀座`,
    `${venueLabel}発、「${input.displayTitle}」は${periodLabel}まで`,
    `今週の銀座を彩る一件：${input.displayTitle}`,
  ]

  const introDraft =
    `${input.displayTitle}が、${venueLabel}で行われている（${periodLabel}）。` +
    `${hookSentence}。今週の銀座を歩くなら、押さえておきたい一件だ。`

  const structureOutline = (STRUCTURE_BY_TEMPLATE[templateKey] ?? DEFAULT_STRUCTURE).outline
  const recommendedLength = LENGTH_BY_TEMPLATE[templateKey] ?? DEFAULT_LENGTH

  const paidLean =
    (category != null && PAID_LEAN_CATEGORIES.has(category)) ||
    templateKey === 'workshop' ||
    tf.compass.totonoeru >= 0.72
  const payFreeCandidate: EditorialBrief['payFreeCandidate'] = paidLean
    ? {
        type: 'paid_candidate',
        reason:
          `「自分を整える」体験価値が高い（totonoeru=${tf.compass.totonoeru.toFixed(2)}）ため、` +
          '収益化②（有料候補）としての検討余地あり。有料化の最終判断はマロン。',
      }
    : {
        type: 'free',
        reason: '認知拡大・信頼形成が主目的の無料枠が基本。個別の体験設計要素としての有料価値は現時点で弱い。',
      }

  return {
    targetFitScore: tf.score,
    targetFitReason: tf.reason,
    ginzaWhiskersAngle: angle,
    titleCandidates,
    introDraft,
    structureOutline,
    recommendedLength,
    payFreeCandidate,
  }
}
