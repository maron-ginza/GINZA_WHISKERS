// GINZA WHISKERS / Project 02 — GINZA CROSS CULTURE MAP（2026-09-04 正式統合）
//
// 「情報収集 → 裏どり → 旬判定 → GINZA WHISKERS 適合判定」の **後段** に置く
// CROSS CULTURE FILTER の設定。5市場（UAE / Singapore / France / United States /
// Italy）ごとに「仮説軸（axes）」と、その軸に反応する語彙（include / boost）、
// 相性が明確に悪い語彙（negative）を持つ。
//
// 【設計原則（ユーザー確定・2026-09-04）】
//   ・仮説軸であり、実データで調整する前提。**この 1 ファイルだけ**を編集すれば
//     軸の追加・修正ができる（scorer 側は軸名を知らない）。
//   ・追加 API 課金なし・外部有料 API なし・ネットワークなし・AI なし。
//     既存の取得済みフィールド（title / excerpt / venue / contentType / uxType /
//     factKind / templateType / primaryCategory）だけを見る決定的スコアリング。
//   ・5市場すべてに無理やり割り当てない。適合度が低い市場は除外する（scorer 側の
//     しきい値で落とす）。
//   ・仮説と確認済み事実を混同しない —— reason 文には「（仮説軸による推定）」を必ず含める。
//
// env による上書き（コード再デプロイなしで振れる）:
//   CROSS_CULTURE_ENABLED            : "0" で FILTER 全体を停止（通常処理は継続）
//   CROSS_CULTURE_DISABLED_MARKETS   : CSV。指定市場を強制除外（例 "UAE,Italy"）
//   CROSS_CULTURE_MIN_DERIVATIVE     : 派生記事候補にするスコア下限（既定 70）
//   CROSS_CULTURE_MIN_EDITORIAL      : 編集候補として保持するスコア下限（既定 50）

export const CROSS_CULTURE_VERSION = '2026-09-04.5'

export interface AxisDef {
  /** 軸名（出力の matchedAxes に出る。仮説軸） */
  key: string
  /** 市場内での相対重み（既定 1。強めたい軸は 1.2 など） */
  weight?: number
  /** この軸に反応する語（部分一致・大文字小文字無視。日本語＋英語を混在可） */
  include: string[]
  /** 特に強いシグナル（1 ヒットで include 複数分の加点。任意） */
  boost?: string[]
}

export interface MarketDef {
  market: string
  /** false ならこの市場は常に除外（env でも上書き可） */
  enabled: boolean
  /** 短い市場コンパス説明（reason / suggestedAngle 生成に使う） */
  compass: string
  /** ヒットしたら市場スコアを減点する語（相性が明確に悪い） */
  negative?: string[]
  axes: AxisDef[]
  /**
   * この市場で「有料候補」になりうる編集の型（読者向けの角度ラベル）。
   * suggestedAngle の生成に使うだけで、有料判定そのものは scorer の決定的ルール。
   */
  paidAngles: string[]
}

