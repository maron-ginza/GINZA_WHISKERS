// GINZA WHISKERS / Project 02 P0 改善（2026-09-02 続き3）— ArticleFacts への冪等な自動登録。
//
// 【役割】`./p2 morning` の中で、公式ページ等から**決定的に取得できた事実だけ**を
// ArticleFacts サイドカーへ `enrichmentStatus:'draft'` で冪等に登録／更新する。
// 7:10〜8:00 に人間が admin で残りの必須項目を入力し `ready` 化する下地をつくる。
//
// 【厳守】
//   ・書くのは **draft のみ**。`ready` への遷移はこの関数から絶対に行わない
//     （ArticleFacts.beforeChange が `req.user` を要求＝Local API では物理的に不可）。
//     ready 化は「事実確認条件」を人間が admin で満たして行う＝記事公開承認とは分離。
//   ・**推測補完しない**。DiscoveredContent / 公式ページから根拠つきで取れた値だけ書く。
//     取れない項目は空欄のまま（人間が admin で入力）。
//   ・DiscoveredContent と 1 対 1（unique index）。同一 DC の ArticleFacts を重複作成しない。
//   ・同じ内容の再実行では **何も変更しない**（unchanged）。取得情報が新しくなった
//     （candidate の verifiedAt が前回登録より新しい）ときだけ更新する。
//   ・既存が `ready` / `withdrawn`（人間が確定させた行）は**一切触らない**。
//   ・Article / note 下書きを生成しない。公開処理へ接続しない。
//   ・更新前後の差分と根拠を監査ログへ返す（呼び出し側が .devlogs へ書く）。

import type { TemplateType } from '../template/readyGate'
import { mapSaleFactsToDraft } from './mapSaleFactsToDraft'
import type { ArticleFactsCandidate, ProductNewsFactsCandidate } from './types'

/** ArticleFacts への I/O を抽象化（本番は payload、テストは in-memory モック） */
export interface ArticleFactsStore {
  /** discoveredContent === dcId の行を1件返す（無ければ null） */
  findByDc(dcId: number): Promise<ArticleFactsRow | null>
  /** draft 行を新規作成し、作成後の行を返す */
  create(data: ArticleFactsWrite): Promise<ArticleFactsRow>
  /** 既存行へ部分更新をかけ、更新後の行を返す */
  update(id: number, data: Partial<ArticleFactsWrite>): Promise<ArticleFactsRow>
}

export interface ArticleFactsProvenanceFact {
  fact: string
  sourceType: 'primary' | 'official' | 'secondary'
  factType: 'date' | 'venue' | 'price' | 'reservation' | 'hours' | 'access' | 'other'
  verificationStatus: 'confirmed' | 'unconfirmed' | 'conflicting'
}

export interface ArticleFactsVenue {
  name: string
  place: string
}

export interface ArticleFactsRow {
  id: number
  discoveredContent: number | { id: number }
  enrichmentStatus: 'draft' | 'ready' | 'withdrawn' | string
  eventDateISO?: string | null
  sourceProvenanceFacts?: ArticleFactsProvenanceFact[] | null
  notes?: string | null
  // 2026-09-03（改善対象2 ＋ item3）: 決定的抽出で自動入力する記事フィールド。
  eventName?: string | null
  eventDate?: string | null
  eventTime?: string | null
  venues?: ArticleFactsVenue[] | null
  paid?: 'paid' | 'free' | 'unknown' | string | null
  applyRequired?: 'yes' | 'no' | string | null
  whatHappens?: string | null
  officialInfoNote?: string | null
  // 2026-09-03（共通 Article Facts）
  primaryCategory?: string | null
  templateType?: TemplateType | string | null
  priceText?: string | null
  // 2026-09-07（根本改善）：販売終了日の記載状況（sale 用）。confirmed のときだけ入る。
  saleAvailability?: 'unknown' | 'ongoing_no_end_stated' | 'has_end_date' | string | null
  // 2026-09-03（共通 sale mapper）：areaLead / audienceNote / hashtags は
  // sale 経路で「事実ではない決定的生成の候補」として自動補完しうる（空欄補完の判定に使う）。
  areaLead?: string | null
  audienceNote?: string | null
  hashtags?: { tag: string }[] | null
  // 「機械のみの draft か」の判定に使う（sale mapper 再適用で自分の過去出力を上書きしてよいか）
  humanReviewedAt?: string | null
  humanReviewedBy?: number | { id: number } | null
}

