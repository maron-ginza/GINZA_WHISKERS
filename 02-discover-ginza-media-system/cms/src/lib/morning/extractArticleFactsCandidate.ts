// GINZA WHISKERS / Project 02 P0 改善（2026-09-02 続き2）— ArticleFacts 候補の決定的抽出。
//
// **DB へは書かない。** DiscoveredContent の既存フィールド（＝クローラが取得済みの
// 根拠）と、任意で取得した公式ページの決定的シグナルから、構造化プロポーザルを作る。
//
// 【安全条件（P0 ブロッカー2 対応で強化）】
//   ・取得した各事実に 値 / sourceUrl / sourceName / capturedAt / verifiedAt /
//     抽出方法 / 確認状態 を必ず保存・表示する。
//   ・ready 条件を明示的に評価する（readyCheck）：
//       必須項目がすべて存在／各必須項目に根拠 URL がある／日付・期限が現在時点で有効／
//       相互矛盾がない／公式または信頼済み情報源／推測補完がない。
//   ・PDF 本文を取得・解析できない場合：PDF 内にしかない可能性のある料金・定員・
//     所要時間を推測で補完しない。必須情報が不足すれば draft／B 判定。
//     **PDF 解析機能は新規実装しない。**
//   ・記事生成・公開には一切接続しない。

import type { DiscoveredContentLike } from '../template/mapDiscoveredContentToEventFields'
import { cleanEventName, extractOfficialEventFacts } from './extractOfficialEventFacts'
import { suspectListingDate } from './suspectListingDate'
import type { ArticleFactsCandidate, ImagePreflightResult, OfficialPageSignals } from './types'

const WD_JP = ['日', '月', '火', '水', '木', '金', '土'] as const
/** ISO(UTC) の開始・終了から "YYYY年M月D日（曜）〜M月D日（曜）" を決定的に整形（推測しない） */
function formatDateRangeJp(startIso: string | null, endIso: string | null): string | null {
  if (!startIso) return null
  const s = new Date(startIso)
  if (Number.isNaN(s.getTime())) return null
  const sPart = `${s.getUTCFullYear()}年${s.getUTCMonth() + 1}月${s.getUTCDate()}日（${WD_JP[s.getUTCDay()]}）`
  if (!endIso) return sPart
  const e = new Date(endIso)
  if (Number.isNaN(e.getTime())) return sPart
  const ePart =
    e.getUTCFullYear() !== s.getUTCFullYear()
      ? `${e.getUTCFullYear()}年${e.getUTCMonth() + 1}月${e.getUTCDate()}日（${WD_JP[e.getUTCDay()]}）`
      : `${e.getUTCMonth() + 1}月${e.getUTCDate()}日（${WD_JP[e.getUTCDay()]}）`
  return `${sPart}〜${ePart}`
}

export interface ExtractInput {
  dc: DiscoveredContentLike
  /** 画像 preflight の結果（呼び出し元が決定的に算出済み） */
  image: ImagePreflightResult
  /** 任意：公式ページの決定的シグナル（--fetch 時のみ） */
  officialSignals?: OfficialPageSignals | null
  /** 出典が「公式/信頼済み情報源」と確認できているか（SOURCE LEDGER 照合結果） */
  trustedSource?: boolean
  now?: Date
}

/** 料金/入場料/観覧料の「ラベル」表記が本文にあるか（値の有無は問わない・決定的） */
const FEE_LABEL_RE = /入場料|入館料|観覧料|鑑賞料|参加費|受講料|料金[：:]|チケット|前売|当日券|木戸銭/
/** 会場種別が「観覧料の概念がない」＝ admissionApplicable='no' の候補になりうるか（既知パターンのみ・推測しない） */
function venueTypeAdmissionExempt(dc: DiscoveredContentLike): { exempt: boolean; basis: string } {
  const hay = `${dc.title ?? ''} ${dc.venue ?? ''} ${dc.sourceSiteName ?? ''}`
  const ct = (dc.contentType ?? '').toLowerCase()
  if (/画廊|ギャラリー|\bgallery\b/i.test(hay) && /(exhibition|展|個展|名品展|企画展|作品展)/.test(`${hay} ${ct}`))
    return { exempt: true, basis: '商業画廊・ギャラリー（観覧料の設定がない前提の会場種別）' }
  if (/蔦屋書店|書店|ブックストア|book\s?store/i.test(hay) && /(フェア|展|刊行記念|サイン会|トーク|ブックフェア)/.test(hay))
    return { exempt: true, basis: '書店フェア・刊行記念（入場料の概念がない）' }
  if (/(百貨店|デパート|GINZA SIX|三越|松屋|和光|阪急|東急)/.test(hay) && /(フェア|催事|ポップアップ|POP\s?UP|物販|販売会)/i.test(hay))
    return { exempt: true, basis: '百貨店・商業施設の物販フェア／催事（入場無料が常態・観覧料なし）' }
  return { exempt: false, basis: '会場種別を「観覧料非該当」と機械分類できない' }
}