// ---------------------------------------------------------------------------
// 5市場 × 仮説軸
// ---------------------------------------------------------------------------
export const MARKET_AXES: MarketDef[] = [
  {
    market: 'UAE',
    enabled: true,
    compass: '余白・プライバシー・静かな贅沢（Space / Privacy / Quiet Luxury）',
    negative: ['アルコール', '日本酒', 'ワイン', 'ビール', '豚', 'ポーク', '闇市', '猥雑'],
    axes: [
      {
        key: 'Space',
        include: [
          '余白', 'ゆとり', '広々', '開放', '静謐', '静けさ', '間（ま）', '空間', 'ラウンジ',
          '見晴らし', '眺望', 'テラス', '中庭', '回遊', 'スイート', '一棟', '貸切',
          'space', 'spacious', 'openness', 'calm',
        ],
        boost: ['貸切', 'スイート', 'プライベート空間'],
      },
      {
        key: 'Privacy',
        include: [
          'プライベート', '個室', '完全予約制', '会員制', '一日一組', '非公開', '隠れ家',
          '限られた', '少人数', '招待', 'appointment only', 'private', 'members only', 'by invitation',
        ],
        boost: ['完全予約制', '一日一組', '会員制'],
      },
      {
        key: 'Quiet Luxury',
        include: [
          '上質', '静かな贅沢', 'クワイエット', '本物', '設え', 'しつらえ', '誂え', 'あつらえ',
          'オートクチュール', '一点物', '一点もの', '別誂え', '極上', '洗練', 'ハイジュエリー',
          'quiet luxury', 'understated', 'refined', 'bespoke', 'haute',
        ],
        boost: ['オートクチュール', '別誂え', 'ハイジュエリー'],
      },
    ],
    paidAngles: [
      '静けさと余白から銀座を歩く（時間帯・混雑・予約の設計つき）',
      'プライベートに愉しめる銀座（個室・完全予約制・会員制の実地情報）',
      'Quiet Luxury の視点で選ぶ銀座の設え',
    ],
  },
  {
    market: 'Singapore',
    enabled: true,
    compass: '手仕事・本物志向・参加体験（Craft / Authenticity / Participation）',
    negative: ['大量生産', '使い捨て', 'チェーン展開', 'ノベルティ配布'],
    axes: [
      {
        key: 'Craft',
        include: [
          '職人', '手仕事', '手作り', '手づくり', '工芸', '匠', '一点もの', '一点物',
          '染め', '染物', '型染', '型絵染', '藍染', '草木染', '更紗', '織り', '織物', '漆', '陶芸', '陶房', '陶器',
          '磁器', '窯', '九谷焼', '有田焼', '備前焼', '益子焼', '焼締', '螺鈿', '蒔絵', '七宝', '象嵌', '江戸切子',
          '硝子', 'ガラス工', '木工', '金工', '鍛金', '截金', '刺繍', '刺し子', '組紐',
          'クラフト', '手仕事の', 'ハンドメイド',
          'craft', 'handmade', 'artisan', 'craftsmanship', 'hand-dyed', 'hand-woven',
        ],
        boost: ['職人', '工芸', '一点もの', '截金', '九谷焼'],
      },
      {
        key: 'Authenticity',
        include: [
          '本物', '本場', '正統', '由緒', '老舗', '創業', '伝統', '継承', '受け継', '守り継',
          '当代', '襲名', '直伝', '本式', '正当', 'authentic', 'heritage brand', 'the real',
        ],
        boost: ['老舗', '創業', '直伝'],
      },
      {
        key: 'Participation',
        include: [
          'ワークショップ', '体験', '実演', 'ライブ', '製作体験', '手を動か', '参加', '一緒に',
          '教室', 'レッスン', 'デモンストレーション', 'つくる', '作れる', '触れる',
          'workshop', 'hands-on', 'try', 'participate', 'demonstration',
        ],
        boost: ['ワークショップ', '製作体験', '実演'],
      },
    ],
    paidAngles: [
      '手仕事を「見る・触れる・つくる」で辿る銀座（体験の予約・所要時間つき）',
      '本物志向で選ぶ銀座の老舗（由緒と現在地の比較）',
      '職人に会える銀座の半日（実演・工房・購入までの動線）',
    ],
  },
  {
    market: 'France',
    enabled: true,
    compass: '文化・歴史・没入（Culture / Heritage / Immersion）',
    negative: ['キャンペーン', 'ポイント還元', 'アプリ入会', 'クーポン'],
    axes: [
      {
        key: 'Culture',
        include: [
          '文化', '芸術', 'アート', '美術', '展覧会', '個展', '企画展', '回顧展', '銀座画廊',
          '文学', '写真展', '批評', '思想', '美学', '教養', 'キュレーション', 'サロン',
          'culture', 'art', 'exhibition', 'literary', 'aesthetic',
        ],
        boost: ['回顧展', '企画展', '美学'],
      },
      {
        key: 'Heritage',
        include: [
          '歴史', '史跡', '由緒', '明治', '大正', '昭和', '戦前', '創業', '発祥', '銀座の記憶',
          '近代', '文化財', '保存', '復刻', '往時', '当時', 'archive', 'history', 'legacy', 'since 18', 'since 19',
        ],
        boost: ['発祥', '文化財', '銀座の記憶'],
      },
      {
        key: 'Immersion',
        include: [
          '没入', 'その場', '一日を通して', 'じっくり', '深く', '通し', '滞在', '巡る', 'めぐる',
          '読み解く', '味わい尽く', '腰を据え', 'ゆっくり', 'immersive', 'in-depth', 'lose yourself',
        ],
        boost: ['没入', '読み解く'],
      },
    ],
    paidAngles: [
      '銀座を一つの文化史として読み解く（背景・人物・年表つき）',
      '歴史の層を辿る銀座の歩き方（発祥・保存・現在地）',
      '半日かけて没入する銀座の展覧会案内（順路・所要・関連書）',
    ],
  },
  {
    market: 'United States',
    enabled: true,
    compass: '体験・物語・個別化・専門文化（Experience / Story / Personalization / Specialist Culture）',
    negative: [],
    axes: [
      {
        key: 'Experience',
        include: [
          '体験', 'アフタヌーンティー', 'ティーサロン', 'テイスティング', 'ペアリング', 'コース',
          'ライブ', 'パフォーマンス', 'ツアー', '限定メニュー', '特別プラン', '五感',
          'experience', 'tasting', 'pairing', 'live performance', 'tour',
        ],
        boost: ['テイスティング', 'ペアリング', '特別プラン'],
      },
      {
        key: 'Story',
        include: [
          '物語', 'ストーリー', '誕生秘話', '背景', '由来', 'なぜ', '創業者', '職人の言葉',
          'エピソード', '舞台裏', 'メイキング', '軌跡', 'story', 'behind the scenes', 'the making of',
        ],
        boost: ['誕生秘話', '舞台裏', '軌跡'],
      },
      {
        key: 'Personalization',
        include: [
          'オーダーメイド', 'カスタム', 'パーソナ', 'あなたに', '名入れ', '別誂え', '誂え',
          'セミオーダー', 'フルオーダー', '選べる', 'カスタマイズ', 'イニシャル',
          'personalized', 'custom', 'made to order', 'monogram', 'tailored',
        ],
        boost: ['フルオーダー', '名入れ', 'オーダーメイド'],
      },
      {
        key: 'Specialist Culture',
        // 「◯◯専門店オープン」等のありふれた告知で過剰派生しないよう、
        // 単独の「専門」は入れない・「専門店」は boost にしない（1ヒット＝弱い一致）。
        include: [
          '専門店', 'マニア', '愛好家', 'コレクター', '一点特化', '万年筆', '硯', '和骨董',
          '専門書', '目利き', '一筋', 'ニッチ', 'specialist', 'connoisseur', 'aficionado',
        ],
        boost: ['コレクター', '目利き', '一筋'],
      },
    ],
    paidAngles: [
      '「体験」を軸に組み立てる銀座の一日（予約・所要・価格つき）',
      '一つの店・一つのものの物語を掘る銀座（背景・人物・由来）',
      '専門店を巡る銀座（何がどう違うのか、選び方の比較）',
    ],
  },
  {
    market: 'Italy',
    enabled: true,
    compass: 'デザイン・素材・手仕事・文化交流（Design / Material / Craft / Cultural Exchange）',
    negative: ['チープ', '簡易包装', '使い捨て'],
    axes: [
      {
        key: 'Design',
        include: [
          'デザイン', '意匠', '造形', 'プロダクト', '建築', '内装', '設計', '文様', '柄', '紋様',
          'パターン', 'フォルム', 'ディテール', 'タイポグラフィ', '色使い', '構成',
          'design', 'form', 'pattern', 'typography', 'architecture',
        ],
        boost: ['意匠', '建築', '文様'],
      },
      {
        key: 'Material',
        include: [
          '素材', '生地', '革', 'レザー', '真鍮', '鉄', '木材', '木地', '無垢', '大理石', '石', '和紙',
          '磁器', '陶器', '陶土', '釉薬', '焼き物', 'やきもの', '九谷焼', '有田焼', '備前焼', '江戸切子',
          '糸', '絹', 'シルク', 'カシミヤ', 'ウール', '麻', '質感', 'テクスチャ',
          'material', 'leather', 'brass', 'marble', 'texture', 'silk', 'grain',
        ],
        boost: ['無垢', '真鍮', '大理石'],
      },
      {
        key: 'Craft',
        include: [
          '職人', '手仕事', '工芸', '一点もの', '手作業', '仕立て', '縫製', '仕上げ', '技法',
          '染め', '型絵染', '藍染', '織り', '漆', '截金', '螺鈿', '蒔絵', '七宝', '象嵌', '組紐', '刺繍',
          'クラフツマンシップ',
          'craft', 'handmade', 'artisan', 'atelier', 'workshop', 'craftsmanship',
        ],
        boost: ['仕立て', '技法', '截金'],
      },
      {
        key: 'Cultural Exchange',
        include: [
          '文化交流', '東西', '異文化', '海外', '世界', 'インド', 'フランス', 'イタリア', '欧州',
          'ヨーロッパ', '交流', '影響', '渡来', '輸入', '融合', '往来', 'コラボレーション',
          'cultural exchange', 'cross-cultural', 'east meets west', 'dialogue between',
        ],
        boost: ['文化交流', '東西', '融合'],
      },
    ],
    paidAngles: [
      'デザインと素材で読む銀座（誰が・何で・どう作ったか）',
      '手仕事の銀座を「もの」として比較する（産地・技法・価格帯）',
      '銀座で出会う東西の文化交流（背景と、いま見られる場所）',
    ],
  },
]

