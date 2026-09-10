// GINZA WHISKERS / Project 02（2026-09-10）— note 転記の共通クリーン化・検査（純粋・AI/DB なし）。
//
// 2026-09-10 の 100円 note 公開トライアル（Article #60）で判明した課題を恒久反映する。
// 目的：マロンの作業を「本文貼り付け・画像配置・有料ライン設定・最終公開判断」程度に減らし、
//       誤記・二重貼り付け・不要文字列・設定漏れを自動検出する。
//
// ここは buildNoteDraftPackage.ts から使う純粋関数だけを置く（循環回避のため
// テキスト系の共有ヘルパーもここへ集約し、buildNoteDraftPackage.ts が再エクスポートする）。

import type { NightValidationFinding } from './types'

// ───────────────────────── テキスト系 共有ヘルパー ─────────────────────────

export const HASHTAG_RE = /#[^\s#、。，．,.]+/g
/** テキスト全体がハッシュタグ（＋空白）だけで構成される行 */
const HASHTAG_ONLY_RE = /^\s*#[^\s#、。，．,.]+(?:\s+#[^\s#、。，．,.]+)*\s*$/

/** 旧・汎用文（商品・店舗）。後方互換のため残すが caption には使わない。 */
export const HERO_IMAGE_CAPTION =
  '※画像は記事内容をもとに生成したイメージです。実際の商品・店舗とは異なる場合があります。'

/** 記事本文に挿絵注釈が無い場合の既定（汎用文へ巻き戻さない）。 */
export const DEFAULT_ILLUSTRATION_CAPTION =
  '※画像は記事内容をもとに生成したイメージです。実際の展示作品・会場とは異なります。'

/** テキストがハッシュタグだけの行か（本文から除去する対象） */
export function isHashtagOnlyText(t: string | null | undefined): boolean {
  const s = (t ?? '').trim()
  return s.length > 1 && HASHTAG_ONLY_RE.test(s)
}

/** 「ハッシュタグ」だけの見出しか（本文から除去する対象） */
export function isHashtagHeading(tag: string, t: string | null | undefined): boolean {
  return (tag === 'h2' || tag === 'h3') && (t ?? '').trim() === 'ハッシュタグ'
}

export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of text.matchAll(HASHTAG_RE)) {
    const tag = m[0].trim()
    if (tag.length > 1 && !seen.has(tag)) {
      seen.add(tag)
      out.push(tag)
    }
  }
  return out
}

/**
 * 記事本文（見出し・段落テキストの配列）から「挿絵注釈」を取り出す。
 * ・「挿絵注釈」見出しの直後の段落、または
 * ・「※画像は記事内容をもとに生成したイメージ…」で始まる行
 * を記事固有 caption として優先。無ければ null。
 */
export function extractIllustrationCaption(units: string[]): string | null {
  for (let i = 0; i < units.length; i++) {
    const u = (units[i] ?? '').trim()
    if (u === '挿絵注釈' || u === '挿絵注釈について') {
      const next = (units[i + 1] ?? '').trim()
      if (next) return next
    }
    if (/^※\s*画像は記事内容をもとに生成した/.test(u)) return u
  }
  return null
}

