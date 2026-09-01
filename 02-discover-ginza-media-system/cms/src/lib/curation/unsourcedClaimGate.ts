// 再発防止 #4（2026-09-01 Trial）：出典にない一般論を生成禁止事項とし、決定的に検出する。
//
// 背景：2026-09-01 の note 下書き Trial で、出典に無い次の類の記述が混入した——
//  ・季節傾向の一般化（「9月の銀座は…の季節です」「秋は食卓が濃くなり」「秋の夜長」）
//  ・混雑／空き具合の推測（「平日は空いている」「静かに器と向き合いたい：平日の午前」）
//  ・作り手や店員との会話可能性（「作家と話せる時間でもあります」）
//  ・産地・地域の一般化（「産地でもそう多くありません」）
// これらは Editorial Trust Layer「推測で補完しない」に反する。unsourcedHistoryGuard.ts
// の姉妹として、マーカー＋パターンで決定的に検出する。AI 呼び出しなし。
//
// 既定は WARNING（9月Trial）。mode:'block' 指定時のみ blocked=true を返す。
// 誤検知抑制：一致フレーズの主要語が backingTexts（sourceProvenance の fact、
// DiscoveredContent の excerpt/title 等）に現れていれば取り下げる。

export type UnsourcedClaimCategory =
  | 'seasonalGeneralization'
  | 'crowdSpeculation'
  | 'conversationPossibility'
  | 'regionalGeneralization'

export interface UnsourcedClaimHit {
  phrase: string
  category: UnsourcedClaimCategory
  /** このカテゴリを許容できる「裏付け語」（backing に含まれれば取り下げ） */
  backedBy: string[]
}

export interface UnsourcedClaimGateResult {
  hits: UnsourcedClaimHit[]
  /** mode:'block' かつ hits があれば true */
  blocked: boolean
}

export interface UnsourcedClaimGateOptions {
  mode?: 'warn' | 'block'
}

interface Rule {
  category: UnsourcedClaimCategory
  re: RegExp
  /** backing にこの語のいずれかがあれば、その一致は取り下げる */
  allowIfBackingHas: string[]
}

const RULES: Rule[] = [
  // --- 季節傾向の一般化 ---
  {
    category: 'seasonalGeneralization',
    re: /(?:\d{1,2}月|今)の銀座は[、,]?[^。]{0,24}(?:季節|時期|頃)(?:です|だ|になり|になる)/g,
    allowIfBackingHas: [],
  },
  {
    category: 'seasonalGeneralization',
    re: /(?:春|夏|秋|冬|梅雨|初夏|晩夏|残暑|初秋|晩秋|初冬|真冬|真夏)は[、,]?[^。]{0,20}(?:季節|時期|頃|多い|増え|きれい|美しい|似合|恋しく|が楽しめ)/g,
    allowIfBackingHas: [],
  },
  {
    category: 'seasonalGeneralization',
    re: /(?:春|夏|秋|冬)の(?:夜長|訪れ|気配|深まり|入り口|始まり)/g,
    allowIfBackingHas: [],
  },
  {
    category: 'seasonalGeneralization',
    re: /この季節(?:は|なら|らしい|ならでは)/g,
    allowIfBackingHas: [],
  },
  // --- 混雑・空き具合の推測 ---
  {
    category: 'crowdSpeculation',
    re: /(?:混雑|空いて|空いている|人が少な|人出が|落ち着いて見られ|ゆっくり見られ|穴場|行列|待ち時間|並ばず|待たずに)/g,
    allowIfBackingHas: ['混雑', '整理券', '入場制限', '予約', '待ち時間', '行列'],
  },
  {
    category: 'crowdSpeculation',
    re: /平日(?:の)?(?:午前|午後|昼|夕方|早い時間|日中)?は?[^。]{0,10}(?:空いて|空いている|狙い目|ねらい目|おすすめ|向いて)/g,
    allowIfBackingHas: ['混雑', '整理券', '入場制限'],
  },
  // --- 作り手・店員との会話可能性 ---
  {
    category: 'conversationPossibility',
    re: /(?:作家|職人|店主|スタッフ|シェフ|オーナー|担当者|生産者|作り手)[^。]{0,10}(?:と話せ|と話ができ|に話を聞け|とお話し?でき|と語ら|と交流でき|に質問でき|に相談でき|から直接)/g,
    allowIfBackingHas: ['在廊', 'トーク', 'ギャラリートーク', '実演', '対話', '質疑', 'Q&A', 'ワークショップ'],
  },
  // --- 産地・地域の一般化 ---
  {
    category: 'regionalGeneralization',
    re: /(?:産地|地元|本場|現地)でも[^。]{0,12}(?:少な|珍し|多くない|なかなか|限られ|そう多く)/g,
    allowIfBackingHas: [],
  },
  {
    category: 'regionalGeneralization',
    re: /(?:日本各地|全国|各地)(?:で|の)[^。]{0,10}(?:定番|一般的|知られ|親しまれ)/g,
    allowIfBackingHas: [],
  },
  {
    category: 'regionalGeneralization',
    re: /(?:古くから|昔から|伝統的に)[^。]{0,12}(?:知られ|親しまれ|愛され|作られ)/g,
    allowIfBackingHas: ['古くから', '昔から', '伝統', '創業'],
  },
]

export function checkUnsourcedClaims(
  bodyTexts: (string | null | undefined)[],
  backingTexts: (string | null | undefined)[],
  options: UnsourcedClaimGateOptions = {},
): UnsourcedClaimGateResult {
  const body = bodyTexts.filter(Boolean).join('\n')
  const backing = backingTexts.filter(Boolean).join('\n')
  const hits: UnsourcedClaimHit[] = []
  const seen = new Set<string>()

  for (const rule of RULES) {
    // グローバル正規表現の lastIndex を毎回リセット
    rule.re.lastIndex = 0
    for (const m of body.matchAll(rule.re)) {
      const phrase = m[0].trim()
      const backed = rule.allowIfBackingHas.some((w) => backing.includes(w))
      if (backed) continue
      const key = `${rule.category}:${phrase}`
      if (seen.has(key)) continue
      seen.add(key)
      hits.push({ phrase, category: rule.category, backedBy: rule.allowIfBackingHas })
    }
  }

  const blocked = options.mode === 'block' && hits.length > 0
  return { hits, blocked }
}
