// GINZA WHISKERS / Project 02（2026-09-16続き7、マロン指示：A判定とArticleFactsの矛盾を解消）
//
// 6時処理で既に保存済みのDiscoveredContentの公式情報だけから、ArticleFactsを
// 決定論的に自動導出する（純粋関数・AI/DB/外部fetchなし）。人間の追加入力を
// 前提にしない——venueや催事詳細等、ArticleFactsが従来「人間が付与する」ことを
// 前提にしていた項目（eventTime/areaLead/audienceNote等）はDiscoveredContentに
// 対応する構造化フィールドが無いため、必須項目が最小の appliedTemplate='generic'
// （readyGate.ts：venues/eventTime/areaLead/audienceNote/paid を要求しない、
// 専用テンプレの無い種別向けフォールバック）に固定して導出する。
//
// 【推測しない】
//   ・contentTitle / whatHappens（contentSummary） ← DiscoveredContent.title
//     （サイトナビ由来の "|" 区切りを除去した先頭のみ。新しい文言は作らない・
//     既に確認済みの同じ文字列を2つのラベルへ再利用するだけ）
//   ・availablePeriod ← DiscoveredContent.eventStartAt/eventEndAt（構造化日付。
//     Stage 1 のA判定が現在性確認に使うのと同じデータ）
//   ・sourceProvenanceFacts ← 上記の開催・販売期間を1件、sourceType:'official'・
//     factType:'date'・verificationStatus:'confirmed' として記録（DC自体の
//     eventStartAt/eventEndAtは既にStage 1で「公式情報で確認済み」として扱って
//     いる値の再利用であり、新しい確認を主張しない）
//   ・hashtags ← 銀座関連性が既に確認済みであること（#銀座）と、Stage 2で確定済みの
//     18カテゴリー分類（あれば1件追加）——いずれも既存の確認済み判定の言い換えで
//     あり、イベント固有の新しい主張ではない
//   ・officialInfoNote ← 固定の定型文（GENERIC_OFFICIAL_INFO_NOTE、全候補共通・
//     イベント固有の情報を一切含まない）。空欄不可という readyGate.ts の制約を
//     満たすためのテンプレート文言であり、個別の事実の主張ではない
// 上記のいずれかが欠けている場合（タイトルが無い・公式URLが無い・開催/販売期間の
// 構造化日付が無い）は eligible:false とし、不足項目を列挙するのみで補完しない。

const GENERIC_OFFICIAL_INFO_NOTE = '詳細・最新情報は公式サイトでご確認ください。'

function cleanTitle(title: string | null | undefined): string {
  const t = (title ?? '').trim()
  if (!t) return ''
  const parts = t.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean)
  return parts.length >= 2 ? parts[0] : t
}

