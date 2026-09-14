// GINZA WHISKERS / Project 02（2026-09-03、第一投稿遅延の是正 — 改善対象2）
// 公式ページ本文からの決定的な事実抽出（サイト別アダプタ・正規表現のみ・AI なし）。
//
// 【厳守】
//   ・**公式ページ本文に明記された文字列だけ**を拾う。推測補完しない。
//   ・抽出できないものは null（＝ArticleFacts で人間が入力）。
//   ・confirmed にできるのは「対象イベント名と同じ本文領域から取れた」ときだけ。
//     関連記事・一覧・別イベントの近くから取れた値は confirmed にしない。
//   ・HTML を実行・評価しない（呼び出し側が渡すタグ除去済みテキストのみ）。
//   ・1ページに複数記事が並ぶサイト（ginza6.tokyo）は body 抽出しない
//     （別記事混入リスクのため。日付は JSON-LD のみに委ねる）。

export type ExtractConfidence = 'confirmed' | 'unconfirmed'

export interface ExtractedFact<T = string> {
  value: T | null
  confidence: ExtractConfidence
  rawMatch: string | null
  /** どのアダプタ・どの手掛かりで取ったか */
  method: string
}

export interface OfficialEventFacts {
  host: string
  adapter: 'tsutaya-ginza' | 'none'
  /** 抽出に使った対象イベント名（近傍照合のキー） */
  targetEventName: string | null
  /** 対象イベント名が本文に現れたか（照合の前提） */
  targetNameFoundInBody: boolean
  eventDateDisplay: ExtractedFact
  eventStartIso: ExtractedFact
  eventEndIso: ExtractedFact
  eventTime: ExtractedFact
  venuePlace: ExtractedFact
  paid: ExtractedFact<'free' | 'paid'>
  /** 本文に「応募」「公募」「抽選」等があり applyRequired=yes の疑いがあるか（弱いシグナル） */
  applyRequiredHint: ExtractedFact<'yes' | 'no'>
  /** 公式本文に明記された「何が行われるか」の概要（1〜2文・近傍・推測補完なし） */
  whatHappens: ExtractedFact
  /** 最終日時間変更・休業・注意事項など、公式本文に明記された補足（改行区切り。無ければ null） */
  officialInfoNote: ExtractedFact
  /** イベント名・施設名・銀座関連語から機械生成したハッシュタグ候補（人間確認待ち・confirmed にしない） */
  hashtagCandidates: string[]
}

const NONE = (method: string): ExtractedFact => ({ value: null, confidence: 'unconfirmed', rawMatch: null, method })

