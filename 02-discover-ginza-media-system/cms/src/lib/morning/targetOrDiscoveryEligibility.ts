// GINZA WHISKERS / Project 02（2026-09-15、マロン指示：A判定候補が少なすぎる根本原因の是正）
//
// 【根本原因（実データで確認）】
// 従来のA判定は「ArticleFacts.enrichmentStatus='ready'（必須項目すべてを人間が
// 手入力済み）」を必須条件にしていた。これは「記事生成の準備が整っているか」の
// 判定であり、「銀座で今旬の候補として提示する価値があるか」の判定ではない。
// 結果、ArticleFactsが人間によって作成されるまで**どの候補も自動ではAになれない**
// 構造になっていた（2026-09-15実データ：1,167件中A=0、非A理由の上位は
// 「ArticleFacts未作成」163件・「factKind判定不能」231件・「PRE-GATE除外」259件・
// 「銀座関連性なし」385件——いずれもArticleFacts手入力の有無や記事タイプ2分類の
// 都合であり、「銀座限定でないか」「常設店舗か」等の条件は実際には効いていなかった）。
//
// 【A判定の必須条件（2026-09-16続き4改訂：マロン指示「A/B/C判定と最終選定の分離」で修正）】
// 【最重要定義】Aは「今日、マロンへ記事候補として提示できる状態」——単なる候補プール
// ではない。以下をすべて満たす場合だけAとする（1つでも欠けばB、安全条件違反はC）。
//   1. 銀座で体験・購入・参加できる（＝終了済みでない。expired は呼び出し元のC判定）
//   2. 公式情報で銀座の場所と提供状況を確認できる（venue/facilityKeyのいずれか）
//   3. 開催日・販売期間・現在の提供状況が明確——構造化eventStartAt/eventEndAt、または
//      タイトルに明示された具体的な年月日（西暦4桁を含む表記）のいずれかを確認できること。
//      「開催中」「販売中」「受付中」等の明記語だけでは現在性を認めない
//      （evaluateCurrencyConfirmation。不確実 → uncertainCurrentAvailability／
//      missingEventOrSalePeriod でB）。last_checked_at（再クロール日時）は根拠にしない。
//      タイトルに明示された**過去**の年月日は、この関数に到達する前に
//      assessCandidate.ts が「明確に古い情報」としてCへ振り分ける。
//   4. 終了していない（同上・呼び出し元のC判定）
//   5. 既投稿・既記事化・既処理ではない（duplicate は呼び出し元のC判定／alreadyProcessed
//      は呼び出し元がB判定として先に短絡する——このモジュールには到達しない）
//   6. 近似重複ではない（recentBrandVenueDuplicate。nearDuplicateタグでB）
//   7. 過去14日以内に扱った同一施設ではない（facilityCooldown、B）
//   8. 過去14日以内に扱った同一親施設ではない（parentFacilityCooldown、B。
//      GINZA SIX・山野楽器等の表記揺れをfacilityKey.tsのparentFacilityKeyで統合）
//   9. 旬・限定・新規性・銀ブラ途中の発見価値のいずれかがある
//      （evaluateDiscoverySignal。無ければevergreenWithoutTimelinessでB）
//
// 銀座限定でない・他地域にも店舗がある・通販でも買える・銀座を訪れる唯一の目的で
// ない・常設店舗である、はいずれも除外理由にしない。ただし常設商品・常設サービスで
// 9.のsignalが一切無いもの、または3.の現在性を確認できないものはBのまま（意図的な設計）。
//
// 【2026-09-16続き4改訂】18カテゴリーへの分類（deriveProvisionalCategory）は、
// A判定が確定した「後」に行う付随情報であり、A/B/C判定のブロッカーには**しない**
// （マロン指示：「カテゴリー分類だけを理由にAからBへ変更しない」）。category は
// A判定の可否とは無関係に呼び出し元へ返し、推測でも割り当てない——判定できない
// 場合は null のまま返し、呼び出し元（selectMorningThreeSlots／buildMorningReport）
// が「未分類」として件数・DC番号を報告する。旧2026-09-16続き3改訂ではこれを
// A判定のブロッカーへ戻していたが、その結果A判定候補が過剰に少なくなり
// （2026-09-15データで37→1、選定条件〈カテゴリーの偏り対策〉と本来のA/B/C判定
// 〈今日提示できる状態か〉を混同していたため）、今回是正した。
//
// mode（目的型／発見型）はA判定の条件ではなく、A判定後の分類・表示用。
//
// 【安全条件】AIを使わない・推測しない（書かれている語のみを見る）・既存のC判定
// （終了済み・重複・銀座関連性なし・出典なし・明確に古い情報）はこのモジュールでは
// 判定し直さず呼び出し元の結果をそのまま受け取る。facilityCooldown/
// parentFacilityCooldownはB判定であり削除・恒久ブロックではない——クールダウン
// 終了後、情報がまだ有効なら次回の再判定でAに戻る。