function toTokyoDateStringLocal(d: Date): string {
  // assessCandidate.ts と同じ表記規則（YYYY-MM-DD）に合わせる。タイムゾーン変換
  // 由来の1日ズレを避けるため UTC の年月日をそのまま使う（既存 toTokyoDateString
  // と同じ考え方。新規モジュール依存を増やさないためここに複製する）。
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export interface AutoArticleFactsInput {
  title: string | null
  articleUrl: string | null
  eventStartAt: string | null
  eventEndAt: string | null
  /** Stage 2 で確定済みの18カテゴリー（あれば hashtags に1件追加するだけ。無くても eligible は変わらない） */
  category?: string | null
  /**
   * 【2026-09-22追加】'field_material'（マロン現地収集資料）はarticleUrlを持たない
   * 設計のため、URLの有無だけでなくcollectionMethodも見て出典の有無を判定する
   * （DiscoveredContent側のbeforeValidateフックがsourceDocumentId/sourcePage/
   * sourceMaterialHash等を必須化済みのため、field_materialである時点で
   * 出典は確認済みとみなせる）。
   */
  collectionMethod?: string | null
}

export interface AutoArticleFactsResult {
  eligible: boolean
  /** eligible:true のときの ArticleFacts 書き込みペイロード（discoveredContent は呼び出し元が付与） */
  payload?: {
    templateType: 'generic'
    primaryCategory: string | null
    eventName: string
    whatHappens: string
    eventDate: string
    eventDateISO: string
    officialInfoNote: string
    hashtags: { tag: string }[]
    sourceProvenanceFacts: {
      fact: string
      sourceType: 'official'
      factType: 'date'
      verificationStatus: 'confirmed'
    }[]
    enrichmentStatus: 'ready'
  }
  /** eligible:false のときの不足項目（推測で埋めない） */
  missing: string[]
  /** 監査用：何から何を導出したか */
  derivedFrom: string[]
}

export function deriveAutoArticleFacts(input: AutoArticleFactsInput): AutoArticleFactsResult {
  const missing: string[] = []
  const derivedFrom: string[] = []

  const cleanedTitle = cleanTitle(input.title)
  if (!cleanedTitle) {
    missing.push('contentTitle/whatHappens（DiscoveredContent.titleが空）')
  } else {
    derivedFrom.push(`contentTitle/whatHappens ← DiscoveredContent.title（サイトナビ除去後）: "${cleanedTitle}"`)
  }

  // 【2026-09-22実装→2026-09-23revert・マロン指示】一時的に
  // collectionMethod='field_material'（現地収集資料）をURL必須の対象外とし、
  // Stage 0（人間レビューを経ない自動ready化）の対象に含めていたが、
  // AUTUMN GINZA 2026冊子の実運用検証で「冊子記載の個別日程（銀茶会10/25等）が
  // 発行組織自身の公式サイトでまだ確認できない（準備中／404）」ケースが見つかり、
  // 独立した裏どりの無いまま自動でA候補へ昇格してしまう実害を確認した。
  // 現地収集資料は sourceType=official・collectionMethod=field_material として
  // 引き続き正式な情報源だが、**個別の事実（特に日付）が現時点の公式情報で
  // 裏どりできるかはStage 0の機械的判定だけでは分からない**ため、Stage 0の
  // 自動ready化（人間レビューなしでのA昇格）対象からは除外し、常に人間が
  // 個別公式情報との照合を確認してready化する運用に戻す（hasTraceableSourceの
  // C回避〈assessCandidate.ts〉自体は妥当なため無変更＝候補として提示はされるが
  // B判定のまま人間確認待ちになる）。
  const hasUrl = !!input.articleUrl && /^https?:\/\/\S+$/.test(input.articleUrl)
  if (!hasUrl) {
    missing.push('sourceProvenanceFacts（公式URLが無いため出典事実を作れない。現地収集資料は人間が個別に裏どりの上readyにしてください）')
  }

  let availablePeriod: string | null = null
  let eventDateISO: string | null = null
  const start = input.eventStartAt ? new Date(input.eventStartAt) : null
  const end = input.eventEndAt ? new Date(input.eventEndAt) : null
  const startValid = start && !Number.isNaN(start.getTime())
  const endValid = end && !Number.isNaN(end.getTime())
  if (startValid && endValid) {
    // 2026-09-17修正：eventDateISO は readyGate.ts の過去/未来ゲート（isPastEventEnd）が
    // 「まだ有効か」を判定するために使う値のため、開始日ではなく**終了日**を優先する
    // （assessCandidate.ts のexpired判定＝endD基準と同じ考え方に揃えた）。
    eventDateISO = end!.toISOString()
    availablePeriod =
      end!.getTime() !== start!.getTime()
        ? `${toTokyoDateStringLocal(start!)} 〜 ${toTokyoDateStringLocal(end!)}`
        : toTokyoDateStringLocal(end!)
    derivedFrom.push(`availablePeriod ← DiscoveredContent.eventStartAt/eventEndAt: "${availablePeriod}" ／ eventDateISO ← 終了日優先`)
  } else if (endValid && !startValid) {
    eventDateISO = end!.toISOString()
    availablePeriod = toTokyoDateStringLocal(end!)
    derivedFrom.push(`availablePeriod ← DiscoveredContent.eventEndAt: "${availablePeriod}"（開始日は未確認） ／ eventDateISO ← 終了日`)
  } else if (startValid && !endValid) {
    // 2026-09-27修正（マロン指示：DC#1526実データ対応——終了日未確認を開始日で
    // 代用しない）。従来はここでも開始日をeventDateISOへ代用しており、開始日が
    // 過去であれば readyGate.ts の過去/未来ゲートが「会期・有効期間が過去」と
    // 誤判定していた（assessCandidate.ts で同種のバグを修正済みの、別モジュール
    // における再発）。終了日が本当に無い（発売日のみ・継続販売中）のか、単に
    // 未確認なのかをこの関数だけでは判別できないため、eventDateISOは設定せず
    // （過去/未来を機械判定しない）、availablePeriodには開始日と「終了日未確認」を
    // 明示する。missingへ積むことで、この候補はreadyGate.tsにより
    // eligible:false（要確認）のまま——人間が公式ページを確認し、
    // 継続販売中と確認できればsaleAvailability='ongoing_no_end_stated'等で
    // 明示的にready化する運用に委ねる（自動で承認しない）。
    availablePeriod = `${toTokyoDateStringLocal(start!)} 〜（終了日は公式記載で確認できず・要確認）`
    derivedFrom.push(`availablePeriod ← DiscoveredContent.eventStartAt: "${toTokyoDateStringLocal(start!)}"（終了日は未確認のため開始日を終了日の代用にしない）`)
    missing.push(
      'eventDateISO（開始日のみ確認済み・終了日は公式記載で確認できず、過去/未来を機械判定しない——人間が公式ページで要確認）',
    )
  } else {
    missing.push('availablePeriod（DiscoveredContent.eventStartAt/eventEndAtの構造化日付が未確認）')
  }

  if (missing.length > 0) {
    return { eligible: false, missing, derivedFrom }
  }

  const hashtags = [{ tag: '#銀座' }]
  if (input.category) hashtags.push({ tag: `#${input.category}` })
  derivedFrom.push('hashtags ← 銀座関連性確認済み（#銀座）＋Stage 2で確定済みの18カテゴリー分類')

  const sourceProvenanceFacts = [
    {
      fact: `開催・販売期間は ${availablePeriod}`,
      sourceType: 'official' as const,
      factType: 'date' as const,
      verificationStatus: 'confirmed' as const,
    },
  ]
  derivedFrom.push('sourceProvenanceFacts ← DiscoveredContent.eventStartAt/eventEndAt（Stage 1のA判定と同じ確認済みデータの再利用）')

  return {
    eligible: true,
    payload: {
      templateType: 'generic',
      primaryCategory: input.category ?? null,
      eventName: cleanedTitle,
      whatHappens: cleanedTitle,
      eventDate: availablePeriod!,
      eventDateISO: eventDateISO!,
      officialInfoNote: GENERIC_OFFICIAL_INFO_NOTE,
      hashtags,
      sourceProvenanceFacts,
      enrichmentStatus: 'ready',
    },
    missing: [],
    derivedFrom,
  }
}