export interface ArticleFactsWrite {
  discoveredContent: number
  enrichmentStatus: 'draft'
  eventDateISO?: string | null
  sourceProvenanceFacts?: ArticleFactsProvenanceFact[]
  notes?: string
  // 2026-09-03: **confirmed な決定的抽出値のみ**を書く。
  // 新規作成時のみ。更新時は「対象フィールドが空のときだけ」埋める（人間入力を上書きしない）。
  eventName?: string | null
  eventDate?: string | null
  eventTime?: string | null
  venues?: ArticleFactsVenue[]
  paid?: 'free'
  applyRequired?: 'no'
  whatHappens?: string | null
  officialInfoNote?: string | null
  // 2026-09-03（共通 Article Facts / 記事種別非依存化）：
  // 18カテゴリーごとに DB スキーマを分けず、共通構造の上で人間判断（分類）を保持する。
  // ※ 実 DB 反映には `ArticleFacts.ts` コレクションへの列追加（+migration）が必要（未実施・下記ドキュメント参照）。
  primaryCategory?: string | null // 既存18カテゴリー（BEAUTY / ART / …）
  templateType?: TemplateType | null // exhibition / sale / application / workshop / recurring_event / generic / unknown
  priceText?: string | null // 価格の表示文字列（sale 用。paid 列とは別）
  // 2026-09-07（根本改善）：販売終了日の記載状況（sale 用。confirmed のときだけ書く）
  saleAvailability?: 'unknown' | 'ongoing_no_end_stated' | 'has_end_date'
  // 共通 sale mapper の候補（事実ではない・決定的生成。ready 化前に人間が確認）
  areaLead?: string | null
  audienceNote?: string | null
  hashtags?: { tag: string }[]
}

export type RegisterAction =
  | 'would_create'
  | 'would_update'
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'skipped'

export interface RegisterDiffEntry {
  field: string
  before: unknown
  after: unknown
}

export interface RegisterResult {
  discoveredContentId: number
  action: RegisterAction
  /** skipped の理由 */
  reason?: string
  /** 常に 'draft'（この関数は ready を書かない） */
  targetStatus: 'draft'
  diff: RegisterDiffEntry[]
  articleFactsId?: number
  /** 何件の根拠つき事実を登録予定/登録したか */
  provenanceCount: number
  auditEntry: {
    at: string
    discoveredContentId: number
    action: RegisterAction
    reason?: string
    verifiedAt: string | null
    provenanceCount: number
    diff: RegisterDiffEntry[]
    dryRun: boolean
  }
}

export interface RegisterOptions {
  dryRun?: boolean
  now?: Date
}

/** candidate の「processingError なし・C ではない・出典が信頼済み」等を assessment から渡す */
export interface RegisterGateInput {
  verdict: 'A' | 'B' | 'C'
  verdictReasons: string[]
  expired: boolean
  duplicate: boolean
  /**
   * 記事タイプ（後方互換）。`templateType` があればそちらを優先。
   * event→（templateType 未指定なら）exhibition 系、product_news→sale、unknown→unknown。
   */
  factKind?: 'event' | 'product_news' | 'unknown'
  /**
   * 記事テンプレート種別（共通 Article Facts 化・2026-09-03）。
   * **どの種別でも draft 作成は可能**（unknown 含む）。ready 化・記事生成の可否は
   * evaluateReadyGate（readyGate.ts）が種別ごとに判定する。
   */
  templateType?: TemplateType
  /** マロンが確定した Primary Category（18カテゴリー。draft に保持） */
  primaryCategory?: string | null
  /** sale 用：product_news 抽出（あれば confirmed な販売事実を共通フィールドへ写す） */
  productExtraction?: ProductNewsFactsCandidate | null
  /**
   * sale の「機械のみ draft」に対して、sale mapper 管理下フィールド
   * （eventName / eventDate / eventTime / venues / priceText / whatHappens / officialInfoNote /
   *  areaLead / audienceNote / hashtags）を **最新の mapper 出力で上書き**してよいか。
   * 既定 false（`./p2 morning` の日次実行は「空欄補完のみ」で安全側）。
   * true でも、①templateType==='sale' ②enrichmentStatus==='draft' ③人間レビュー履歴なし
   * ④人間追加の provenance / 人間編集の痕跡なし のときだけ上書きする。値が同じなら no-op（冪等）。
   */
  refreshManagedFields?: boolean
}

