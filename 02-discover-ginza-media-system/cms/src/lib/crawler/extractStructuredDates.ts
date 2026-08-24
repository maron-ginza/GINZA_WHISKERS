// 個別記事・イベントページからの構造化日付抽出（2026-08-17、Tier 3拡張）。
//
// 【設計原則（マロン指示）】公開日・開催期間が取得できない場合は推測しない。
// 取得優先順位は3段階：
//   Tier 1: JSON-LD / schema.org（ページが機械可読な形で明示的に宣言）
//   Tier 2: article:*等のmetaタグ／itemprop付きtimeタグ（同様に明示的）
//   Tier 3: 個別ページ本文中の、ラベル付きの明確な日付表現のみ
//     （「開催期間：」「会期：」等の見出し語に直接紐づく日付のみを対象とし、
//     本文中に浮いているだけの日付は対象にしない——前回セッションで「トップ
//     ページ本文の日付を記事公開日と誤認しない」という教訓を得たため、
//     Tier 3でも同じ慎重さを踏襲し、ラベルという明示的な文脈手がかりが
//     ある場合に限定する）。
// 各フィールドの値には抽出元Tier（'json_ld'|'meta'|'time_tag'|'body_label'）と
// 信頼度（'high'|'medium'）、Tier 3の場合は根拠となった生テキスト片
// （rawMatch）を添えて返す——「抽出根拠とconfidenceを保持できる設計」
// （マロン指示）。該当なしは全てnull（推測での埋め合わせはしない）。
//
// 【重要】この関数はStage 2で取得した個別記事・イベントページ自身の本文の
// みに対して呼ばれる（fetchArticlePage.ts）。トップページの巡回
// （fetchSource.ts）には一切適用されないため、「トップページ上の別記事の
// 日付を誤認する」リスクは構造的に発生しない。

export type DateSource = 'json_ld' | 'meta' | 'time_tag' | 'body_label' | 'title_label' | 'url_path' | null
export type DateConfidence = 'high' | 'medium' | 'low' | null

export interface DateFieldResult {
  value: string | null
  source: DateSource
  confidence: DateConfidence
  rawMatch: string | null
}

// 会場名（venue）：日付と同じ「推測しない」原則を適用し、JSON-LD（Tier 1相当）
// からのみ取得する（2026-08-17、Source Coverage拡張）。本文中の自由テキストから
// 会場名らしき文字列を推測することはしない——誤った会場名を構造化データとして
// 保持するリスクの方が「取得できずnullのまま」より害が大きいと判断した。
export interface VenueFieldResult {
  value: string | null
  source: 'json_ld' | null
}

export interface StructuredDates {
  publishedAt: DateFieldResult
  updatedAt: DateFieldResult
  eventStartAt: DateFieldResult
  eventEndAt: DateFieldResult
  venue: VenueFieldResult
  jsonLdType: string | null
}

function empty(): DateFieldResult {
  return { value: null, source: null, confidence: null, rawMatch: null }
}

function emptyVenue(): VenueFieldResult {
  return { value: null, source: null }
}

// schema.org Event.location は文字列／Place（{name}）／配列のいずれもあり得る。
// 最初に見つかった文字列名のみを採用する（複数会場の列挙は今回のスコープ外）。
function extractLocationName(location: unknown): string | null {
  if (typeof location === 'string' && location.trim()) return location.trim()
  if (Array.isArray(location)) {
    for (const item of location) {
      const name = extractLocationName(item)
      if (name) return name
    }
    return null
  }
  if (location && typeof location === 'object') {
    const name = (location as Record<string, unknown>).name
    if (typeof name === 'string' && name.trim()) return name.trim()
  }
  return null
}

function toIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim())
      if (Array.isArray(parsed)) {
        blocks.push(...parsed)
      } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { '@graph'?: unknown[] })['@graph'])) {
        blocks.push(...((parsed as { '@graph': unknown[] })['@graph']))
      } else {
        blocks.push(parsed)
      }
    } catch {
      // 不正なJSON-LDは無視（推測で補完しない）
    }
  }
  return blocks
}