import { deriveProvisionalCategory } from '../pipeline/provisionalCategory'
import { resolveFacilityKey } from '../curation/facilityKey'
import { hasNoveltySignal } from '../crawler/sweetsDiscoveryKeywords'
import type { FactKind } from './types'

// 新規性・季節性は既存のsweetsDiscoveryKeywords.ts（hasNoveltySignal）をそのまま使う。
// ここでは「話題性・発見性・目的型体験」寄りの明記語のみを補う（推測しない・明記語のみ）。
// 2026-09-15追加：「待望の◯◯登場」等、実データ（DC#246等）で頻出する新商品告知の
// 定型表現（「新」が直前に無い「登場」単体）を追加。
// 【2026-09-15修正】単独の「催し」はテストのプレースホルダー文言（「〜な催しです」等の
// 一般的な言い回し）にも一致してしまい過検出になるため除外し、より具体的な「催し物」に
// 限定した（「フェア」「物産展」等の他語で実質的な催事シグナルはカバーできている）。
const TOPIC_OR_EXPERIENCE_SIGNAL_RE =
  /話題|人気|注目|初出店|初上陸|初開催|オープン|グランドオープン|リニューアル|コラボ(?:レーション)?|個展|企画展|展覧会|展示販売|体験会|ワークショップ|トークイベント|トークショー|サイン会|公演|ライブ|催し物|フェア|物産展|登場|待望/

// 営業告知（短縮営業・営業時間変更・臨時休業・休館・メンテナンス・開催中止等）は運営上の
// 事務連絡であり、季節語・新規性語を偶然含んでいても「旬の候補」（目的型／発見型のいずれ
// にも該当しない）——DC#419（教文館「短縮営業のお知らせ」が季節語「秋」の誤検出でAに
// なった実例）を受けて2026-09-15追加。discovery signal のあるなしに関わらず優先して除外する。
const OPERATIONAL_NOTICE_RE =
  /短縮営業|営業時間変更|営業時間の変更|臨時休業|休業のお知らせ|休館|メンテナンスのお知らせ|システムメンテナンス|開催中止|中止のお知らせ|営業日変更|定休日変更|一部休業|閉店時間変更|時間変更のお知らせ|臨時休館/

// 過去の報告・メディア掲載系の記事は、旬の候補ではなく「過去の出来事の記録」であり
// 目的型／発見型のいずれにも該当しない——2026-09-16追加（マロン指示。DC#1017
// 「ディープトウキョウマガジンに掲載されました」がAになっていた実例を受けて）。
const PAST_REPORT_OR_MEDIA_RE = /掲載されました|メディア掲載|開催報告|終了報告|過去の紹介/

// 現在性の確認語（2026-09-16追加・マロン指示）。「新商品」「限定」等の新規性語（discovery
// signal）だけでは「今も入手・体験できるか」を確認したことにならないため、以下のいずれかを
// 満たす場合のみ現在性ありとする。あえて単独の「発売」「販売」は含めない——「発売しました」
// 「〜を販売しております」等の**過去の告知文でも一致してしまう**ため、確実に現在進行を
// 示す語尾（「中」）または明確な現在性の定型句に限定する（推測しない・明記語のみ）。
const CURRENT_AVAILABILITY_RE =
  /発売中|新発売|好評発売中|ただいま発売中|販売中|提供中|営業中|予約受付中|受付中|開催中|取扱中|販売開始/

/** 明記された開催・販売期間があるか（推測しない。構造化日付のいずれかがあれば true） */
function hasExplicitPeriodSignal(eventStartAt: string | null, eventEndAt: string | null): boolean {
  return !!(eventStartAt || eventEndAt)
}

// タイトル中の明示的な年月日（西暦4桁を含むもののみ・推測しない）を検出する
// （2026-09-16追加・マロン指示）。DC#40「新春浅草歌舞伎"お好み弁当"ネット予約受付中！
// 2025.12.14」のように、last_checked_at（再クロール日時）は新しくても、タイトル自体が
// 明確に過去の日付を指しているケースを「受付中」等の語だけで現在有効と誤判定しないため。
// YYYY.MM.DD／YYYY-MM-DD／YYYY/MM/DD／YYYY年M月D日、のいずれかの表記のみを対象とする
// （年の無い「M月D日」「今月」等は対象外＝過去と断定できないため推測しない）。
const EXPLICIT_FULL_DATE_RE = /(20\d{2})[.\-/年](\d{1,2})[.\-/月](\d{1,2})日?/g