function resolveTemplateType(gate: RegisterGateInput): TemplateType {
  if (gate.templateType) return gate.templateType
  if (gate.factKind === 'product_news') return 'sale'
  if (gate.factKind === 'unknown') return 'unknown'
  return 'exhibition' // 後方互換：factKind=event → exhibition 系（旧テストの期待に一致）
}

const AUTO_MARK = '[auto:morning]'
const LAST_VERIFIED_RE = /\[auto:lastVerifiedAt=([^\]]+)\]/

function factsFromCandidate(c: ArticleFactsCandidate): ArticleFactsProvenanceFact[] {
  const out: ArticleFactsProvenanceFact[] = []
  const f = c.fields
  const mk = (
    fact: string,
    factType: ArticleFactsProvenanceFact['factType'],
  ): ArticleFactsProvenanceFact => ({
    fact: `${AUTO_MARK} ${fact}`,
    sourceType: 'official',
    factType,
    verificationStatus: 'confirmed',
  })
  if (f.venue) out.push(mk(`会場: ${f.venue}`, 'venue'))
  if (f.eventStartAt) out.push(mk(`開催開始: ${f.eventStartAt}`, 'date'))
  if (f.eventEndAt) out.push(mk(`開催終了: ${f.eventEndAt}`, 'date'))
  if (f.publishedAt) out.push(mk(`公開日: ${f.publishedAt}`, 'date'))
  return out
}

function machineNotes(c: ArticleFactsCandidate, now: string): string {
  const f = c.fields
  return [
    `${AUTO_MARK} ./p2 morning による自動登録（draft）。人間が admin で残りの必須項目`,
    `（whatHappens / eventTime / areaLead / audienceNote / officialInfoNote / paid / venues / hashtags 等）を`,
    `入力し ready 化してください。ready 化は事実確認条件のみで行い、記事公開承認とは分離します。`,
    `出典: ${f.sourceName ?? '—'} / ${f.sourceUrl ?? '—'}`,
    `確認日時(verifiedAt): ${f.verifiedAt ?? '—'} / capturedAt: ${c.provenance.verifiedAt?.capturedAt ?? '—'}`,
    `未取得（推測補完しない）: 申込期限・料金・定員・所要時間・対象者・本文テキスト系`,
    c.conflicts.length ? `相互矛盾: ${c.conflicts.join(' / ')}` : `相互矛盾: なし`,
    `[auto:lastVerifiedAt=${f.verifiedAt ?? ''}]`,
    `[auto:registeredAt=${now}]`,
  ].join('\n')
}

function normFacts(list: ArticleFactsProvenanceFact[] | null | undefined): string[] {
  return (Array.isArray(list) ? list : []).map((x) => x.fact).sort()
}

/**
 * candidate.extractedEventFacts のうち **confirmed のものだけ** を ArticleFacts の
 * 記事フィールドへ写す（推測補完しない・unconfirmed は書かない）。
 * paid は 'free' のみ、applyRequired は 'no' のみ自動許可（有料・要申込は人間が確定）。
 */
/**
 * 記事フィールドの自動書き込み型。event 経路は eventName…officialInfoNote まで。
 * sale 経路は加えて priceText（confirmed 事実）と areaLead / audienceNote / hashtags
 * （事実ではない決定的生成の draft 候補）を返す。
 */