/** editorialProvenance から confirmed の出典 URL だけを重複排除して返す */
export function confirmedSourceUrls(
  prov: { sourceUrl?: string | null; verificationStatus?: string | null }[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of prov) {
    const url = String(p?.sourceUrl ?? '').trim()
    if (!url) continue
    if ((p?.verificationStatus ?? '') !== 'confirmed') continue
    if (seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

/**
 * 読者向け本文に実際に載っている出典 URL を、出現順で重複排除して返す。
 * links.sourceUrls は「読者に見える出典」と一致させる。confirmed でも本文に
 * 載せていない社内確認用 URL（営業時間ページ等）はここに含めない。
 */
export function bodySourceUrls(bodyText: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of bodyText.matchAll(/https?:\/\/[^\s、。「」（）()<>"']+/g)) {
    const url = m[0].replace(/[.,)）」】]+$/, '').trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

// ───────────────────────── 1. note 転記本文のクリーン化 ─────────────────────────

/** マストヘッド固定文の行（composeNoteBodyWithMasthead が冒頭へ1回だけ足すので本文中は除去） */
const MASTHEAD_LINES = new Set([
  'GINZA TIME EDIT',
  'by GINZA WHISKERS',
  '400年の銀座を、今日の私へ。',
  '新しい店、季節の味、アート、舞台、街に残る小さな物語。銀座の過去、現在、未来を紡ぎながら、「今、この銀座に出会う理由」をGINZA WHISKERSの編集視点で届けます。',
  '次の銀ブラに、私だけの銀座時間を。',
])

export interface BodyBlock {
  tag: string
  text: string
}
export interface SanitizeResult {
  /** note 本文へ貼り付けてよいブロック（見出し情報を保持） */
  kept: BodyBlock[]
  /** 除去したブロック（理由つき。転記前チェックで表示） */
  removed: { reason: string; text: string }[]
}

/**
 * CMS 本文ブロック列から「note 本文へ貼り付けてよい文章」だけを残す。
 * 除去対象：タイトル行／ハッシュタグ行・見出し／`[IMAGE: …]` マーカー／画像ファイルパス／
 * 「ここから有料エリア（100円）」等の仮表示／装飾だけの区切り線／内部運用メモ
 * （`[マロン具体化]`・`lane=paid_100`・`想定価格：`・`再利用元：`・マストヘッド付与メモ・
 * `Same-day Review`）／「注意事項」セクション全体／重複マストヘッド行。
 */
export function sanitizeNoteBodyUnits(
  blocks: BodyBlock[],
  opts: { articleTitle?: string | null } = {},
): SanitizeResult {
  const kept: BodyBlock[] = []
  const removed: { reason: string; text: string }[] = []
  const title = (opts.articleTitle ?? '').trim()

  let inChuiji = false // 「注意事項」見出し以降、次の見出しまでを落とす

  for (const b of blocks) {
    const tag = b.tag
    const text = (b.text ?? '').trim()
    if (!text) continue
    const isHeading = tag === 'h2' || tag === 'h3'

    if (inChuiji) {
      if (isHeading) {
        inChuiji = false // 次の見出しで解除（この見出し自体は下の判定へ）
      } else {
        removed.push({ reason: 'chuiji-section', text })
        continue
      }
    }

    if (isHeading && (text === '注意事項' || text === '内部メモ' || text === '編集メモ')) {
      removed.push({ reason: 'chuiji-section', text })
      inChuiji = true
      continue
    }
    if (MASTHEAD_LINES.has(text)) {
      removed.push({ reason: 'masthead-line', text })
      continue
    }
    if (title && text === title) {
      removed.push({ reason: 'title-line', text })
      continue
    }
    if (/\[IMAGE:[^\]]*\]/.test(text) || /^\[(画像|IMG)[:：]/.test(text)) {
      removed.push({ reason: 'image-marker', text })
      continue
    }
    if (/^(\.\/)?(media|cms\/|src\/)[\w./-]+$/.test(text) || /^[\w./-]+\.(jpe?g|png|webp|gif|svg)$/i.test(text)) {
      removed.push({ reason: 'file-path', text })
      continue
    }
    if (/ここから有料エリア/.test(text) || (/有料エリア/.test(text) && /[―—\-]{2,}/.test(text))) {
      removed.push({ reason: 'fake-paywall-marker', text })
      continue
    }
    if (
      /note\s*(上)?で(この位置に)?有料ライン/.test(text) ||
      /有料ライン.{0,12}(設定する|はマロン)/.test(text) ||
      (/自動公開しない/.test(text) && text.replace(/[（）()、。\s]/g, '').length <= 45)
    ) {
      removed.push({ reason: 'internal-paywall-instruction', text })
      continue
    }
    // 装飾だけの区切り線（全角ダッシュ・二重線等）。ASCII の "---" は
    // AI 指示文・テンプレートのコピペ境界なので除去しない。
    if (/^[―—＝〓=・･※\s]{3,}$/.test(text) && /[―—＝〓]/.test(text)) {
      removed.push({ reason: 'divider', text })
      continue
    }
    if (/^・?\s*\[マロン具体化\]/.test(text)) {
      removed.push({ reason: 'internal-todo', text })
      continue
    }
    if (/lane\s*=\s*paid_100/.test(text)) {
      removed.push({ reason: 'internal-lane', text })
      continue
    }
    if (/^・?\s*(想定価格|参考価格)[:：]/.test(text)) {
      removed.push({ reason: 'internal-price', text })
      continue
    }
    if (/^・?\s*再利用元[:：]/.test(text)) {
      removed.push({ reason: 'internal-reuse', text })
      continue
    }
    if (/マストヘッド固定文（GINZA TIME EDIT/.test(text)) {
      removed.push({ reason: 'internal-masthead-note', text })
      continue
    }
    if (/Same-?day Review/i.test(text)) {
      removed.push({ reason: 'internal-review-note', text })
      continue
    }
    if (isHashtagOnlyText(text) || isHashtagHeading(tag, text)) {
      removed.push({ reason: 'hashtag', text })
      continue
    }

    kept.push({ tag, text })
  }

  return { kept, removed }
}

// ───────────────────────── 3. 有料ライン設定支援 ─────────────────────────

function bl(code: string, message: string): NightValidationFinding {
  return { level: 'blocker', code, message }
}
function warn(code: string, message: string): NightValidationFinding {
  return { level: 'warning', code, message }
}

/**
 * paid_100 記事で、有料ライン（有料エリア開始）の直前に置く見出しが
 * 本文にちょうど1件あることを検証する。0件・複数件・未設定は BLOCKER。
 */
export function checkPaywallAnchor(
  bodyHeadings: string[],
  anchor: string | null | undefined,
  isPaid: boolean,
): NightValidationFinding[] {
  if (!isPaid) return []
  const a = (anchor ?? '').trim()
  if (!a) {
    return [
      bl(
        'paywallAnchorNotSet',
        'paid_100 記事だが paywallAnchorHeading（有料ライン直前の見出し）が未設定。Articles.paywallAnchorHeading に見出しテキストを設定してください。',
      ),
    ]
  }
  const n = bodyHeadings.filter((h) => h.trim() === a).length
  if (n === 0) return [bl('paywallAnchorMissing', `有料ライン対象の見出し「${a}」が本文に見つからない`)]
  if (n > 1) return [bl('paywallAnchorAmbiguous', `有料ライン対象の見出し「${a}」が本文に ${n} 件（1件でなければならない）`)]
  return []
}

/** 読者向けの1行表示（本文へは入れない） */
export function paywallLine(anchor: string | null | undefined, isPaid: boolean): string {
  if (!isPaid) return '有料ライン：なし（無料記事）'
  const a = (anchor ?? '').trim()
  return a ? `有料ライン：見出し『${a}』の直前` : '有料ライン：未設定（要設定）'
}

// ───────────────────────── 4. 表記統一 ─────────────────────────

const kanjiWatashi = (s: string) => /私だけの銀座/.test(s)
const kanaWatashi = (s: string) => /わたしだけの銀座/.test(s)

export function checkWording(input: {
  title: string
  hashtags: string[]
  body: string
}): NightValidationFinding[] {
  const out: NightValidationFinding[] = []
  const { title, body } = input
  const tagStr = (input.hashtags ?? []).join(' ')
  const blob = `${title}\n${body}`

  // 「ChatGPTへそのまま渡せる」→ 一般説明では「生成AI（ChatGPTなど）へそのまま渡せる」
  if (
    /ChatGPT\s*(へ|に)\s*そのまま渡せる/.test(blob) &&
    !/生成AI（ChatGPT(など)?）\s*(へ|に)\s*そのまま渡せる/.test(blob)
  ) {
    out.push(
      warn(
        'wordingChatGptGeneric',
        '「ChatGPTへそのまま渡せる」は一般説明では「生成AI（ChatGPTなど）へそのまま渡せる」に統一する',
      ),
    )
  }

  // タイトルとハッシュタグの「私／わたし」不一致
  const titleK = kanjiWatashi(title)
  const titleH = kanaWatashi(title)
  const tagK = kanjiWatashi(tagStr)
  const tagH = kanaWatashi(tagStr)
  if ((titleK && tagH && !tagK) || (titleH && tagK && !tagH)) {
    out.push(warn('wordingWatashiMismatch', 'タイトルとハッシュタグで「私／わたし」表記が不一致'))
  }
  // 本文内での「私だけの銀座」「わたしだけの銀座」混在
  if (kanjiWatashi(body) && kanaWatashi(body)) {
    out.push(warn('wordingWatashiMixedInBody', '本文で「私だけの銀座」「わたしだけの銀座」が混在している'))
  }

  // ブランド名の表記ゆれ
  if (/GINZA TIME EDITORIAL|Ginza Time Edit|ginza time edit/.test(blob)) {
    out.push(warn('wordingBrandName', 'ブランド名は「GINZA TIME EDIT」（大文字・EDIT）に統一する'))
  }
  return out
}

// ───────────────────────── 5. 有料記事の内容検査 ─────────────────────────

/** AI 指示文ブロックの後に来る既知の見出し（完全一致で打ち切る） */
const AI_PROMPT_FOLLOWING_HEADINGS = new Set([
  '別の展覧会にも使える記入式テンプレート',
  '別の展覧会にも再利用できる記入式テンプレート',
  '公式情報の確認方法',
  '公式で確認すること',
  '出典',
  '出典・確認日時',
  'Source',
  '注意事項',
  '挿絵注釈',
  'ハッシュタグ',
])

/** AI 指示文ブロック（見出し「…指示文」から次の既知見出しまで）を抜き出す */
export function extractAiPromptBlock(bodyText: string): string | null {
  const lines = bodyText.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (/指示文\s*$/.test(lines[i].trim()) && /(AI|ＡＩ)/.test(lines[i])) {
      start = i
      break
    }
  }
  if (start < 0) return null
  const out: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (AI_PROMPT_FOLLOWING_HEADINGS.has(lines[i].trim())) break
    out.push(lines[i])
  }
  return out.join('\n')
}

export function checkPaidContent(input: {
  body: string
  provenance: { fact?: string | null; verificationStatus?: string | null }[]
  sourceUrls: string[]
}): NightValidationFinding[] {
  const out: NightValidationFinding[] = []
  const { body } = input
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)

  // 観覧料が未確認なのに「0円」「無料」と断定していないか（同じ行に確認留保があれば可）
  for (const l of lines) {
    if (/(観覧料|入場料|拝観料)/.test(l) && /(^|[^\d０-９])(0円|０円|無料)/.test(l)) {
      if (!/(確認|記載がない|公式に記載|要確認|来店時|会場へ)/.test(l)) {
        out.push(warn('unverifiedFreeAdmission', `観覧料を未確認のまま「0円／無料」と読める行がある：「${l.slice(0, 40)}…」`))
        break
      }
    }
  }

  // 営業時間・観覧料・予約・移動時間の推測（断定）
  for (const l of lines) {
    if (/(徒歩|所要|移動)[^。「」]{0,8}[0-9０-９]{1,3}\s*分/.test(l) && !/(約|目安|程度|前後|公式|確認|時刻表)/.test(l)) {
      out.push(warn('guessedTravelTime', `移動時間を断定している行がある：「${l.slice(0, 40)}…」（「徒歩圏」「銀座エリア内」等にする）`))
      break
    }
  }
  for (const l of lines) {
    if (/(営業|開館|開場|開廊)時間[はも]?\s*[0-9０-９]{1,2}[:：]/.test(l) && !/(確認|公式|会場へ|店舗の営業時間)/.test(l)) {
      out.push(warn('guessedHours', `営業／開館時間を断定している行がある：「${l.slice(0, 40)}…」`))
      break
    }
  }

  // 料金・予約・営業時間に触れているのに「公式で確認」導線が本文に一切ない
  const touchesLogistics = /(観覧料|入場料|料金|営業時間|開館時間|予約)/.test(body)
  const hasConfirmCue = /(公式(サイト)?で確認|会場へ確認|来店(時)?(に)?確認|要確認|公式.*確認|申込フォーム)/.test(body)
  if (touchesLogistics && !hasConfirmCue) {
    out.push(warn('missingConfirmDisclaimer', '料金・予約・営業時間に触れているのに「公式で確認」導線が本文にない'))
  }

  // 商品・作品価格と一般予算を混同させる書き方
  for (const l of lines) {
    if (/予算/.test(l) && /[0-9]{2,3},[0-9]{3}\s*円/.test(l)) {
      out.push(warn('priceBudgetConfusion', `作品価格と予算を同じ行で並べて誤解を招く恐れ：「${l.slice(0, 40)}…」`))
      break
    }
  }

  // 公開本文の出典URL と links.sourceUrls の一致
  const b = bodySourceUrls(body)
  const s1 = [...new Set(b)].sort()
  const s2 = [...new Set(input.sourceUrls ?? [])].sort()
  if (b.length > 0 && (s1.length !== s2.length || s1.some((u, i) => u !== s2[i]))) {
    out.push(
      warn(
        'sourceUrlBodyMismatch',
        `公開本文の出典URL(${b.length}件) と links.sourceUrls(${s2.length}件) が不一致`,
      ),
    )
  }
  return out
}

// ───────────────────────── 6. AI 指示文の標準化 ─────────────────────────

/** 再利用用 AI 指示文に必ず含める制約（キーワード判定）。 */
const AI_PROMPT_CONSTRAINTS: { key: string; label: string; re: RegExp }[] = [
  { key: 'onlyConfirmed', label: '記載された確認済み情報だけを使う', re: /(確認済み|記載(された|の)情報だけ|確認できた情報)/ },
  { key: 'noGuess', label: '未確認の営業時間・料金・予約・移動時間を推測しない', re: /(推測しない|断定しない|推測で(補完|断定)しない)/ },
  { key: 'confirmOfficial', label: '未確認事項は「公式サイトで確認」と明記する', re: /(公式(サイト)?で確認)/ },
  { key: 'noFakePlace', label: '実在確認できない施設・展覧会を提案しない', re: /(実在(が)?確認できない|実在しない(施設|展覧会|店))/ },
  {
    key: 'summaryCheck',
    label: '最後に条件に合わない点と事前確認事項をまとめる',
    re: /条件に合わない点[\s\S]*?(事前(に)?確認|確認すべき|公式で確認)|(事前(に)?確認事項|確認すべき事項)[\s\S]*?条件に合わない/,
  },
]

export function checkAiPromptConstraints(bodyText: string, expectAiPrompt: boolean): NightValidationFinding[] {
  const block = extractAiPromptBlock(bodyText)
  if (!block) {
    return expectAiPrompt
      ? [warn('aiPromptMissing', 'paid_100 記事だが「AIへそのまま渡せる指示文」ブロックが見つからない')]
      : []
  }
  const missing = AI_PROMPT_CONSTRAINTS.filter((c) => !c.re.test(block)).map((c) => c.label)
  if (missing.length > 0) {
    return [warn('aiPromptMissingConstraints', `AI指示文に不足している制約: ${missing.join(' / ')}`)]
  }
  return []
}

/** 生成器（buildPaid100Draft）が AI 指示文へ必ず入れる制約行。文言統一の正。 */
export const AI_PROMPT_STANDARD_CONSTRAINTS: string[] = [
  '注意（この指示文の制約）：',
  '- 記載された確認済み情報だけを使う。書かれていない事実を足さない。',
  '- 未確認の営業時間・料金・予約の要否・移動時間は推測しない（「徒歩圏」「銀座エリア内」等の表現にとどめる）。',
  '- 未確認事項は「公式サイトで確認」と明記する。具体的な数値を断定しない。',
  '- 実在が確認できない施設・展覧会・店は提案に入れない。店の名前を並べるだけの案にしない。',
  '- 最後に、条件に合わない点と、出かける前に公式で確認すべき事項をまとめる。',
]