function findMetaContent(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(html)
    if (m?.[1]) return m[1]
  }
  return null
}

// --- Tier 3: ラベル付き本文日付抽出 ---
// フルHTMLパーサー・自然言語処理は使わない（v1スコープ、既存のextractLinks.ts
// 等と同じ「素朴な正規表現ベースで十分」という方針を踏襲）。

// 「会期」「開催期間」「期間」など、展覧会・イベント全体の会期を指すことが
// 明確なラベルを最優先とする（マロン指示、2026-08-17誤判定修正）。'期間'は
// 単独では「予約期間」等の無関係な用法もあり得るため最後に配置している
// （リスト順＝findLabeledRangeが試す優先順）。
const EVENT_RANGE_LABELS = ['開催期間', '会期', 'イベント期間', '催事期間', '開催日程', '期間']
// 「日時」「開催日」は範囲ではなく単一日付（＋時刻）を指すことが多いラベル
// だが、POLA MUSEUM ANNEXの実データで、ギャラリートーク等の**個別セッション**
// の日時をこのラベルで示しているページを展覧会全体の会期と誤認する事故が
// 発生した（2026-08-17）。このため、このラベル群は
// hasSessionIndicator（下記）でセッション性の兆候が見つかった場合は
// 一切使用しない（マロン指示：「トーク」「日時」「各回」「イベント」
// 「予約日時」等の複数日時を展覧会全体の会期として扱わない）。
const EVENT_SINGLE_OR_RANGE_LABELS = ['日時', '開催日', '開催概要']
const PUBLISHED_LABELS = ['公開日', '掲載日', '投稿日']
const UPDATED_LABELS = ['更新日', '最終更新日']

// ギャラリートーク・ワークショップ等、展覧会本体とは別の個別セッションの
// 日時であることを示す語（2026-08-17追加）。「日時」「開催日」ラベルの
// 近傍にこれらが見つかった場合、その日付は展覧会全体の会期を表さない
// 可能性が高いため採用しない（マロン指示、会期を特定できない場合は
// unknownを優先）。
const SESSION_INDICATOR_PATTERNS = [
  /トーク/,
  /ギャラリートーク/,
  /ワークショップ/,
  /セミナー/,
  /講演/,
  /各回/,
  /予約/,
  /定員/,
  /回目/,
  /[①②③④⑤]/,
]

function hasSessionIndicator(text: string): boolean {
  return SESSION_INDICATOR_PATTERNS.some((p) => p.test(text))
}

// "2026年8月5日" "2026/8/5" "2026.8.5" "8月5日" 等、曜日カッコの有無を許容。
// ドット区切り（"2026.8.5"）は2026-08-17に追加——実データ（SEIKO HOUSE等）で
// この表記が使われているケースを確認した。
const DATE_TOKEN =
  /(\d{4}年\d{1,2}月\d{1,2}日|\d{4}\/\d{1,2}\/\d{1,2}|\d{4}\.\d{1,2}\.\d{1,2}|\d{1,2}月\d{1,2}日)(?:[（(][月火水木金土日][）)])?/g

function stripTagsForBodySearch(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
}