/** 施設ページ本文 / JSON-LD から会場住所を決定的に取る（推測しない。無ければ null） */
export function extractVenueAddressFromSignals(
  sig: OfficialPageSignals | null | undefined,
): { value: string; sourceUrl: string | null; method: string } | null {
  const tryOne = (
    s: OfficialPageSignals | null | undefined,
    origin: 'venueDetail' | 'eventPage',
  ): { value: string; sourceUrl: string | null; method: string } | null => {
    if (!s || !s.ok) return null
    // 1) JSON-LD の address（PostalAddress or 文字列）
    const fromJsonLd = ((): string | null => {
      const visit = (node: unknown): string | null => {
        if (Array.isArray(node)) {
          for (const n of node) {
            const r = visit(n)
            if (r) return r
          }
          return null
        }
        if (node && typeof node === 'object') {
          const o = node as Record<string, unknown>
          const a = o.address
          if (typeof a === 'string' && /[都道府県区市]/.test(a)) return a.trim()
          if (a && typeof a === 'object') {
            const ao = a as Record<string, unknown>
            const parts = [ao.postalCode, ao.addressRegion, ao.addressLocality, ao.streetAddress]
              .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
              .join(' ')
            if (parts && /[都道府県区市]/.test(parts)) return parts.trim()
          }
          if (Array.isArray(o['@graph'])) {
            const r = visit(o['@graph'])
            if (r) return r
          }
          for (const v of Object.values(o)) {
            if (v && typeof v === 'object') {
              const r = visit(v)
              if (r) return r
            }
          }
        }
        return null
      }
      return visit(Array.isArray(s.jsonLd) ? s.jsonLd : [])
    })()
    if (fromJsonLd)
      return { value: fromJsonLd, sourceUrl: s.finalUrl ?? null, method: `${origin}: JSON-LD address（PostalAddress）` }
    // 2) 本文の「住所 / 所在地」ラベル（東京都中央区銀座… 形式のみ・推測しない）
    const body = typeof s.bodyText === 'string' ? s.bodyText : ''
    const m = body.match(/(?:住所|所在地)[\s：:　]{0,3}((?:〒?\s*\d{3}-?\d{4}\s*)?東京都[^\n。]{4,60})/)
    if (m && m[1]) return { value: m[1].replace(/\s{2,}/g, ' ').trim(), sourceUrl: s.finalUrl ?? null, method: `${origin}: 本文「住所/所在地」ラベル` }
    return null
  }
  return tryOne(sig?.venueDetail, 'venueDetail') ?? tryOne(sig, 'eventPage')
}

function s(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}
function iso(v: unknown): string | null {
  const x = s(v)
  if (!x) return null
  return Number.isNaN(new Date(x).getTime()) ? null : x
}
function t(v: string | null): number | null {
  if (!v) return null
  const n = new Date(v).getTime()
  return Number.isNaN(n) ? null : n
}