function hostOf(url: string | null | undefined): string {
  try {
    return new URL(url ?? '').hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** タイトルからサイトナビ由来のノイズ（" | " 以降）を落とし、素の展示名にする */
export function cleanEventName(title: string | null | undefined): string | null {
  if (!title) return null
  let t = title.split(/\s*\|\s*/)[0]
  t = t.replace(/\s*[–—-]\s*GINZA SIX.*$/i, '')
  t = t.replace(/\s*@\s*銀座\s*蔦屋書店\s*$/i, '')
  t = t.trim()
  return t || null
}

/** 和暦なし西暦の日付レンジ "2026年08月28日(金) - 09月06日(日)" / "…〜…" / "…～…" */
const DATE_SEP = '[-–—~〜～]'
const TSUTAYA_DATE_RE = new RegExp(
  `(\\d{4})年\\s*(\\d{1,2})月\\s*(\\d{1,2})日\\s*[（(][日月火水木金土][）)]\\s*${DATE_SEP}\\s*(?:(\\d{4})年\\s*)?(\\d{1,2})月\\s*(\\d{1,2})日\\s*[（(][日月火水木金土][）)]`,
)

function toIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  const iso = `${y}-${mm}-${dd}T00:00:00.000Z`
  return Number.isNaN(new Date(iso).getTime()) ? null : iso
}

/** 対象イベント名の最初の出現位置から前後 window 文字を切り出す（近傍照合用） */
function nearWindow(body: string, name: string | null, before = 400, after = 1200): string {
  if (!name) return body.slice(0, before + after)
  const idx = body.indexOf(name)
  if (idx < 0) return ''
  return body.slice(Math.max(0, idx - before), idx + name.length + after)
}

export interface ExtractOfficialEventFactsInput {
  articleUrl: string | null | undefined
  title: string | null | undefined
  bodyText: string | null | undefined
}

export function extractOfficialEventFacts(
  input: ExtractOfficialEventFactsInput,
): OfficialEventFacts {
  const host = hostOf(input.articleUrl)
  const targetEventName = cleanEventName(input.title)
  const body = (input.bodyText ?? '').trim()

  const empty: OfficialEventFacts = {
    host,
    adapter: 'none',
    targetEventName,
    targetNameFoundInBody: false,
    eventDateDisplay: NONE('adapter なし'),
    eventStartIso: NONE('adapter なし'),
    eventEndIso: NONE('adapter なし'),
    eventTime: NONE('adapter なし'),
    venuePlace: NONE('adapter なし'),
    paid: NONE('adapter なし') as ExtractedFact<'free' | 'paid'>,
    applyRequiredHint: NONE('adapter なし') as ExtractedFact<'yes' | 'no'>,
    whatHappens: NONE('adapter なし'),
    officialInfoNote: NONE('adapter なし'),
    hashtagCandidates: [],
  }

  // 1ページに複数記事が並ぶサイトは body 抽出しない（別記事混入防止）
  if (host === 'ginza6.tokyo' || host === 'ginza.jp') {
    return { ...empty, adapter: 'none' }
  }

  if (host !== 'store.tsite.jp' || !body) {
    return empty
  }

  // --- store.tsite.jp（銀座 蔦屋書店）アダプタ ---
  const nameFound = !!targetEventName && body.includes(targetEventName)
  // ページ末尾の「RELATED EVENT / RELATED ITEMS / 一覧に戻る」以降は別イベント・関連商品。
  // ここを落としてから抽出する（別記事の日付・価格を拾わない）。
  const tailIdx = (() => {
    const marks = ['一覧に戻る', 'RELATED EVENT', 'RELATED ITEMS', 'メルマガ登録はこちら']
    let min = body.length
    for (const m of marks) {
      const i = body.indexOf(m)
      if (i > 0 && i < min) min = i
    }
    return min
  })()
  const mainBody = body.slice(0, tailIdx)
  // 対象イベント名の近傍 + 「＜展示情報＞」ブロック + ラベル付きメタ（会期/時間/場所）を見る
  const infoIdx = mainBody.search(/[＜<]\s*展示情報\s*[＞>]|＜展覧会情報＞|＜イベント情報＞/)
  const infoBlock = infoIdx >= 0 ? mainBody.slice(infoIdx, infoIdx + 1400) : ''
  const scope = [nameFound ? nearWindow(mainBody, targetEventName) : '', infoBlock].join('\n')
  const scopeForConfidence = scope || mainBody.slice(0, 2000)

  const out: OfficialEventFacts = {
    host,
    adapter: 'tsutaya-ginza',
    targetEventName,
    targetNameFoundInBody: nameFound,
    eventDateDisplay: NONE('tsutaya: 日付レンジ未検出'),
    eventStartIso: NONE('tsutaya: 日付レンジ未検出'),
    eventEndIso: NONE('tsutaya: 日付レンジ未検出'),
    eventTime: NONE('tsutaya: 時刻表記なし'),
    venuePlace: NONE('tsutaya: 会場行なし'),
    paid: NONE('tsutaya: 料金表記なし') as ExtractedFact<'free' | 'paid'>,
    applyRequiredHint: {
      value: 'no',
      confidence: 'unconfirmed',
      rawMatch: null,
      method: 'tsutaya: 既定（応募・抽選表記が無ければ no 想定・要人間確認）',
    },
    whatHappens: NONE('tsutaya: 概要文なし'),
    officialInfoNote: NONE('tsutaya: 注意事項なし'),
    hashtagCandidates: [],
  }

  // 会期（近傍/情報ブロック優先。無ければ mainBody から。related tail は既に除外済み）
  const dm =
    TSUTAYA_DATE_RE.exec(scope) ??
    // ラベル付きメタ「会期\n2026年8月28日(金) - 2026年9月6日(日)」
    TSUTAYA_DATE_RE.exec((mainBody.match(/会期[\s\S]{0,60}/) ?? [''])[0]) ??
    // 「■期間：2026年8月28日（金）～9月6日（日）」
    TSUTAYA_DATE_RE.exec((mainBody.match(/[■□]?\s*期間[：:][\s\S]{0,60}/) ?? [''])[0]) ??
    TSUTAYA_DATE_RE.exec(mainBody)
  if (dm) {
    const inScope = (!!scope && scope.includes(dm[0])) || mainBody.includes(dm[0])
    const y1 = Number(dm[1])
    const m1 = Number(dm[2])
    const d1 = Number(dm[3])
    const y2 = dm[4] ? Number(dm[4]) : y1
    const m2 = Number(dm[5])
    const d2 = Number(dm[6])
    const startIso = toIso(y1, m1, d1)
    const endIso = toIso(y2, m2, d2)
    const conf: ExtractConfidence = inScope && nameFound ? 'confirmed' : 'unconfirmed'
    const wd = ['日', '月', '火', '水', '木', '金', '土']
    const disp =
      startIso && endIso
        ? `${y1}年${m1}月${d1}日（${wd[new Date(startIso).getUTCDay()]}）〜${y2 !== y1 ? `${y2}年` : ''}${m2}月${d2}日（${wd[new Date(endIso).getUTCDay()]}）`
        : null
    out.eventDateDisplay = { value: disp, confidence: conf, rawMatch: dm[0], method: 'tsutaya: 本文の日付レンジ表記' }
    out.eventStartIso = { value: startIso, confidence: conf, rawMatch: dm[0], method: 'tsutaya: 本文の日付レンジ表記' }
    out.eventEndIso = { value: endIso, confidence: conf, rawMatch: dm[0], method: 'tsutaya: 本文の日付レンジ表記' }
  }

  // 会場：ラベル付き「場所\n銀座 蔦屋書店 ART IN CABINET」or「■会場：銀座 蔦屋書店 …」を優先
  const venLabel =
    (mainBody.match(/場所[\s　]*\n?[\s　]*(銀座\s*蔦屋書店[^\n。]{0,40})/) ??
      mainBody.match(/[■□]?\s*会場[：:][\s　]*(銀座\s*蔦屋書店[^\n。]{0,40})/) ??
      scope.match(/(銀座\s*蔦屋書店[\s　]*[「『][^」』\n]{1,30}[」』])/))?.[1]
  if (venLabel) {
    let v = venLabel.trim().replace(/\s+/g, ' ')
    v = v.replace(/[「『]/g, '').replace(/[」』].*$/, '').replace(/にて開催.*$/, '').trim()
    v = v.replace(/\s+/g, ' ')
    const place = /GINZA SIX/i.test(v) ? v : `${v}（GINZA SIX 6F）`
    out.venuePlace = {
      value: place,
      confidence: mainBody.includes(venLabel) ? 'confirmed' : 'unconfirmed',
      rawMatch: venLabel.trim().slice(0, 80),
      method: 'tsutaya: ラベル付き会場（場所 / ■会場：）',
    }
  }

  // 新形式：会期／時間／場所／主催 の枠内「場所」がフロア・売り場名のみ（例「文具売り場」）→ 店舗名を補って会場に
  if (!out.venuePlace.value && infoIdx < 0) {
    const metaB = (mainBody.match(/会期[\s\S]{0,500}?問い合わせ先[\s\S]{0,60}/) ?? [''])[0]
    if (/会期/.test(metaB) && /主催/.test(metaB) && /問い合わせ先/.test(metaB)) {
      const fl = metaB.match(/場所\s*\n?\s*([^\n]{1,24})/)
      if (fl && fl[1].trim() && !/銀座\s*蔦屋書店/.test(fl[1])) {
        out.venuePlace = {
          value: `銀座 蔦屋書店 ${fl[1].trim()}（GINZA SIX 6F）`,
          confidence: nameFound ? 'confirmed' : 'unconfirmed',
          rawMatch: `場所 ${fl[1].trim()}`,
          method: 'tsutaya: イベント情報ラベル枠の「場所」（フロア・売り場）＋店舗名（銀座 蔦屋書店＝GINZA SIX 6F）',
        }
      }
    }
  }

  // 料金：「★入場無料」「入場無料」等の明示（related tail は除外済みの mainBody で判定）
  if (/★?\s*入場無料|観覧無料|入場料[：:]?\s*無料|鑑賞無料|入場は無料/.test(mainBody)) {
    const rm = (mainBody.match(/[^\n]{0,8}(?:入場無料|観覧無料|鑑賞無料|入場は無料)[^\n]{0,8}/) ?? ['入場無料'])[0]
    out.paid = {
      value: 'free',
      confidence: 'confirmed',
      rawMatch: rm.trim(),
      method: 'tsutaya: 本文に「入場無料」の明示',
    }
  }

  // 時刻（2026-09-03 修正）：
  //   ・基準時刻は **イベント情報ブロック（＜展示情報＞…）の「営業時間：HH:MM〜HH:MM」だけ**を採用する。
  //     このブロックは対象イベントの ■期間・■会場・★入場無料 と同じブロックで、時刻もイベント固有。
  //   ・蔦屋 CMS 共通の「時間」ラベル（例：時間 10：30〜21：00）は **店舗共通営業時間**なので採用しない。
  //   ・「※最終日は HH:MM 終了予定」は最終日メモとして別に拾い、基準時刻へ付記する。
  //   ・confirmed 条件（3つすべて）：
  //       (a) 対象記事本文（mainBody・RELATED 除外済み）に明記されている
  //       (b) イベント情報ブロック内にあり、同ブロックに ■期間 と ■会場/場所 がある（会期・会場と同ブロック）
  //       (c) 別記事・店舗共通「時間」ラベル由来ではない（(b) を満たせば構造上除外される）
  const infoHasPeriod = /[■□]?\s*期間[：:]|会期[\s　]/.test(infoBlock)
  const infoHasVenue = /[■□]?\s*会場[：:]|場所[\s　]/.test(infoBlock)
  const bizHours = infoBlock.match(
    /営業時間[：:]?\s*(\d{1,2})[:：](\d{2})\s*[-–—~〜～]\s*(\d{1,2})[:：](\d{2})/,
  )

  // 新しめの蔦屋イベントページ（＜展示情報＞ブロックが無く、「会期／時間／場所／主催／問い合わせ先」の
  // ラベル枠を持つ形式）。主催・問い合わせ先を伴う＝当該イベント固有のメタ情報なので「時間」を採用する。
  // 旧形式（＜展示情報＞＋「営業時間：」）は infoBlock を持つため、ここには入らない（#310 は無影響）。
  const metaBlock = infoIdx < 0 ? (mainBody.match(/会期[\s\S]{0,500}?問い合わせ先[\s\S]{0,60}/) ?? [''])[0] : ''
  const metaHasEventOwnFields =
    !!metaBlock && /会期/.test(metaBlock) && /場所/.test(metaBlock) && /主催/.test(metaBlock) && /問い合わせ先/.test(metaBlock)
  const metaTime = metaHasEventOwnFields
    ? metaBlock.match(/時間\s*\n?\s*(\d{1,2})[:：](\d{2})\s*[-–—~〜～]\s*(\d{1,2})[:：](\d{2})/)
    : null
  // 「※最終日は 19:00 終了予定」形（時刻あり）を最終日メモとして拾う
  const lastDayTime = mainBody.match(/最終日は?\s*(\d{1,2})[:：](\d{2})\s*(?:終了|閉場|閉館|まで)/)
  const fmt = (h: string, m: string) => `${Number(h)}時${m === '00' ? '' : m + '分'}`
  if (bizHours && nameFound && infoHasPeriod && infoHasVenue) {
    let val = `${fmt(bizHours[1], bizHours[2])}から${fmt(bizHours[3], bizHours[4])}まで`
    if (lastDayTime) {
      const end = out.eventEndIso.value ? new Date(out.eventEndIso.value) : null
      const endLabel =
        end && !Number.isNaN(end.getTime())
          ? `最終日（${end.getUTCMonth() + 1}月${end.getUTCDate()}日）`
          : '最終日'
      val += `（${endLabel}は${fmt(lastDayTime[1], lastDayTime[2])}終了予定）`
    }
    out.eventTime = {
      value: val,
      confidence: 'confirmed',
      rawMatch: (bizHours[0] + (lastDayTime ? ` / ${lastDayTime[0]}` : '')).slice(0, 100),
      method:
        'tsutaya: ＜展示情報＞ブロックの「営業時間：」（■期間・■会場と同ブロック）＋「※最終日…終了予定」。店舗共通の「時間」ラベル（10:30 等）は不採用',
    }
  } else if (metaTime && nameFound) {
    // 新形式：会期／時間／場所／主催／問い合わせ先 の枠内の「時間」は当該イベント固有のメタ情報
    let val = `${fmt(metaTime[1], metaTime[2])}から${fmt(metaTime[3], metaTime[4])}まで`
    if (lastDayTime) {
      const end = out.eventEndIso.value ? new Date(out.eventEndIso.value) : null
      const endLabel =
        end && !Number.isNaN(end.getTime()) ? `最終日（${end.getUTCMonth() + 1}月${end.getUTCDate()}日）` : '最終日'
      val += `（${endLabel}は${fmt(lastDayTime[1], lastDayTime[2])}終了予定）`
    }
    out.eventTime = {
      value: val,
      confidence: 'confirmed',
      rawMatch: metaTime[0].slice(0, 100),
      method:
        'tsutaya: イベント情報ラベル枠（会期／時間／場所／主催／問い合わせ先）の「時間」。主催・問い合わせ先を伴う当該イベント固有のメタ情報（店舗共通バナーではない）',
    }
  } else {
    // 情報ブロックにイベント固有の営業時間が無い → 店舗共通の「時間」ラベルしか無いので採用しない
    const storeGeneric = mainBody.match(/(?<![営])時間[\s　\n]{0,3}(\d{1,2})[:：](\d{2})\s*[-–—~〜～]\s*(\d{1,2})[:：](\d{2})/)
    if (storeGeneric || bizHours) {
      out.eventTime = {
        value: null,
        confidence: 'unconfirmed',
        rawMatch: (storeGeneric ?? bizHours ?? [''])[0]?.toString().trim().slice(0, 80) || null,
        method: bizHours
          ? 'tsutaya: 「営業時間：」はあるが ■期間/■会場と同ブロックで確認できず — 人間が確認'
          : 'tsutaya: 開催時間はイベント情報ブロックに明記されず（本文の「時間」ラベルは店舗共通営業時間のため不採用）— 人間が確認',
      }
    }
  }

  // 応募・抽選の弱いシグナル（applyRequired 判断は人間。ここは hint のみ）
  if (/公募|作品募集|応募要項|エントリー受付|抽選(?:で|の上|制)/.test(scopeForConfidence)) {
    out.applyRequiredHint = {
      value: 'yes',
      confidence: 'unconfirmed',
      rawMatch: (scopeForConfidence.match(/[^\n。]{0,12}(?:公募|作品募集|応募要項|エントリー受付|抽選)[^\n。]{0,12}/) ?? [''])[0].trim() || null,
      method: 'tsutaya: 本文に応募・抽選表現（applyRequired=yes の疑い・要人間確認）',
    }
  }

  // whatHappens（概要）：本文で「〜開催いたします。／〜展示します。」等で終わる文の、
  // その終端の直前 最大160字（＝概要本体。先頭のナビ・タイトル連結は含めない）。
  // WS・先行販売・絵本・SNS 等を含む文は除外（未確認・別情報を本文に出さないため）。
  {
    const introRegion = mainBody
      .split(/[＜<]\s*(?:展示情報|展覧会情報|イベント情報)\s*[＞>]|＜[^＞>\n]{0,12}プロフィール\s*[＞>]/)[0]
      .replace(/\n+/g, ' ')
    const EXCLUDE = /ワークショップ|先行販売|発売予定|絵本|インスタ|アカウント|@|SNS|ご在廊|お問合せ|お問い合わせ|メルマガ|プロフィール/
    const m = introRegion.match(
      /([^。！\n]{16,160}?)((?:開催いたします|開催します|開催中です|開催予定です|展示します|展示いたします|展示販売します|ご紹介します|ご紹介いたします|お披露目します))。/,
    )
    if (m && nameFound) {
      const sentence = (m[1] + m[2] + '。').replace(/^[\s　、,]+/, '').trim()
      if (!EXCLUDE.test(sentence) && sentence.length >= 18) {
        out.whatHappens = {
          value: sentence,
          confidence: 'confirmed',
          rawMatch: sentence.slice(0, 120),
          method: 'tsutaya: 本文の「〜開催いたします。」で終わる概要文（終端直前160字・WS/先行販売等は除外）',
        }
      }
    }
    // フォールバック（新形式の販売フェア等で「〜開催いたします。」型が無い場合）：
    // リード段落（[商品紹介]/[ワークショップ]/【購入特典/■ より前）の先頭数文を概要に。
    // WS・完売・先行販売・SNS を含む文は必ず除外。ナビ由来の「| … |」行も除外。
    if (!out.whatHappens.value && nameFound) {
      const leadZone = introRegion.split(/\[\s*商品紹介\s*\]|\[\s*ワークショップ\s*\]|【\s*購入特典|■/)[0] ?? ''
      const WS_EXCLUDE = /ワークショップ|体験会|先行販売|発売予定|絵本|インスタ|アカウント|@|SNS|メルマガ|プロフィール|完売|定員|申込|お申込み|抽選|参加費|要予約|特典/
      const sentences = leadZone
        .replace(/^[\s\S]*?メインコンテンツへ移動/, '')
        .split(/(?<=。)/)
        .map((x) => x.trim())
        .filter((x) => x && /。$/.test(x) && x.length >= 8 && !WS_EXCLUDE.test(x) && !/[｜|]/.test(x))
      let acc = ''
      for (const sen of sentences) {
        if ((acc + sen).length > 170) break
        acc += sen
      }
      if (acc.length >= 16) {
        out.whatHappens = {
          value: acc,
          confidence: 'confirmed',
          rawMatch: acc.slice(0, 120),
          method: 'tsutaya: リード段落の先頭数文（[商品紹介]等より前・WS/完売/先行販売/SNS/特典を含む文は除外）',
        }
      }
    }
  }

  // officialInfoNote（注意事項）：最終日時間変更・休業・注意 の明記だけ拾う。無ければ null。
  const notes: string[] = []
  const lastDay = mainBody.match(/※?\s*最終日は?[^。\n]{0,24}(?:終了|閉場|閉館|まで)[^。\n]{0,10}/)
  if (lastDay) notes.push(lastDay[0].replace(/^※\s*/, '').trim())
  const closedDay = mainBody.match(/(?:休業日|休館日|定休日|休廊日)[：:]?[^。\n]{0,40}/)
  if (closedDay) notes.push(closedDay[0].trim())
  const caution = mainBody.match(/※[^。\n]{4,60}(?:ご注意|ご了承|変更|中止|の場合があ)[^。\n]{0,10}/)
  if (caution && !/画像|写真は|イメージ/.test(caution[0])) notes.push(caution[0].replace(/^※\s*/, '').trim())
  if (notes.length > 0) {
    out.officialInfoNote = {
      value: [...new Set(notes)].join('\n'),
      confidence: 'confirmed',
      rawMatch: notes.join(' / ').slice(0, 120),
      method: 'tsutaya: 本文の注意事項（最終日変更・休業・注意）',
    }
  }

  // hashtagCandidates：イベント名＋施設名＋銀座関連語（機械生成・人間確認待ち・confirmed にしない）
  {
    const cands = new Set<string>()
    cands.add('#銀座')
    if (/蔦屋書店/.test(scopeForConfidence) || /蔦屋書店/.test(mainBody)) {
      cands.add('#銀座蔦屋書店')
      cands.add('#GINZASIX')
    }
    if (out.venuePlace.value && /ART IN CABINET/i.test(out.venuePlace.value)) cands.add('#ARTINCABINET')
    // 「作家名個展『作品名』」から作家名/作品名を機械抽出（かぎ括弧・個展/展の語のみ・推測しない）
    if (targetEventName) {
      const kagi = targetEventName.match(/[『「]([^』」]{2,20})[』」]/)
      if (kagi) cands.add(`#${kagi[1].replace(/\s+/g, '')}`)
      // 「<作家名>個展…」→ #<作家名>個展 ／ 「<作家名>展…」→ #<作家名>展
      const koten = targetEventName.match(/^([^\s　『「]{2,10}?)個展/)
      if (koten) cands.add(`#${koten[1]}個展`)
      else {
        const ten = targetEventName.match(/^([^\s　『「]{2,10}?)展(?:[\s　『「]|$)/)
        if (ten) cands.add(`#${ten[1]}展`)
      }
    }
    // 本文中の「ハッシュタグ：#xxx」表記があればそれも候補に（公式が挙げているもの）
    const bodyTag = mainBody.match(/ハッシュタグ[：:]\s*(#[^\s　\n]+)/)
    if (bodyTag) cands.add(bodyTag[1])
    out.hashtagCandidates = [...cands].slice(0, 6)
  }

  return out
}
