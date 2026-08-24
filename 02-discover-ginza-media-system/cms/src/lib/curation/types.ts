// 「旬の銀座」編集判断レイヤー（2026-08-17）
//
// SOURCE LEDGER → Snapshot → Diff → Sources候補（Inbox）まで完成したパイプラインに、
// 「この候補はどれくらい旬か・誰に響くか」を可視化する編集判断スコアを追加する。
// Payloadに依存しない純粋な型定義。Sourcesコレクション（collections/Sources.ts）・
// スコアリングロジック（lib/curation/scoreSource.ts等）・ランキング表示（CLI）の
// 3箇所から共有する（lib/sourceLedger/types.tsと同じ設計方針）。
//
// 【重要原則（マロン指示、2026-08-17）】
// - Audience Tagsは情報を収集段階で除外するfilterではない。まず広く収集し、
//   その後AIがEditorial ScoreとAudience Tagsを付与する（除外ではなく付加情報）。
// - 最終採用はAIではなくMaron Editor's Choice（人間）が行う。
// - AIは編集長ではなく「Editorial Desk」——候補を評価・順位付けする下読み役。
// - 将来のGINZA Conciergeパーソナライズにも再利用できるデータ構造にする。

// --- Editorial Score（合計100点、5軸） ---
// 配点はマロン指示のとおり固定：NOW 30 / GINZA 25 / UX 20 / STORY 15 / DISCOVERY 10
export const EDITORIAL_SCORE_AXES = ['now', 'ginza', 'ux', 'story', 'discovery'] as const
export type EditorialScoreAxis = (typeof EDITORIAL_SCORE_AXES)[number]

export const EDITORIAL_SCORE_MAX: Record<EditorialScoreAxis, number> = {
  now: 30,
  ginza: 25,
  ux: 20,
  story: 15,
  discovery: 10,
}

export const EDITORIAL_SCORE_LABELS: Record<EditorialScoreAxis, string> = {
  now: 'NOW（今だけ性）',
  ginza: 'GINZA（銀座固有性）',
  ux: 'UX（体験価値）',
  story: 'STORY（文化・物語性）',
  discovery: 'DISCOVERY（発見性）',
}

export const EDITORIAL_SCORE_TOTAL_MAX = 100

// スコアを付与した主体。実際のClaude評価か、ANTHROPIC_API_KEY未設定/無効時の
// ローカル検証用ヒューリスティック（プレースホルダー）かを区別し、有効な鍵が
// 用意され次第どちらを再採点すべきか判別できるようにする（新規追加、2026-08-17）。
export const SCORING_METHODS = ['claude', 'heuristic-placeholder'] as const
export type ScoringMethod = (typeof SCORING_METHODS)[number]

export const SCORING_METHOD_LABELS: Record<ScoringMethod, string> = {
  claude: 'Claude（Editorial Desk AI）',
  'heuristic-placeholder': 'ヒューリスティック仮採点（本物のAI評価ではない）',
}

// --- Audience Tags（複数選択可、除外用フィルタではない） ---
export const GENDER_AFFINITY_VALUES = ['female', 'male', 'all'] as const
export type GenderAffinity = (typeof GENDER_AFFINITY_VALUES)[number]
export const GENDER_AFFINITY_LABELS: Record<GenderAffinity, string> = {
  female: 'Female',
  male: 'Male',
  all: 'All',
}

export const GENERATION_VALUES = ['next', 'core', 'mature', 'timeless'] as const
export type Generation = (typeof GENERATION_VALUES)[number]
export const GENERATION_LABELS: Record<Generation, string> = {
  next: 'NEXT',
  core: 'CORE',
  mature: 'MATURE',
  timeless: 'TIMELESS',
}