export function extractArticleFactsCandidate(input: ExtractInput): ArticleFactsCandidate {
  const { dc, image } = input
  const now = input.now ?? new Date()
  const nowMs = now.getTime()
  const sig = input.officialSignals ?? null
  const fetchOk = !!sig?.ok
  const capturedAt = s(dc.lastCheckedAt) ?? s(dc.detectedAt)
  const srcUrl = /^https?:\/\/\S+$/.test(dc.articleUrl ?? '') ? (dc.articleUrl as string) : null
  const trustedSource = input.trustedSource ?? false

  // JSON-LD の Event 日付（決定的抽出のみ）
  const jsonLdStart = fetchOk ? iso(sig?.jsonLdEventStart) : null
  const jsonLdEnd = fetchOk ? iso(sig?.jsonLdEventEnd) : null

  // issue 4（2026-09-03）: 1ページに複数記事が並ぶリスティング型サイト（GINZA SIX 等）で、
  // body_label 由来かつ confidence が high でない会期は「別記事の開催期間を拾った」
  // 可能性がある（#369/#370 で確認）。この場合、DC の会期を confirmed 扱いせず、
  // JSON-LD 日付があればそちらだけを使い、無ければ「日付なし」として B に落とす
  // （推測補完しない・安全側）。
  const dcHost = (() => {
    try {
      return new URL(dc.articleUrl ?? '').hostname.replace(/^www\./, '')
    } catch {
      return ''
    }
  })()
  const startExtractionConf = dc.dateExtraction?.eventStartAt?.confidence ?? null
  const isSuspectListingDate = suspectListingDate({ articleUrl: dc.articleUrl, dateExtraction: dc.dateExtraction })

  const eventStart = isSuspectListingDate ? jsonLdStart : (iso(dc.eventStartAt) ?? jsonLdStart)
  const eventEnd = isSuspectListingDate ? jsonLdEnd : (iso(dc.eventEndAt) ?? jsonLdEnd)

  const fields: ArticleFactsCandidate['fields'] = {
    officialSourceName: s(dc.sourceSiteName),
    sourceUrl: srcUrl,
    sourceName: s(dc.sourceSiteName),
    verifiedAt: capturedAt,
    publishedAt: iso(dc.publishedAt),
    eventStartAt: eventStart,
    eventEndAt: eventEnd,
    applyDeadline: null, // DiscoveredContent に構造化フィールドが無い。推測しない
    venue: s(dc.venue),
    price: null, // 同上（有料/無料の別は ArticleFacts.paid で人間が確定）
    capacity: null, // 同上
    audience: null, // 同上（ArticleFacts.audienceNote で人間が確定）
  }

  // フィールドごとの根拠（value / sourceUrl / capturedAt / verifiedAt / method / confirmationStatus）
  const provenance: ArticleFactsCandidate['provenance'] = {}
  const put = (
    key: string,
    value: string | null,
    method: string,
    o: { sourceUrl?: string | null; capturedAt?: string | null; confirmed?: boolean } = {},
  ): void => {
    if (value == null) return
    const confirmed = o.confirmed ?? true
    provenance[key] = {
      value,
      sourceUrl: o.sourceUrl ?? srcUrl,
      capturedAt: o.capturedAt ?? capturedAt,
      verifiedAt: o.capturedAt ?? capturedAt,
      method,
      confirmationStatus: confirmed ? 'confirmed' : 'unconfirmed',
    }
  }
  put('sourceName', fields.sourceName, 'DiscoveredContent.sourceSite.name')
  put('sourceUrl', fields.sourceUrl, 'DiscoveredContent.articleUrl')
  put('verifiedAt', fields.verifiedAt, 'DiscoveredContent.lastCheckedAt/detectedAt')
  put('publishedAt', fields.publishedAt, 'DiscoveredContent 構造化データ（JSON-LD / meta）')
  if (fields.eventStartAt) {
    const fromDc = !!iso(dc.eventStartAt)
    put('eventStartAt', fields.eventStartAt, fromDc ? 'DiscoveredContent.eventStartAt' : 'official page JSON-LD @type:Event.startDate', {
      sourceUrl: fromDc ? srcUrl : (sig?.finalUrl ?? srcUrl),
      capturedAt: fromDc ? capturedAt : (sig?.fetchedAt ?? capturedAt),
    })
  }
  if (fields.eventEndAt) {
    const fromDc = !!iso(dc.eventEndAt)
    put('eventEndAt', fields.eventEndAt, fromDc ? 'DiscoveredContent.eventEndAt' : 'official page JSON-LD @type:Event.endDate', {
      sourceUrl: fromDc ? srcUrl : (sig?.finalUrl ?? srcUrl),
      capturedAt: fromDc ? capturedAt : (sig?.fetchedAt ?? capturedAt),
    })
  }
  put('venue', fields.venue, 'DiscoveredContent.venue')

  // 詳細ページ・PDF の取得状況
  const detailPage: ArticleFactsCandidate['detailPage'] = {
    url: srcUrl,
    lastCrawledAt: capturedAt,
    activeFetch: sig ?? null,
  }
  const pdfUrl = fetchOk && sig?.pdfLinks && sig.pdfLinks.length > 0 ? sig.pdfLinks[0] : null
  const pdf: ArticleFactsCandidate['pdf'] = {
    found: !!pdfUrl,
    url: pdfUrl,
    activeFetch: sig ?? null,
    note: pdfUrl
      ? 'PDF リンクを検出。**PDF 本文の取得・解析は行わない（新規実装しない）**。PDF 内にしかない可能性のある料金・定員・所要時間は推測で補完せず、必須不足として draft／B のままにする。'
      : 'PDF 未検出。',
  }

  // 相互矛盾チェック（推測はしない・検出だけ）
  const conflicts: string[] = []
  const st = t(fields.eventStartAt)
  const en = t(fields.eventEndAt)
  if (st != null && en != null && st > en) conflicts.push(`開催開始 > 終了（${fields.eventStartAt} > ${fields.eventEndAt}）`)
  if (isSuspectListingDate && (iso(dc.eventStartAt) || iso(dc.eventEndAt))) {
    conflicts.push(
      `会期が body_label 由来・低信頼（confidence=${startExtractionConf ?? 'なし'}）で、` +
        `1ページに複数記事が並ぶ ${dcHost} の別記事の開催期間を拾った可能性がある。` +
        `公式ページで人間が会期を確認する（推測補完しない）。DC 値=${iso(dc.eventStartAt) ?? '—'}〜${iso(dc.eventEndAt) ?? '—'}`,
    )
  }
  if (fetchOk) {
    const dcS = t(iso(dc.eventStartAt))
    const ldS = t(jsonLdStart)
    if (dcS != null && ldS != null && Math.abs(dcS - ldS) > 2 * 86_400_000)
      conflicts.push(`DC の開始日と公式ページ JSON-LD の startDate が 2 日超乖離（${iso(dc.eventStartAt)} vs ${jsonLdStart}）`)
  }

  // --- 「公式記載なし」 / 「取得失敗」 / 「記事タイプ上該当なし」 の区別（2026-09-09） ---
  //   fetchOutcome を見て、下流が3状態を混同しないよう分類する。
  const fetchOutcome: string = sig?.fetchOutcome ?? (fetchOk ? 'ok' : sig ? 'unknown' : 'not_requested')
  const fetchFailed = !!sig && sig.requested === true && sig.ok !== true // 取得を試みたが失敗
  const body = fetchOk && typeof sig?.bodyText === 'string' ? (sig!.bodyText as string) : ''

  // 会場種別による入場料の該当性（既知パターンのみ・推測しない）
  const admissionExemptInfo = venueTypeAdmissionExempt(dc)
  let admissionApplicable: 'yes' | 'no' | 'not_stated' = 'not_stated'
  if (fetchOk) {
    if (FEE_LABEL_RE.test(body)) admissionApplicable = 'yes'
    else if (admissionExemptInfo.exempt) admissionApplicable = 'no' // 種別が観覧料非該当 かつ 料金ラベル皆無
  }

  // 会場住所（同一登録可能ドメインの施設ページ or イベントページの JSON-LD/ラベルからのみ）
  const venueAddress = extractVenueAddressFromSignals(sig)

  // 営業時間（開廊/開館/営業時間）の confirmed 抽出（extractOfficialEventFacts の eventTime を後段で使う）

  // 必須（推測で埋めない）— DiscoveredContent だけでは埋まらないものを列挙
  const missingRequired: string[] = []
  const officiallyNotStated: string[] = []
  const missingBecauseFetchFailed: string[] = []
  const notApplicable: string[] = []
  if (!fields.sourceName) missingRequired.push('sourceName（公式情報源名）')
  if (!fields.sourceUrl) missingRequired.push('sourceUrl（追跡可能な公式 URL）')
  if (!fields.verifiedAt) missingRequired.push('verifiedAt（情報の確認日時）')
  if (!fields.eventStartAt && !fields.eventEndAt) missingRequired.push('開催日／終了日（機械日付が取れない）')
  if (!fields.venue && !venueAddress) missingRequired.push('会場（venue）')
  missingRequired.push('申込期限（applyDeadline：DiscoveredContent に構造化フィールドなし。公式で要確認・推測しない）')
  missingRequired.push('料金の有料/無料（ArticleFacts.paid：人間が確定。PDF内の可能性があっても推測補完しない）')
  missingRequired.push('定員・所要時間（構造化フィールドなし。PDF内の可能性があっても推測補完しない）')
  missingRequired.push('対象者（audienceNote：人間が確定）')
  missingRequired.push('本文テキスト系（whatHappens / eventTime / areaLead / theme / editionLabel / officialInfoNote：ArticleFacts で入力）')

  // 3分類（missingRequired は後方互換で全件保持。新しい下流はこちらを使う）
  if (admissionApplicable === 'no') {
    notApplicable.push(
      `入場料（有料/無料）：${admissionExemptInfo.basis}。公式本文に料金ラベルなし＝この会場種別では A 判定の必須にしない`,
    )
  } else if (fetchOk) {
    officiallyNotStated.push('料金（有料/無料）：公式ページに料金ラベルの記載なし（人間が最終確認）')
    officiallyNotStated.push('申込期限・定員・所要時間：公式ページ本文に該当ラベルの記載なし')
  } else if (fetchFailed) {
    missingBecauseFetchFailed.push(
      `料金・申込期限・定員・所要時間・会場住所：公式ページ取得失敗（fetchOutcome=${fetchOutcome}）のため未取得。再取得で解消しうる`,
    )
  }
  if (!venueAddress && fetchOk) officiallyNotStated.push('会場住所：イベントページ・施設ページとも公式に住所の記載なし')

  // ready 判定の内訳（人間が admin で ready 化するときの残作業）
  const REQUIRED_FOR_READY = ['sourceName', 'sourceUrl', 'verifiedAt', 'venue', 'eventStartAt']
  const presentRequired = REQUIRED_FOR_READY.filter((k) => provenance[k])
  const allRequiredPresent = presentRequired.length === REQUIRED_FOR_READY.length
  const everyRequiredHasSourceUrl = presentRequired.every((k) => !!provenance[k]?.sourceUrl)
  const datesValidNow = (() => {
    const s0 = t(fields.eventStartAt)
    const e0 = t(fields.eventEndAt)
    const ref = e0 ?? s0
    if (ref == null) return false
    return ref >= nowMs // 終了（なければ開始）が現在以降
  })()
  const noConflicts = conflicts.length === 0
  const noSpeculativeFill = true // この関数は null を推測で埋めないことを保証（構造上）

  const blockers: string[] = []
  if (!allRequiredPresent) blockers.push(`必須不足: ${REQUIRED_FOR_READY.filter((k) => !provenance[k]).join(', ')}`)
  if (!everyRequiredHasSourceUrl) blockers.push('一部の必須項目に根拠 URL がない')
  if (!datesValidNow) blockers.push('開催日／会期が現在時点で有効でない、または機械日付が無い')
  if (!noConflicts) blockers.push(`相互矛盾あり: ${conflicts.join(' / ')}`)
  if (!trustedSource) blockers.push('出典が SOURCE LEDGER の公式/信頼済みドメインと確認できていない')
  // DiscoveredContent 由来だけでは常に埋まらない構造化必須
  blockers.push('DiscoveredContent には申込期限・料金・定員・対象者・本文テキスト系の構造化フィールドが無い → admin で人間が確定入力する必要がある')

  const readyEligible = false // ← 自動では ready にしない。上の blockers を人間が admin で解消して ready 化する
  const proposedStatus: 'ready' | 'draft' = readyEligible ? 'ready' : 'draft'

  // --- 記事フィールド候補の決定的抽出（2026-09-03、改善対象2） ---
  //   公式ページ本文（サイト別アダプタ）＋既に取れている構造化日付から、
  //   eventName / eventDate / eventDateISO / eventTime / venues / paid を組み立てる。
  //   関連記事・別イベントの値は confirmed にしない（アダプタが近傍照合する）。
  const bodyFacts = extractOfficialEventFacts({
    articleUrl: dc.articleUrl,
    title: dc.title,
    bodyText: fetchOk ? sig?.bodyText : null,
  })
  const nameFound = bodyFacts.targetNameFoundInBody
  const cleanName = cleanEventName(dc.title)

  // eventDateISO は既に fields.eventStartAt に入っている（FIX 4 で別記事日付は除外済み）。
  // eventDate（表示）は、アダプタの表示文字列があればそれ、無ければ ISO から決定的に整形。
  const isoDatesConfirmed = !!eventStart // FIX 4 通過済み＝別記事の疑いなし
  const dateDisplayFromIso = formatDateRangeJp(eventStart, eventEnd)

  const eef: ArticleFactsCandidate['extractedEventFacts'] = {
    eventName: cleanName
      ? {
          value: cleanName,
          confirmationStatus: nameFound ? 'confirmed' : 'unconfirmed',
          method: nameFound
            ? '公式ページ本文にタイトル（ナビ除去済み）が一致'
            : 'DiscoveredContent.title のナビ除去（本文一致は未確認）',
        }
      : { value: null, confirmationStatus: 'unconfirmed', method: 'title 空' },
    eventDate:
      bodyFacts.eventDateDisplay.value && bodyFacts.eventDateDisplay.confidence === 'confirmed'
        ? {
            value: bodyFacts.eventDateDisplay.value,
            confirmationStatus: 'confirmed',
            method: bodyFacts.eventDateDisplay.method,
          }
        : dateDisplayFromIso
          ? {
              value: dateDisplayFromIso,
              confirmationStatus: isoDatesConfirmed ? 'confirmed' : 'unconfirmed',
              method: '構造化日付（JSON-LD / DC）から決定的に整形',
            }
          : { value: null, confirmationStatus: 'unconfirmed', method: '会期の機械日付なし' },
    eventDateISO: {
      value: eventStart,
      confirmationStatus: eventStart ? (isoDatesConfirmed ? 'confirmed' : 'unconfirmed') : 'unconfirmed',
      method: eventStart ? '構造化日付（JSON-LD / DC.eventStartAt）' : '機械日付なし',
    },
    eventTime: {
      value: bodyFacts.eventTime.value,
      confirmationStatus: bodyFacts.eventTime.confidence,
      method: bodyFacts.eventTime.method,
    },
    venuePlace: (() => {
      // 2026-09-09：同一登録可能ドメインの施設ページ等から会場住所が取れていれば、
      // 会場名（本文抽出 or DC.venue）＋住所 を confirmed 会場として返す（住所の出典は別 URL）。
      const nameLike = bodyFacts.venuePlace.value || fields.venue || null
      if (venueAddress && !/[都道府県].{2,}[区市]/.test(nameLike ?? '')) {
        return {
          value: nameLike ? `${nameLike}（${venueAddress.value}）` : venueAddress.value,
          confirmationStatus: 'confirmed' as const,
          method: `${bodyFacts.venuePlace.method || 'DiscoveredContent.venue'} ＋ 住所: ${venueAddress.method}`,
        }
      }
      if (bodyFacts.venuePlace.value)
        return {
          value: bodyFacts.venuePlace.value,
          confirmationStatus: bodyFacts.venuePlace.confidence,
          method: bodyFacts.venuePlace.method,
        }
      if (fields.venue)
        return {
          value: fields.venue,
          confirmationStatus: 'unconfirmed' as const,
          method: 'DiscoveredContent.venue（単一テキスト・本文照合なし）',
        }
      return { value: null, confirmationStatus: 'unconfirmed' as const, method: '会場の抽出なし' }
    })(),
    paid: {
      value: bodyFacts.paid.value,
      confirmationStatus: bodyFacts.paid.confidence,
      method: bodyFacts.paid.method,
    },
    applyRequired: {
      value: null, // 推測しない。アダプタの hint は下の method に残すのみ
      confirmationStatus: 'unconfirmed',
      method: bodyFacts.applyRequiredHint.value === 'yes'
        ? `本文に応募・抽選表現あり（${bodyFacts.applyRequiredHint.rawMatch ?? ''}）— applyRequired は人間が確定`
        : 'applyRequired は人間が確定（本文に応募・抽選表現なし）',
    },
    whatHappens: {
      value: bodyFacts.whatHappens.value,
      confirmationStatus: bodyFacts.whatHappens.confidence,
      method: bodyFacts.whatHappens.method,
    },
    officialInfoNote: {
      value: bodyFacts.officialInfoNote.value,
      confirmationStatus: bodyFacts.officialInfoNote.confidence,
      method: bodyFacts.officialInfoNote.method,
    },
    hashtagCandidates: bodyFacts.hashtagCandidates,
    targetNameFoundInBody: nameFound,
    adapter: bodyFacts.adapter,
  }

  return {
    discoveredContentId: Number(dc.id),
    fields,
    extractedEventFacts: eef,
    provenance,
    detailPage,
    pdf,
    imagePolicy: image.policy,
    missingRequired,
    officiallyNotStated,
    missingBecauseFetchFailed,
    notApplicable,
    admissionApplicable,
    venueAddress,
    conflicts,
    readyCheck: {
      allRequiredPresent,
      everyRequiredHasSourceUrl,
      datesValidNow,
      noConflicts,
      trustedSource,
      noSpeculativeFill,
      blockers,
    },
    readyEligible,
    proposedStatus,
  }
}
