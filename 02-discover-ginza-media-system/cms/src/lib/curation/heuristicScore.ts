import type { CurationResult } from './types'
import { clampScore } from './types'

// ヒューリスティック仮採点（2026-08-17）。
//
// ANTHROPIC_API_KEYが無効な環境（2026-08-10以降のCLAUDE.md記録参照）でも、
// 「Editorial Score → Audience Tags → Score順ランキング → Top候補」までの
// パイプライン全体をローカルで実データを使って検証できるようにするための
// プレースホルダー実装。本物のAI評価ではなく、キーワード・既存メタデータに
// 基づく単純なルールベースの近似値であり、`scoringMethod: 'heuristic-placeholder'`
// として明示的に区別して保存する（有効なANTHROPIC_API_KEYが用意でき次第、
// これらのSourceだけを対象にClaudeで再採点することを想定）。
//
// scoreSource.ts（本番のClaude実装）と同じ`ScoreSourceInput`/`CurationResult`の
// 形を返すため、呼び出し側（scoreSourceById.ts）はどちらを使っても差し替え可能
// （evaluateSourceById.tsの`options.evaluate`注入パターンを踏襲）。

export interface HeuristicScoreInput {
  contentRef: string
  sourceType: string
  pillarNames: string[]
}

const NOW_KEYWORDS = ['限定', '期間', '新', 'オープン', '初', '開催', '発売', 'フェア', '記念']
const STORY_KEYWORDS = ['歴史', '物語', '文化', '伝統', '創業', '昭和', '老舗', '受け継']
const DISCOVERY_KEYWORDS = ['隠れ', '知る人ぞ知る', 'ひっそり', '穴場', '限定公開']
const FAMILY_KEYWORDS = ['ファミリー', '親子', 'キッズ', '家族']
const BUSINESS_KEYWORDS = ['ビジネス', '商談', '会議', 'オフィス']
const COUPLE_KEYWORDS = ['ディナー', 'カフェ', 'レストラン', 'デート', 'バー']
const MATURE_KEYWORDS = ['老舗', '伝統', 'クラシック', '創業']
const NEXT_KEYWORDS = ['新', 'オープン', 'トレンド', '話題']

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw))
}

export function heuristicScore({ contentRef }: HeuristicScoreInput): CurationResult {
  const text = contentRef ?? ''

  // NOW：新規発見(first_seen相当のシグナルはcontentRef自体には残らないため、
  // 純粋にキーワードのみで近似)
  const nowHit = includesAny(text, NOW_KEYWORDS)
  const now = clampScore('now', nowHit ? 24 : 14)
  const nowReason = nowHit
    ? 'ヒューリスティック仮採点：期間・新規性を示す語（限定/新/オープン等）を検出'
    : 'ヒューリスティック仮採点：今だけ性を示す語を検出できず、標準値を付与'

  // GINZA：SOURCE LEDGER Core Sourceはいずれも銀座固有の情報源のため高めの基準値
  const ginza = clampScore('ginza', 20)
  const ginzaReason = 'ヒューリスティック仮採点：SOURCE LEDGER Core Source由来のため基準値を付与（銀座固有性は情報源選定の時点で担保）'

  // UX：本文の情報量（文字数）を体験価値の下限プロキシとして使用
  const richness = Math.min(text.length, 800) / 800
  const ux = clampScore('ux', 8 + richness * 12)
  const uxReason = `ヒューリスティック仮採点：本文情報量（${text.length}文字）を体験価値の代理指標として使用`

  // STORY：歴史・文化語の有無
  const storyHit = includesAny(text, STORY_KEYWORDS)
  const story = clampScore('story', storyHit ? 12 : 6)
  const storyReason = storyHit
    ? 'ヒューリスティック仮採点：歴史・文化・伝統を示す語を検出'
    : 'ヒューリスティック仮採点：文化・物語性を示す語を検出できず、標準値を付与'

  // DISCOVERY：Core Sourceは既に広く知られているブランド・施設が中心のため
  // 基準値は低め、「隠れ家」的な語があれば加点
  const discoveryHit = includesAny(text, DISCOVERY_KEYWORDS)
  const discovery = clampScore('discovery', discoveryHit ? 8 : 4)
  const discoveryReason = discoveryHit
    ? 'ヒューリスティック仮採点：発見性を示す語（隠れ家/穴場等）を検出'
    : 'ヒューリスティック仮採点：Core Source（広く知られた情報源）由来のため標準値を付与'

  const genderAffinity: CurationResult['genderAffinity'] = ['all']

  const generation: CurationResult['generation'] = []
  if (includesAny(text, NEXT_KEYWORDS)) generation.push('next')
  if (includesAny(text, MATURE_KEYWORDS)) generation.push('mature')
  if (generation.length === 0) generation.push('core', 'timeless')

  const visitStyle: CurationResult['visitStyle'] = []
  if (includesAny(text, FAMILY_KEYWORDS)) visitStyle.push('family')
  if (includesAny(text, BUSINESS_KEYWORDS)) visitStyle.push('business')
  if (includesAny(text, COUPLE_KEYWORDS)) visitStyle.push('couple')
  if (visitStyle.length === 0) visitStyle.push('all')

  return {
    now,
    nowReason,
    ginza,
    ginzaReason,
    ux,
    uxReason,
    story,
    storyReason,
    discovery,
    discoveryReason,
    genderAffinity,
    generation,
    visitStyle,
  }
}