export interface PastDateSignalResult {
  found: boolean
  /** 検出した日付（YYYY-MM-DD）。見つからなければ null */
  date: string | null
}

/** タイトルに明示された過去の年月日があるか（西暦4桁を含む表記のみ・推測しない） */
export function findExplicitPastDateInTitle(title: string | null, now: Date): PastDateSignalResult {
  const text = title ?? ''
  const re = new RegExp(EXPLICIT_FULL_DATE_RE)
  let m: RegExpExecArray | null
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(text))) {
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue
    const dt = new Date(Date.UTC(y, mo - 1, d, 23, 59, 59))
    if (dt.getTime() < now.getTime()) {
      return { found: true, date: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
    }
  }
  return { found: false, date: null }
}

/** タイトルに明示された年月日があるか（過去・未来問わず。西暦4桁を含む表記のみ・推測しない） */
export function findExplicitDateInTitle(title: string | null): PastDateSignalResult {
  const text = title ?? ''
  const re = new RegExp(EXPLICIT_FULL_DATE_RE)
  const m = re.exec(text)
  if (!m) return { found: false, date: null }
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return { found: false, date: null }
  return { found: true, date: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
}

// 予約・イベント系の明記語（2026-09-16続き追加・マロン指示）。これらの語は「予約受付中」
// 自体が CURRENT_AVAILABILITY_RE にも含まれるため、語だけで現在性ありとしてしまうと
// 「受付終了済みだが告知ページ自体は残っている」実例（DC#1167「観劇弁当」ネット予約
// 受付中！のような、DC#40と同型だが日付がタイトルに無いケース）を取りこぼす。
// この語群が含まれる場合は、構造化期間（eventStartAt/eventEndAt）かタイトルに明示された
// 具体的な年月日（西暦4桁を含む表記）のいずれかが無い限り、現在性の明記語だけでは
// Aにしない。
const EVENT_RESERVATION_TRIGGER_RE = /予約受付中|ネット予約|観劇弁当|公演|イベント|フェア|講演/

export interface CurrencyConfirmationResult {
  confirmed: boolean
  reason: string
}

/**
 * 現在性（開催中・販売中・提供中）を確認できるか（明記語・構造化日付のみ・推測しない）。
 * イベント／催事＝構造化された開催・販売期間（eventStartAt/eventEndAt）が明記されていること。
 * 商品・メニュー＝公式ページ本文に「発売中」「販売中」「提供中」等の現在性の明記語があること。
 * どちらか一方を満たせばよい（events は期間、products はテキスト、を主に想定するが排他ではない）。
 *
 * 【タイトルのみを見る・excerptは使わない】excerptはサイト共通ナビ・他キャンペーンの
 * バナー文言を大量に含むことが多く（deriveProvisionalCategory が category 判定に
 * excerpt を使わない理由と同じ）、「無関係な別キャンペーンの『開催中』がexcerptに
 * 混入し誤って現在性ありと判定される」実例（DC#119「SPRING 2026」のexcerptに別の
 * 「夏のプレゼントキャンペーン開催中」というナビ文言が混入していた）を2026-09-16の
 * 検証で発見したため、確実性の高いタイトルのみを対象とする。
 */
export function evaluateCurrencyConfirmation(
  title: string | null,
  eventStartAt: string | null,
  eventEndAt: string | null,
): CurrencyConfirmationResult {
  if (hasExplicitPeriodSignal(eventStartAt, eventEndAt)) {
    return { confirmed: true, reason: '開催・販売期間を公式情報で確認済み（構造化データ）' }
  }
  // 2026-09-16続き3改訂：タイトルに明示された過去の年月日（EXPLICIT_FULL_DATE_RE）は
  // ここでは判定しない——「明確に古い情報」はB（不確実）ではなくC（対象外）として
  // assessCandidate.ts側で先に判定済みのため、この関数に到達する時点では
  // findExplicitDateInTitle が見つける日付は（あれば）未来／当日のものに限られる。
  const anyDate = findExplicitDateInTitle(title)
  if (anyDate.found) {
    return { confirmed: true, reason: `タイトルに明示された具体的な開催日（${anyDate.date}）を確認` }
  }
  // 2026-09-16続き3改訂：単語（「開催中」「販売中」「受付中」等）だけでは現在性ありと
  // しない——構造化データかタイトル中の具体的な年月日のいずれかが無い限りBにする
  // （旧版は CURRENT_AVAILABILITY_RE の一致だけでAにしていたが、DC#294「好評開催中！」
  // のように実際には現在性が確認できないケースを取りこぼしていたため撤廃）。
  if (EVENT_RESERVATION_TRIGGER_RE.test(title ?? '')) {
    return {
      confirmed: false,
      reason:
        'missingEventOrSalePeriod：予約受付中／公演／イベント／フェア／講演等の語のみで具体的な開催日を確認できない（last_checked_atは根拠にしない）',
    }
  }
  if (CURRENT_AVAILABILITY_RE.test(title ?? '')) {
    return {
      confirmed: false,
      reason:
        'uncertainCurrentAvailability：現在性の明記語（発売中／販売中／受付中／開催中等）はあるが具体的な開催日・販売期間を確認できない',
    }
  }
  return { confirmed: false, reason: 'uncertainCurrentAvailability：開催期間・販売状況を確認できない（過去の月・季節の言及のみ等）' }
}

export interface DiscoverySignalResult {
  has: boolean
  reason: string
}

/**
 * 季節性・新規性・期間性・話題性・発見性のいずれかがあるかを判定する（明記語のみ・推測しない）。
 */
export function evaluateDiscoverySignal(
  title: string | null,
  excerpt: string | null,
  eventStartAt: string | null,
  eventEndAt: string | null,
  now: Date = new Date(),
): DiscoverySignalResult {
  const text = `${title ?? ''} ${(excerpt ?? '').slice(0, 300)}`
  if (hasNoveltySignal(text, now)) {
    return { has: true, reason: '新規性・季節性の明記語を確認（新商品／季節限定／期間限定等）' }
  }
  if (hasExplicitPeriodSignal(eventStartAt, eventEndAt)) {
    return { has: true, reason: '開催・販売期間が明記されている（期間性）' }
  }
  if (TOPIC_OR_EXPERIENCE_SIGNAL_RE.test(text)) {
    return { has: true, reason: '話題性・発見性・体験性の明記語を確認（個展／企画展／催し／コラボ等）' }
  }
  return { has: false, reason: 'evergreenWithoutTimeliness：季節性・新規性・期間性・話題性・発見性のいずれも確認できない（常設情報のみ）' }
}

export interface TargetOrDiscoveryInput {
  title: string | null
  venue: string | null
  articleUrl: string | null
  excerpt: string | null
  sourceSiteName: string | null
  contentType: string | null
  factKind: FactKind
  eventStartAt: string | null
  eventEndAt: string | null
  /** 呼び出し元（assessCandidate）が既に判定済みの安全条件。ここでは判定し直さない */
  expired: boolean
  ginzaRelevant: boolean
  hasTraceableSource: boolean
  duplicate: boolean
  recentBrandVenueDuplicate: boolean
  /** 情報の確認日時が古い（freshnessDays 超過）。呼び出し元が判定済み（既定 undefined=false 扱い） */
  stale?: boolean
  /**
   * 【2026-09-16続き3追加】施設14日間クールダウン（facilityActivityHistory.
   * checkFacilityCooldown の結果を呼び出し元がそのまま渡す）。onCooldown:true の間は
   * AにせずBにする（削除・恒久ブロックはしない——クールダウン終了後に情報がまだ
   * 有効なら次回の再判定でAに戻る）。matchType:'parent' なら
   * parentFacilityCooldown、'facility'（既定）なら facilityCooldown として理由タグを分ける。
   */
  facilityCooldown?: { onCooldown: boolean; reason: string; matchType?: 'facility' | 'parent' }
  now?: Date
}

export type EligibilityMode = 'purpose' | 'discovery'

export interface TargetOrDiscoveryResult {
  eligible: boolean
  mode: EligibilityMode | null
  category: string | null
  /** eligible時：目的型／発見型と判定した明記根拠 */
  reasons: string[]
  /** !eligible時：Aにならなかった理由（複数該当しうる） */
  blockers: string[]
}

// 目的型＝その体験・展示・催事自体が来訪理由になりうるカテゴリー。
// 発見型＝銀ブラの途中で出会う商品・サービス寄りのカテゴリー。
// あくまで表示上の分類であり、A判定の可否には影響しない。
const PURPOSE_CATEGORIES = new Set([
  'ART', 'MUSIC', 'EVENT', 'EXPERIENCE', 'WORKSHOP', 'PHOTO', 'NIGHT', 'NIGHT_VIEW', 'ARCHITECTURE',
])

export function evaluateTargetOrDiscoveryEligibility(input: TargetOrDiscoveryInput): TargetOrDiscoveryResult {
  const now = input.now ?? new Date()
  const blockers: string[] = []

  // 4. 既投稿・近似記事ではない／5. 終了済みではない：呼び出し元のC判定・近似重複判定をそのまま使う
  //    （このモジュールでは判定し直さない・安全条件を緩めない）。
  if (input.expired) blockers.push('終了済み')
  if (input.duplicate) blockers.push('既投稿と重複')
  if (input.recentBrandVenueDuplicate) blockers.push('nearDuplicate：近似重複（同一ブランド・同一会場、直近14日以内）')
  if (!input.ginzaRelevant) blockers.push('銀座関連性を確認できない')
  if (!input.hasTraceableSource) blockers.push('追跡可能な公式出典URLが無い')
  if (input.stale) blockers.push('情報の確認日時が古く再確認が必要')
  // 2026-09-16続き3追加：施設14日間クールダウン中はAにしない（削除はしない・B判定）。
  if (input.facilityCooldown?.onCooldown) {
    const tag = input.facilityCooldown.matchType === 'parent' ? 'parentFacilityCooldown' : 'facilityCooldown'
    blockers.push(`${tag}：${input.facilityCooldown.reason}`)
  }

  // 営業告知（短縮営業・休館・メンテナンス・開催中止等）は季節語等の discovery signal の
  // 有無に関わらず除外する（旬の候補ではなく運営上の事務連絡のため）
  const noticeText = `${input.title ?? ''} ${(input.excerpt ?? '').slice(0, 300)}`
  if (OPERATIONAL_NOTICE_RE.test(noticeText)) {
    blockers.push('営業時間変更・休業・中止等の運営告知（旬の候補として扱わない）')
  }

  // 過去の報告・メディア掲載系（「掲載されました」「開催報告」等）は discovery signal の
  // 有無に関わらず除外する（過去の出来事の記録であり旬の候補ではないため。2026-09-16追加）
  if (PAST_REPORT_OR_MEDIA_RE.test(noticeText)) {
    blockers.push('過去の報告・メディア掲載系の記事（旬の候補として扱わない）')
  }

  // 現在性の必須化（2026-09-16追加・マロン指示、続き3改訂で単語のみの確認を撤廃）：
  // 構造化開催期間かタイトルに明示された具体的な開催日のいずれかを確認できない限り
  // Aにしない——「開催中」「販売中」「受付中」等の明記語だけでは現在性を認めない
  // （DC#294「好評開催中！」のような、実際には現在性が確認できないケースを取りこぼして
  // いたため）。
  const currency = evaluateCurrencyConfirmation(input.title, input.eventStartAt, input.eventEndAt)
  if (!currency.confirmed) blockers.push(currency.reason)

  // 2. 公式情報で銀座の場所と提供状況を確認できる
  const facility = resolveFacilityKey({
    venue: input.venue,
    sourceName: input.sourceSiteName,
    sourceUrl: input.articleUrl,
    title: input.title,
  })
  const locationConfirmed = !!(input.venue && input.venue.trim()) || !!facility.key
  if (!locationConfirmed) blockers.push('公式情報で銀座の場所・提供状況を確認できない')

  // 18カテゴリーへの分類（タイトル/会場の明記語のみ）。
  // 【2026-09-16続き4改訂】A判定確定後の付随情報として算出するのみで、ブロッカーには
  // しない（マロン指示：カテゴリー分類だけを理由にAからBへ変更しない。判断できない
  // カテゴリーを推測で割り当てず、未分類は呼び出し元が件数・DC番号として報告する）。
  const provisional = deriveProvisionalCategory({
    title: input.title,
    venue: input.venue,
    contentType: input.contentType,
  })
  const category = provisional.category

  // 3. 季節性・新規性・期間性・話題性・発見性のいずれかがある
  const discovery = evaluateDiscoverySignal(input.title, input.excerpt, input.eventStartAt, input.eventEndAt, now)
  if (!discovery.has) blockers.push(discovery.reason)

  const eligible = blockers.length === 0
  if (!eligible) {
    return { eligible: false, mode: null, category, reasons: [], blockers }
  }

  const mode: EligibilityMode =
    input.factKind === 'event' || (category != null && PURPOSE_CATEGORIES.has(category)) ? 'purpose' : 'discovery'

  return {
    eligible: true,
    mode,
    category,
    reasons: [discovery.reason, currency.reason],
    blockers: [],
  }
}
