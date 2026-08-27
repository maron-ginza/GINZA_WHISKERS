// Project 02-2 Phase A「Interest Discovery」共有型定義（2026-08-27）。
//
// 監査セッション（本file初回追加時点）で設計した最小schema案をそのまま実装した
// ものであり、Payloadに依存しない純粋な型定義として独立させる（lib/curation/
// types.tsと同じ設計方針——コレクション定義・取得ロジック・CLI表示の複数箇所から
// 共有するため）。
//
// 【重要原則（マロン指示）】
// - noteの「人気」「急上昇」の内部判定基準は非公開であり、推測で再現しない。
// - 取得できる公開情報（テーマ名・順位・URL・取得日時）だけを事実として保存する。
// - articleCount/engagementSignal/monetizationScore/ginzaRelevance等、今回
//   確認できていない・Phase Aのスコープ外の項目は一切作らない。

export const INTEREST_SOURCE_PLATFORMS = ['note', 'x'] as const
export type InterestSourcePlatform = (typeof INTEREST_SOURCE_PLATFORMS)[number]

export const INTEREST_SOURCE_PLATFORM_LABELS: Record<InterestSourcePlatform, string> = {
  note: 'note',
  x: 'X（将来のPriority 3拡張用、現状未使用）',
}

// Priority 1〜3（マロン指示の情報源優先順位）にそのまま対応する。
// 今回のテスト取得で実際に使うのはnote_risingのみ——他の値はスキーマのみ用意。
export const INTEREST_SOURCE_TYPES = [
  'note_popular',
  'note_rising',
  'note_official_topic',
  'note_hashtag_popular',
  'external_trend',
] as const
export type InterestSourceType = (typeof INTEREST_SOURCE_TYPES)[number]

export const INTEREST_SOURCE_TYPE_LABELS: Record<InterestSourceType, string> = {
  note_popular: 'note 人気（Priority 1、未実装・予約値）',
  note_rising: 'note 急上昇（Priority 1、note.com/trend）',
  note_official_topic: 'note公式お題／コンテスト（Priority 2）',
  note_hashtag_popular:
    'note ハッシュタグページ 人気（Priority 1補強、note.com/hashtag/<tag>の記事数・関連タグ）',
  external_trend: '外部トレンド（Priority 3、補助情報源）',
}

// 【2026-08-27調査結果】note.com/hashtag/<tag>の「人気」「急上昇」「新着」
// フィルタ（?f=hot / ?f=new）は記事の並び順のみを変えており、記事数・関連タグ
// リスト自体は完全に同一であることを実データ（2タグ）で確認した。
// note_hashtag_rising相当の、tag単位で区別可能な「急上昇」固有データは
// 現状このページには存在しないため、sourceTypeとして追加していない
// （存在しないものを実装したように見せない、マロン指示の原則）。

// v1は複数回取得の比較ロジックを実装していないため簡易値のみ。継続観測が
// 始まれば「前回比変化」等の値へ拡張する（今回は作らない、マロン指示）。
export const INTEREST_FRESHNESS_VALUES = ['observed_now', 'unknown'] as const
export type InterestFreshness = (typeof INTEREST_FRESHNESS_VALUES)[number]

export const INTEREST_FRESHNESS_LABELS: Record<InterestFreshness, string> = {
  observed_now: '今回の取得で確認',
  unknown: '不明',
}

// noteの内部基準の確からしさではなく、「私たちの読み取りの確からしさ」を表す。
// - high：noteが明示的に番号を振って表示している（例：/trend の1〜5位）
// - medium：順序はあるが明示的な番号がない（例：並び替えUI適用後の表示順のみ）
// - low：間接的な推定を含む
export const INTEREST_CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const
export type InterestConfidence = (typeof INTEREST_CONFIDENCE_VALUES)[number]

export const INTEREST_CONFIDENCE_LABELS: Record<InterestConfidence, string> = {
  high: 'High（明示的な順位表示あり）',
  medium: 'Medium（順序のみ、番号表示なし）',
  low: 'Low（間接推定を含む）',
}

// 既存DiscoveredContent.curationStatus・Sources.editorial.editorialStatusと
// 同じ「Maron Editor's Choice」人間ゲートパターン。AI・自動化スクリプトが
// 直接approved/rejectedへ遷移させることはできない（collections/InterestThemes.ts
// のbeforeChangeフックで強制）。
export const INTEREST_THEME_STATUSES = ['inbox', 'approved', 'rejected'] as const
export type InterestThemeStatus = (typeof INTEREST_THEME_STATUSES)[number]

export const INTEREST_THEME_STATUS_LABELS: Record<InterestThemeStatus, string> = {
  inbox: 'Inbox（未判断）',
  approved: '承認済み（Phase B以降へ進める）',
  rejected: '却下',
}

// note公式お題／コンテスト（Priority 2、2026-08-27追加）の分類。タイトル文言に
// 「コンテスト」「お題企画／お題」のいずれかが明示的に含まれる場合のみ判定する
// （lib/interestDiscovery/classifyNoteOfficialTopic.ts）——どちらの語も含まない
// 場合はnull（推測で埋めない）。
export const OFFICIAL_CATEGORY_VALUES = ['contest', 'topic'] as const
export type OfficialCategory = (typeof OFFICIAL_CATEGORY_VALUES)[number]

export const OFFICIAL_CATEGORY_LABELS: Record<OfficialCategory, string> = {
  contest: 'コンテスト（企業とのコラボ企画等、タイトルに「コンテスト」を含む）',
  topic: 'お題企画（タイトルに「お題」を含む）',
}