export interface AutoFieldWrites {
  eventName?: string
  eventDate?: string
  eventTime?: string
  venues?: ArticleFactsVenue[]
  paid?: 'free'
  applyRequired?: 'no'
  whatHappens?: string
  officialInfoNote?: string
  priceText?: string
  saleAvailability?: 'unknown' | 'ongoing_no_end_stated' | 'has_end_date'
  areaLead?: string
  audienceNote?: string
  hashtags?: { tag: string }[]
}

function confirmedEventFieldWrites(c: ArticleFactsCandidate): AutoFieldWrites {
  const eef = c.extractedEventFacts
  const out: AutoFieldWrites = {}
  if (!eef) return out
  if (eef.eventName.value && eef.eventName.confirmationStatus === 'confirmed') out.eventName = eef.eventName.value
  if (eef.eventDate.value && eef.eventDate.confirmationStatus === 'confirmed') out.eventDate = eef.eventDate.value
  if (eef.eventTime.value && eef.eventTime.confirmationStatus === 'confirmed') out.eventTime = eef.eventTime.value
  if (eef.venuePlace.value && eef.venuePlace.confirmationStatus === 'confirmed') {
    const name = (eef.eventName.value && eef.eventName.confirmationStatus === 'confirmed'
      ? eef.eventName.value
      : eef.eventName.value) ?? '会場'
    out.venues = [{ name, place: eef.venuePlace.value }]
  }
  if (eef.paid.value === 'free' && eef.paid.confirmationStatus === 'confirmed') out.paid = 'free'
  // applyRequired は confirmed 'no' のみ（アダプタは confirmed 'no' を返さない設計＝現状は書かない）
  if (eef.applyRequired.value === 'no' && eef.applyRequired.confirmationStatus === 'confirmed')
    out.applyRequired = 'no'
  // item3: 公式本文に明記された概要・注意事項のみ（confirmed）。ハッシュタグは候補どまり（書かない）。
  if (eef.whatHappens.value && eef.whatHappens.confirmationStatus === 'confirmed') out.whatHappens = eef.whatHappens.value
  if (eef.officialInfoNote.value && eef.officialInfoNote.confirmationStatus === 'confirmed')
    out.officialInfoNote = eef.officialInfoNote.value
  return out
}

/** sale 経路で自動補完した「候補（事実でない）」フィールドのキー */
const SALE_CANDIDATE_KEYS = ['areaLead', 'audienceNote', 'hashtags'] as const

/**
 * sale（product_news）用：共通 sale mapper（mapSaleFactsToDraft）に委譲する。
 *   ・facts（confirmed 事実）＝ eventName / eventDate(販売期間) / eventDateISO /
 *     eventTime / venues / priceText / whatHappens / officialInfoNote。
 *     confirmed のもの・完売WS語を含まないものだけ。paid（入場無料）は書かない。
 *   ・candidates（事実でない決定的生成）＝ areaLead / audienceNote / hashtags。
 *     取得済み事実と Primary Category から追加 API なしで生成。ready 化前に人間が確認。
 *   ・#331 専用の値直書きはしない（今後の sale 記事すべてで共通）。
 */