function parseDateToken(token: string, fallbackYear: number | null): { iso: string; year: number } | null {
  let y: number, m: number, d: number
  const full =
    /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(token) ??
    /(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(token) ??
    /(\d{4})\.(\d{1,2})\.(\d{1,2})/.exec(token)
  if (full) {
    y = Number(full[1])
    m = Number(full[2])
    d = Number(full[3])
  } else {
    const short = /(\d{1,2})月(\d{1,2})日/.exec(token)
    if (!short || fallbackYear === null) return null
    y = fallbackYear
    m = Number(short[1])
    d = Number(short[2])
  }
  const date = new Date(Date.UTC(y, m - 1, d))
  if (Number.isNaN(date.getTime())) return null
  return { iso: date.toISOString(), year: y }
}

// ラベル出現位置から後方WINDOW文字以内にある日付トークンだけを対象にする
// （文書全体から拾うと無関係な日付を誤って掴む可能性があるため、ラベル直後の
// 近傍に限定する安全側の設計）。60→100に拡大（2026-08-17）——実データで
// ラベルと日付の間に「会場：〇〇　日時：」のような他の項目が挟まるケースを
// 確認したため。拡大しすぎると無関係な日付を拾うリスクが増すため、実データの
// 観察範囲に収まる程度の拡大に留めた。
const LABEL_WINDOW_CHARS = 100

function findLabeledRange(text: string, labels: string[]): { start: string; end: string; rawMatch: string } | null {
  for (const label of labels) {
    const idx = text.indexOf(label)
    if (idx === -1) continue
    const window = text.slice(idx, idx + label.length + LABEL_WINDOW_CHARS)
    const tokens = Array.from(window.matchAll(DATE_TOKEN)).map((m) => m[0])
    if (tokens.length < 2) continue

    const first = parseDateToken(tokens[0], null)
    if (!first) continue
    const second = parseDateToken(tokens[1], first.year)
    if (!second) continue

    // 2026-08-17、誤判定修正（マロン指示）：以前は終了日が開始日より前に
    // なる場合（年省略の短縮表記で年をまたぐ可能性）に自動的に+1年して
    // いたが、これは「年をまたぐことが明示されている場合のみ年跨ぎを
    // 認める」という原則に反する推測だった（POLA MUSEUM ANNEXで、
    // 無関係な2つのセッション日時を範囲として誤結合し2027年へ誤補正する
    // 事故が発生）。年が明示されたトークン同士なら終了日は既に正しい
    // 年で解決されているため、この時点でend<startになるのは「この2つの
    // トークンはそもそも同一範囲の開始・終了ではない」ことを意味する
    // ——自動補正せず、この抽出を諦める（unknownを優先）。
    if (new Date(second.iso).getTime() < new Date(first.iso).getTime()) {
      continue
    }

    return { start: first.iso, end: second.iso, rawMatch: window.trim() }
  }
  return null
}

// 「日時：」「開催日：」等、単日イベントを表すことが多いラベル向け。
// ラベル近傍に日付トークンが2つ見つかれば範囲（findLabeledRangeと同じ
// ロジック）、1つだけなら単日イベント（start=end=その日付）として扱う。
// 0個ならnull（推測しない）。
//
// 【2026-08-17、誤判定修正（マロン指示）】このラベル群（日時/開催日/
// 開催概要）は「トーク」「各回」「予約」等、個別セッションの日時を指す
// 文脈で使われることも多く、POLA MUSEUM ANNEXの実データでギャラリー
// トーク各回の日時を展覧会全体の会期と誤認する事故が発生した。
// hasSessionIndicatorでウィンドウ内にセッション性の兆候（トーク／各回／
// 予約／①②③等）が見つかった場合は、このラベルからの抽出を一切行わない
// （unknownを優先）。また、2トークン見つかったが終了日が開始日より前に
// なる場合（＝この2つのトークンは同一範囲の開始・終了ではない可能性が
// 高い）も、findLabeledRangeと同じ理由で自動補正・1トークンへの
// フォールバックいずれも行わず、この抽出自体を諦める
// （「本文に複数イベントの日付が混在し、会期を特定できなければunknown」
// というマロン指示に対応）。
function findLabeledEventDate(
  text: string,
  labels: string[],
): { start: string; end: string; rawMatch: string } | null {
  for (const label of labels) {
    const idx = text.indexOf(label)
    if (idx === -1) continue
    const window = text.slice(idx, idx + label.length + LABEL_WINDOW_CHARS)

    if (hasSessionIndicator(window)) continue

    const tokens = Array.from(window.matchAll(DATE_TOKEN)).map((m) => m[0])
    if (tokens.length === 0) continue

    const first = parseDateToken(tokens[0], new Date().getUTCFullYear())
    if (!first) continue

    if (tokens.length === 1) {
      return { start: first.iso, end: first.iso, rawMatch: window.trim() }
    }

    const second = parseDateToken(tokens[1], first.year)
    if (!second) {
      // 2つ目が解析できない場合は1つ目だけを単日として採用（推測はしないが、
      // 確実に読めた1つ目は無駄にしない）
      return { start: first.iso, end: first.iso, rawMatch: window.trim() }
    }

    if (new Date(second.iso).getTime() < new Date(first.iso).getTime()) {
      // 2つのトークンが同一範囲を構成しない可能性が高い——自動補正せず
      // このラベルからの抽出自体を諦める（推測よりunknownを優先）
      continue
    }

    return { start: first.iso, end: second.iso, rawMatch: window.trim() }
  }
  return null
}

// タイトル直近接の「開催」に紐づく日付（2026-08-17追加、Tier 3b）。
// 「8月1日（土）開催」のような、日本語の告知タイトルで極めて一般的な表現を
// 対象にする——ラベルという明示的手がかりの代わりに、"開催"という動詞に
// 直接隣接（前方20文字以内）する日付トークンのみを対象にすることで、
// 本文中に浮いているだけの無関係な日付を拾わないようにする（Tier 3の
// 「ラベルという明示的な文脈手がかりがある場合に限定する」原則の延長——
// "開催"への隣接自体を文脈手がかりとみなす）。単一日付のみ対象
// （複数日付が絡む範囲表現は本文側のTier 3a・3bに任せる）。
function findTitleAdjacentEventDate(titleText: string): { value: string; rawMatch: string } | null {
  const re = new RegExp(`${DATE_TOKEN.source}[^\\S\\n]{0,20}開催`, DATE_TOKEN.flags.replace('g', ''))
  const m = re.exec(titleText)
  if (!m) return null
  const parsed = parseDateToken(m[1], new Date().getUTCFullYear())
  if (!parsed) return null
  return { value: parsed.iso, rawMatch: m[0].trim() }
}

function findLabeledSingle(text: string, labels: string[]): { value: string; rawMatch: string } | null {
  for (const label of labels) {
    const idx = text.indexOf(label)
    if (idx === -1) continue
    const window = text.slice(idx, idx + label.length + LABEL_WINDOW_CHARS)
    const m = DATE_TOKEN.exec(window)
    DATE_TOKEN.lastIndex = 0
    if (!m) continue
    const parsed = parseDateToken(m[0], new Date().getUTCFullYear())
    if (!parsed) continue
    return { value: parsed.iso, rawMatch: window.trim() }
  }
  return null
}

export function extractStructuredDates(html: string): StructuredDates {
  const result: StructuredDates = {
    publishedAt: empty(),
    updatedAt: empty(),
    eventStartAt: empty(),
    eventEndAt: empty(),
    venue: emptyVenue(),
    jsonLdType: null,
  }

  // Tier 1: JSON-LD
  for (const block of extractJsonLdBlocks(html)) {
    if (!block || typeof block !== 'object') continue
    const obj = block as Record<string, unknown>

    if (!result.jsonLdType && typeof obj['@type'] === 'string') {
      result.jsonLdType = obj['@type'] as string
    }
    if (!result.publishedAt.value) {
      const v = toIso(obj.datePublished)
      if (v) result.publishedAt = { value: v, source: 'json_ld', confidence: 'high', rawMatch: null }
    }
    if (!result.updatedAt.value) {
      const v = toIso(obj.dateModified)
      if (v) result.updatedAt = { value: v, source: 'json_ld', confidence: 'high', rawMatch: null }
    }
    if (!result.eventStartAt.value) {
      const v = toIso(obj.startDate)
      if (v) result.eventStartAt = { value: v, source: 'json_ld', confidence: 'high', rawMatch: null }
    }
    if (!result.eventEndAt.value) {
      const v = toIso(obj.endDate)
      if (v) result.eventEndAt = { value: v, source: 'json_ld', confidence: 'high', rawMatch: null }
    }
    if (!result.venue.value) {
      const v = extractLocationName(obj.location)
      if (v) result.venue = { value: v, source: 'json_ld' }
    }
  }

  // Tier 2: meta / time要素
  if (!result.publishedAt.value) {
    const v = toIso(
      findMetaContent(html, [
        /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i,
        /<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i,
      ]),
    )
    if (v) result.publishedAt = { value: v, source: 'meta', confidence: 'high', rawMatch: null }
  }
  if (!result.publishedAt.value) {
    const timeMatch =
      /<time[^>]*itemprop=["']datePublished["'][^>]*datetime=["']([^"']+)["']/i.exec(html) ??
      /<time[^>]*datetime=["']([^"']+)["'][^>]*itemprop=["']datePublished["']/i.exec(html)
    if (timeMatch?.[1]) {
      const v = toIso(timeMatch[1])
      if (v) result.publishedAt = { value: v, source: 'time_tag', confidence: 'high', rawMatch: null }
    }
  }
  if (!result.updatedAt.value) {
    const v = toIso(
      findMetaContent(html, [
        /<meta[^>]+property=["']article:modified_time["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:modified_time["']/i,
        /<meta[^>]+itemprop=["']dateModified["'][^>]+content=["']([^"']+)["']/i,
      ]),
    )
    if (v) result.updatedAt = { value: v, source: 'meta', confidence: 'high', rawMatch: null }
  }

  // Tier 3: 本文中のラベル付き日付（残っているフィールドのみ）
  const needsBodyTier =
    !result.publishedAt.value || !result.updatedAt.value || !result.eventStartAt.value || !result.eventEndAt.value
  if (needsBodyTier) {
    const bodyText = stripTagsForBodySearch(html)

    if (!result.eventStartAt.value || !result.eventEndAt.value) {
      const range = findLabeledRange(bodyText, EVENT_RANGE_LABELS)
      if (range) {
        if (!result.eventStartAt.value) {
          result.eventStartAt = { value: range.start, source: 'body_label', confidence: 'medium', rawMatch: range.rawMatch }
        }
        if (!result.eventEndAt.value) {
          result.eventEndAt = { value: range.end, source: 'body_label', confidence: 'medium', rawMatch: range.rawMatch }
        }
      }
    }
    // Tier 3a拡張：「日時」「開催日」等の単日/範囲混在ラベル（2026-08-17追加）
    if (!result.eventStartAt.value || !result.eventEndAt.value) {
      const single = findLabeledEventDate(bodyText, EVENT_SINGLE_OR_RANGE_LABELS)
      if (single) {
        if (!result.eventStartAt.value) {
          result.eventStartAt = { value: single.start, source: 'body_label', confidence: 'medium', rawMatch: single.rawMatch }
        }
        if (!result.eventEndAt.value) {
          result.eventEndAt = { value: single.end, source: 'body_label', confidence: 'medium', rawMatch: single.rawMatch }
        }
      }
    }
    // Tier 3b：タイトル中の「〜開催」に直接隣接する日付（2026-08-17追加）
    if (!result.eventStartAt.value) {
      const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
      if (titleMatch) {
        const titleText = stripTagsForBodySearch(titleMatch[1])
        const titleDate = findTitleAdjacentEventDate(titleText)
        if (titleDate) {
          result.eventStartAt = { value: titleDate.value, source: 'title_label', confidence: 'low', rawMatch: titleDate.rawMatch }
          if (!result.eventEndAt.value) {
            result.eventEndAt = { value: titleDate.value, source: 'title_label', confidence: 'low', rawMatch: titleDate.rawMatch }
          }
        }
      }
    }
    if (!result.publishedAt.value) {
      const single = findLabeledSingle(bodyText, PUBLISHED_LABELS)
      if (single) {
        result.publishedAt = { value: single.value, source: 'body_label', confidence: 'medium', rawMatch: single.rawMatch }
      }
    }
    if (!result.updatedAt.value) {
      const single = findLabeledSingle(bodyText, UPDATED_LABELS)
      if (single) {
        result.updatedAt = { value: single.value, source: 'body_label', confidence: 'medium', rawMatch: single.rawMatch }
      }
    }
  }

  return result
}