// Familyはgenerationではなくvisit style（同行形態）として扱う（マロン指示）
export const VISIT_STYLE_VALUES = ['solo', 'couple', 'friends', 'family', 'business', 'all'] as const
export type VisitStyle = (typeof VISIT_STYLE_VALUES)[number]
export const VISIT_STYLE_LABELS: Record<VisitStyle, string> = {
  solo: 'SOLO',
  couple: 'COUPLE',
  friends: 'FRIENDS',
  family: 'FAMILY',
  business: 'BUSINESS',
  all: 'ALL',
}

// --- 交差性（People × Culture × Commerce × Technology × Time） ---
// GINZA WHISKERS編集思想の将来評価軸。2026-08-17時点ではAIによる自動算出は行わず、
// フィールド（スキーマ）のみを準備する（過剰実装を避ける、マロン指示）。
export const INTERSECTIONALITY_DIMENSIONS = [
  'people',
  'culture',
  'commerce',
  'technology',
  'time',
] as const
export type IntersectionalityDimension = (typeof INTERSECTIONALITY_DIMENSIONS)[number]
export const INTERSECTIONALITY_LABELS: Record<IntersectionalityDimension, string> = {
  people: 'People',
  culture: 'Culture',
  commerce: 'Commerce',
  technology: 'Technology',
  time: 'Time',
}

export interface EditorialScoreBreakdown {
  now: number
  nowReason: string
  ginza: number
  ginzaReason: string
  ux: number
  uxReason: string
  story: number
  storyReason: string
  discovery: number
  discoveryReason: string
}

export interface AudienceTagsResult {
  genderAffinity: GenderAffinity[]
  generation: Generation[]
  visitStyle: VisitStyle[]
}

export type CurationResult = EditorialScoreBreakdown & AudienceTagsResult

export function clampScore(axis: EditorialScoreAxis, value: number): number {
  const max = EDITORIAL_SCORE_MAX[axis]
  if (!Number.isFinite(value)) return 0
  return Math.min(max, Math.max(0, Math.round(value)))
}

// 合計はAI/ヒューリスティックの自己申告を信用せず、必ずこの関数でサブスコアから
// 再計算する（AIの単純な足し算ミスをスキーマレベルで無害化するための防御的設計）。
export function computeEditorialScoreTotal(breakdown: EditorialScoreBreakdown): number {
  return EDITORIAL_SCORE_AXES.reduce((sum, axis) => sum + clampScore(axis, breakdown[axis]), 0)
}

// AudienceTagsもAIの出力をそのまま信用しない——2026-08-17、実際のClaude
// 呼び出しで①generationに'all'（本来genderAffinity/visitStyleにしか
// 存在しない値）を混入させる、②配列ではない値（文字列等）を返す、という
// 2種類の誤りが実地で発生し、Payloadのselectフィールドバリデーションや
// JSの`.filter`呼び出し自体でスコア全体の書き込みが失敗する事故があった。
// プロンプト側も修正した（scoreSource.ts）が、無効な値が来ても書き込み
// 全体を失敗させず静かに正規化するここでの防御も追加する（スコア自体は
// 正しく採点できているケースまで無駄に失うのを避けるため）。配列でない
// 値はArray.isArrayで弾き空配列として扱う（`?? []`だけでは文字列等の
// 非nullish・非配列値を防げないため）。
export function sanitizeAudienceTags(input: AudienceTagsResult): AudienceTagsResult {
  const genderAffinity = (Array.isArray(input.genderAffinity) ? input.genderAffinity : []).filter(
    (v): v is GenderAffinity => (GENDER_AFFINITY_VALUES as readonly string[]).includes(v),
  )
  const generation = (Array.isArray(input.generation) ? input.generation : []).filter(
    (v): v is Generation => (GENERATION_VALUES as readonly string[]).includes(v),
  )
  const visitStyle = (Array.isArray(input.visitStyle) ? input.visitStyle : []).filter(
    (v): v is VisitStyle => (VISIT_STYLE_VALUES as readonly string[]).includes(v),
  )
  return { genderAffinity, generation, visitStyle }
}