function confirmedSaleFieldWrites(
  product: ProductNewsFactsCandidate | null,
  base: ArticleFactsCandidate,
  primaryCategory: string | null,
  now: Date,
): { writes: AutoFieldWrites; provenanceAdds: ArticleFactsProvenanceFact[]; internalMemo: string[] } {
  const m = mapSaleFactsToDraft({ base, product, primaryCategory, now })
  const out: AutoFieldWrites = {}
  // facts（confirmed のみ）— mapper が factsAllConfirmed=false を返したら fact は一切採らない
  if (m.factsAllConfirmed) {
    if (m.facts.eventName) out.eventName = m.facts.eventName
    if (m.facts.eventDate) out.eventDate = m.facts.eventDate
    if (m.facts.eventTime) out.eventTime = m.facts.eventTime
    if (m.facts.venues && m.facts.venues.length) out.venues = m.facts.venues
    if (m.facts.priceText) out.priceText = m.facts.priceText
    if (m.facts.whatHappens) out.whatHappens = m.facts.whatHappens
    if (m.facts.officialInfoNote) out.officialInfoNote = m.facts.officialInfoNote
    if (m.facts.saleAvailability) out.saleAvailability = m.facts.saleAvailability
  }
  // candidates（決定的生成・事実ではない）
  if (m.candidates.areaLead) out.areaLead = m.candidates.areaLead
  if (m.candidates.audienceNote) out.audienceNote = m.candidates.audienceNote
  if (m.candidates.hashtags && m.candidates.hashtags.length) out.hashtags = m.candidates.hashtags
  return {
    writes: out,
    provenanceAdds: m.factsAllConfirmed ? (m.provenanceAdds as ArticleFactsProvenanceFact[]) : [],
    internalMemo: m.internalMemo,
  }
}