// ---------------------------------------------------------------------------
// しきい値（env 上書き可）
// ---------------------------------------------------------------------------
export interface CrossCultureThresholds {
  enabled: boolean
  /** score >= これ で「派生記事候補」 */
  minDerivative: number
  /** score >= これ で「編集候補として保持」（未満は原則除外） */
  minEditorial: number
  /** env で強制除外された市場名 */
  disabledMarkets: string[]
}

function numFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export function loadCrossCultureThresholds(): CrossCultureThresholds {
  const enabledRaw = (process.env.CROSS_CULTURE_ENABLED ?? '').trim().toLowerCase()
  const enabled = !['0', 'false', 'no', 'off'].includes(enabledRaw)
  const disabled = (process.env.CROSS_CULTURE_DISABLED_MARKETS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    enabled,
    minDerivative: numFromEnv('CROSS_CULTURE_MIN_DERIVATIVE', 70),
    minEditorial: numFromEnv('CROSS_CULTURE_MIN_EDITORIAL', 50),
    disabledMarkets: disabled,
  }
}

/** 有効な市場定義（enabled かつ env で無効化されていない） */
export function activeMarkets(thresholds = loadCrossCultureThresholds()): MarketDef[] {
  return MARKET_AXES.filter(
    (m) => m.enabled && !thresholds.disabledMarkets.some((d) => d.toLowerCase() === m.market.toLowerCase()),
  )
}