export async function createOrUpdateArticleFactsFromCandidate(
  store: ArticleFactsStore,
  candidate: ArticleFactsCandidate,
  gate: RegisterGateInput,
  opts: RegisterOptions = {},
): Promise<RegisterResult> {
  const dryRun = opts.dryRun ?? true
  const now = (opts.now ?? new Date()).toISOString()
  const dcId = candidate.discoveredContentId
  const f = candidate.fields
  const base = (action: RegisterAction, extra: Partial<RegisterResult> = {}): RegisterResult => {
    const provenanceCount = extra.provenanceCount ?? 0
    return {
      discoveredContentId: dcId,
      action,
      targetStatus: 'draft',
      diff: extra.diff ?? [],
      reason: extra.reason,
      articleFactsId: extra.articleFactsId,
      provenanceCount,
      auditEntry: {
        at: now,
        discoveredContentId: dcId,
        action,
        reason: extra.reason,
        verifiedAt: f.verifiedAt ?? null,
        provenanceCount,
        diff: extra.diff ?? [],
        dryRun,
      },
    }
  }

  // --- 登録ゲート（満たさなければ書かない） ---
  // 【共通 Article Facts 化・2026-09-03】記事テンプレート種別に関わらず draft の作成は可能。
  //   unknown でも draft は作れる（＝標準経路は停止しない）。ready 化・記事生成の可否は
  //   evaluateReadyGate が種別ごとに判定する（unknown は ready 不可）。
  //   ここで skip するのは「そもそも draft に値しない」場合だけ（C / 終了 / 重複 / 出典追跡不可）。
  const templateType = resolveTemplateType(gate)
  if (gate.verdict === 'C')
    return base('skipped', { reason: `reject 相当（C判定: ${gate.verdictReasons.join(' / ') || '根拠不足・期限切れ・重複'}）` })
  if (gate.expired) return base('skipped', { reason: '開催終了済み' })
  if (gate.duplicate) return base('skipped', { reason: '既投稿と重複' })
  if (!candidate.readyCheck.trustedSource)
    return base('skipped', { reason: '出典が SOURCE LEDGER の公式/信頼済みドメインと確認できていない' })
  if (!f.sourceUrl) return base('skipped', { reason: 'sourceUrl なし' })
  if (!f.sourceName) return base('skipped', { reason: 'sourceName なし' })
  if (!f.verifiedAt) return base('skipped', { reason: 'verifiedAt（確認日時）なし' })
  if (!candidate.provenance || Object.keys(candidate.provenance).length === 0)
    return base('skipped', { reason: '根拠を追跡できる事実が 0 件' })

  const desiredEventDateIso = f.eventStartAt ?? null
  const baseNotes = machineNotes(candidate, now)
  // sale mapper が「事実でない候補（areaLead / audienceNote / hashtags）」を補完する場合の注記
  const saleCandidateMarker = (fills: string[]): string =>
    templateType === 'sale' && fills.some((k) => (SALE_CANDIDATE_KEYS as readonly string[]).includes(k))
      ? `\n[auto:sale-mapper ${now.slice(0, 10)}] 候補自動補完（事実ではない・ready 化前にマロンが確認・修正すること）: ` +
        fills.filter((k) => (SALE_CANDIDATE_KEYS as readonly string[]).includes(k)).join(', ')
      : ''
  // confirmed な決定的抽出値のみ（推測補完なし・関連記事由来は除外済み）。
  //   event 系 → extractedEventFacts、sale → 共通 sale mapper（mapSaleFactsToDraft）、から共通フィールドへ写す。
  const nowDate = opts.now ?? new Date()
  const saleResult =
    templateType === 'sale'
      ? confirmedSaleFieldWrites(gate.productExtraction ?? null, candidate, gate.primaryCategory ?? null, nowDate)
      : null
  const eventFieldWrites: AutoFieldWrites = saleResult ? saleResult.writes : confirmedEventFieldWrites(candidate)
  const saleProvenanceAdds: ArticleFactsProvenanceFact[] = saleResult?.provenanceAdds ?? []
  const saleInternalMemo: string[] = saleResult?.internalMemo ?? []
  // machine 由来の出典事実 ＋ sale mapper が返した追加事実（原典タイトル・開催時間 等）。fact 文字列で dedup。
  const desiredFacts = ((): ArticleFactsProvenanceFact[] => {
    const machine = factsFromCandidate(candidate)
    const seen = new Set(machine.map((x) => x.fact))
    return [...machine, ...saleProvenanceAdds.filter((x) => !seen.has(x.fact))]
  })()
  // sale mapper の内部メモ（表記ゆれ記録 等）を notes へ 1 度だけ追記
  const memoBlock = saleInternalMemo.length ? '\n' + saleInternalMemo.join('\n') : ''
  // 人間確定の分類（推測ではない）を draft に保持
  const classificationWrites: { primaryCategory?: string; templateType?: TemplateType } = {}
  if (gate.primaryCategory && gate.primaryCategory.trim()) classificationWrites.primaryCategory = gate.primaryCategory.trim()
  if (gate.templateType) classificationWrites.templateType = gate.templateType
  Object.assign(eventFieldWrites as Record<string, unknown>, classificationWrites)
  const efKeys = Object.keys(eventFieldWrites) as (keyof typeof eventFieldWrites)[]

  const existing = await store.findByDc(dcId)

  // --- 新規作成 ---
  if (!existing) {
    const diff: RegisterDiffEntry[] = [
      { field: 'enrichmentStatus', before: '(なし)', after: 'draft' },
      { field: 'eventDateISO', before: '(なし)', after: desiredEventDateIso },
      { field: 'sourceProvenanceFacts', before: '(なし)', after: `${desiredFacts.length} 件（[auto:morning] タグ付き）` },
      { field: 'notes', before: '(なし)', after: '(自動生成メモ)' },
    ]
    for (const k of efKeys) {
      const after =
        k === 'venues'
          ? `${(eventFieldWrites.venues ?? []).length} 件（confirmed）`
          : k === 'hashtags'
            ? (eventFieldWrites.hashtags ?? []).map((h) => h.tag).join(' ')
            : String(eventFieldWrites[k])
      diff.push({ field: k, before: '(なし)', after })
    }
    const createMarker = saleCandidateMarker(efKeys as string[])
    if (createMarker)
      diff.push({ field: 'notes[auto:sale-mapper]', before: '(なし)', after: '候補自動補完の注記を追加' })
    if (saleInternalMemo.length)
      diff.push({ field: 'notes[auto:sale-mapper memo]', before: '(なし)', after: saleInternalMemo.map((m) => m.slice(0, 40)).join(' / ') })
    if (dryRun) return base('would_create', { diff, provenanceCount: desiredFacts.length })
    const created = await store.create({
      discoveredContent: dcId,
      enrichmentStatus: 'draft',
      eventDateISO: desiredEventDateIso,
      sourceProvenanceFacts: desiredFacts,
      notes: baseNotes + createMarker + memoBlock,
      ...eventFieldWrites,
    })
    return base('created', { diff, articleFactsId: created.id, provenanceCount: desiredFacts.length })
  }

  // --- 既存あり ---
  if (existing.enrichmentStatus === 'ready' || existing.enrichmentStatus === 'withdrawn') {
    return base('skipped', {
      reason: `既存 ArticleFacts が ${existing.enrichmentStatus}（人間が確定した行）。自動更新しない`,
      articleFactsId: existing.id,
    })
  }

  // draft の既存行：取得情報が新しくなったときだけ更新
  const prevVerified = LAST_VERIFIED_RE.exec(existing.notes ?? '')?.[1] ?? ''
  const newer = !!f.verifiedAt && (!prevVerified || new Date(f.verifiedAt).getTime() > new Date(prevVerified).getTime())

  // 既存の provenance を仕分け：
  //   ・[auto:morning]     … 毎回 factsFromCandidate で作り直す → 破棄（desiredFacts で入替）
  //   ・[auto:sale-mapper] … このランが sale で自前の追加分を生成するときだけ破棄。
  //                          非 sale ラン（saleProvenanceAdds が空）では既存分を保持する
  //                          （日次 morning の非 sale 経路で開催時間・原典タイトルを消さない）。
  //   ・それ以外           … 人間追加 → 常に保持
  const keptSaleMapper = saleProvenanceAdds.length === 0
  const existingHuman = (existing.sourceProvenanceFacts ?? []).filter((x) => {
    if (/^\[auto:morning\]/.test(x.fact)) return false
    if (/^\[auto:sale-mapper\]/.test(x.fact)) return keptSaleMapper
    return true
  })
  // dedup（fact 文字列）— 保持した sale-mapper 分と新規追加分が重ならないように
  const mergedRaw = [...existingHuman, ...desiredFacts]
  const seenFact = new Set<string>()
  const mergedFacts = mergedRaw.filter((x) => (seenFact.has(x.fact) ? false : (seenFact.add(x.fact), true)))

  const factsChanged = normFacts(existing.sourceProvenanceFacts).join('|') !== normFacts(mergedFacts).join('|')
  const eventDateChanged = (existing.eventDateISO ?? null) !== desiredEventDateIso && !existing.eventDateISO // 空のときだけ埋める

  // 記事フィールドは「既存が空のときだけ」confirmed 値を埋める（人間入力を上書きしない）。
  // ただし sale の「機械のみ draft」に refreshManagedFields=true が来たときは、mapper 管理下
  // フィールドを最新出力で上書きしてよい（自分の過去出力の訂正。人間編集は上書きしない）。
  // v==='unknown' を「空」とみなすのは paid / saleAvailability 列のみ（既定値 'unknown'）。
  // templateType は 'unknown' が正規の値（＝分類できていない draft）なので毎回埋め直さない。
  const isEmpty = (v: unknown, key?: string): boolean =>
    v == null ||
    (typeof v === 'string' && v.trim() === '') ||
    (Array.isArray(v) && v.length === 0) ||
    (v === 'unknown' && (key === 'paid' || key === 'saleAvailability'))
  const SALE_MANAGED_KEYS = new Set([
    'eventName', 'eventDate', 'eventTime', 'venues', 'priceText', 'whatHappens',
    'officialInfoNote', 'saleAvailability', 'areaLead', 'audienceNote', 'hashtags',
  ])
  const jsonEq = (a: unknown, b: unknown): boolean => {
    if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim()
    try {
      return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
    } catch {
      return a === b
    }
  }
  const normArr = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map((x) =>
          x && typeof x === 'object'
            ? Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([kk]) => kk !== 'id'))
            : x,
        )
      : v
  const notesStr = existing.notes ?? ''
  const humanTouched =
    !!existing.humanReviewedAt ||
    !!existing.humanReviewedBy ||
    (existing.sourceProvenanceFacts ?? []).some((x) => !/^\[auto:(?:morning|sale-mapper)\]/.test(x.fact)) ||
    !notesStr.startsWith('[auto:morning]')
  const canRefresh =
    gate.refreshManagedFields === true &&
    templateType === 'sale' &&
    existing.enrichmentStatus === 'draft' &&
    !humanTouched

  const eventFieldFills: Partial<ArticleFactsWrite> = {}
  for (const k of efKeys) {
    const cur = (existing as unknown as Record<string, unknown>)[k]
    const next = eventFieldWrites[k]
    if (next === undefined) continue
    const emptyNow = isEmpty(cur, k as string)
    const refreshable = canRefresh && SALE_MANAGED_KEYS.has(k as string) && !jsonEq(normArr(cur), normArr(next))
    if (emptyNow || refreshable) {
      // @ts-expect-error union の代入（キー毎に型は一致している）
      eventFieldFills[k] = next
    }
  }
  const eventFieldsChanged = Object.keys(eventFieldFills).length > 0

  if (!newer && !factsChanged && !eventDateChanged && !eventFieldsChanged) {
    return base('unchanged', { articleFactsId: existing.id, provenanceCount: desiredFacts.length })
  }

  const diff: RegisterDiffEntry[] = []
  const update: Partial<ArticleFactsWrite> = {}
  if (eventDateChanged) {
    diff.push({ field: 'eventDateISO', before: existing.eventDateISO ?? null, after: desiredEventDateIso })
    update.eventDateISO = desiredEventDateIso
  }
  for (const k of Object.keys(eventFieldFills) as (keyof typeof eventFieldFills)[]) {
    const curVal = (existing as unknown as Record<string, unknown>)[k]
    const wasEmpty = isEmpty(curVal, k as string)
    const fmt = (v: unknown): string =>
      k === 'venues'
        ? `${(v as unknown[] | undefined)?.length ?? 0} 件`
        : k === 'hashtags'
          ? ((v as { tag: string }[] | undefined) ?? []).map((h) => h.tag).join(' ')
          : v == null
            ? '(空)'
            : String(v)
    diff.push({
      field: `${k}（${wasEmpty ? '空欄を補完' : '機械 draft を訂正'}）`,
      before: wasEmpty ? '(空)' : fmt(curVal),
      after: fmt(eventFieldFills[k]),
    })
    // @ts-expect-error 同上
    update[k] = eventFieldFills[k]
  }
  if (factsChanged) {
    diff.push({
      field: 'sourceProvenanceFacts',
      before: `${(existing.sourceProvenanceFacts ?? []).length} 件`,
      after: `${mergedFacts.length} 件（人間 ${existingHuman.length} + 自動 ${desiredFacts.length}）`,
    })
    update.sourceProvenanceFacts = mergedFacts
  }
  if (newer) {
    diff.push({ field: 'notes[auto:lastVerifiedAt]', before: prevVerified || '(なし)', after: f.verifiedAt })
    update.notes = baseNotes
  }
  // sale mapper の注記（候補補完マーカー ＋ 内部メモ）を既存 notes へ 1 度だけ追記
  {
    const updateMarker = saleCandidateMarker(Object.keys(eventFieldFills))
    let notesBase = update.notes ?? existing.notes ?? ''
    let touched = false
    if (updateMarker && !/\[auto:sale-mapper \d{4}-\d{2}-\d{2}\] 候補自動補完/.test(notesBase)) {
      notesBase += updateMarker
      touched = true
      diff.push({ field: 'notes[auto:sale-mapper]', before: '(なし)', after: '候補自動補完の注記を追記' })
    }
    for (const line of saleInternalMemo) {
      if (!notesBase.includes(line)) {
        notesBase += '\n' + line
        touched = true
        diff.push({ field: 'notes[auto:sale-mapper memo]', before: '(なし)', after: line.slice(0, 50) })
      }
    }
    if (touched) update.notes = notesBase
  }

  if (Object.keys(update).length === 0) {
    return base('unchanged', { articleFactsId: existing.id, provenanceCount: desiredFacts.length })
  }
  if (dryRun) return base('would_update', { diff, articleFactsId: existing.id, provenanceCount: desiredFacts.length })
  const updated = await store.update(existing.id, update)
  return base('updated', { diff, articleFactsId: updated.id, provenanceCount: desiredFacts.length })
}
