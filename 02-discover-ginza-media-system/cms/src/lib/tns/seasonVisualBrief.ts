import type { SeasonType } from './types'

// VISUAL_ASSET_LIBRARY.md §2の世界観挿絵6タイプの表をそのまま方針テキスト化
// したもの（新しいビジュアル方針を作らない、既存資産の再利用）。実際の画像
// 生成は行わない——Human Editorialが挿絵を用意する際の指示書として使う。
const SEASON_BRIEFS: Record<SeasonType, string> = {
  SPRING: '桜、春らしい小物、柔らかい光。明るい春の銀座（VISUAL_ASSET_LIBRARY.md §2 SPRING）。',
  SUMMER: '団扇、朝顔、風鈴。涼感、夏の夕方〜宵の銀座（同 SUMMER）。',
  AUTUMN: '紅葉、秋の小物、読書・栗・銀杏等の文化・実りの気配。金、橙、深紅（同 AUTUMN）。',
  CHRISTMAS:
    '銀座のイルミネーション、クリスマスツリー、オーナメント、夜のWAKO（抽象化）。' +
    'サンタ・トナカイを主役にしない（同 CHRISTMAS）。',
  NEW_YEAR: '門松、水引、独楽、梅または椿。正月・新春の空気（同 NEW YEAR）。',
  WINTER: '正月後の冬。門松は使わない。椿、雪、冬木。白、藍、金を基調（同 WINTER）。',
}

export function deriveHeroVisualBrief(season: SeasonType): string {
  return (
    `世界観挿絵タイプ: ${season}。${SEASON_BRIEFS[season]} ` +
    'WAKOの建物を描く場合は独自生成の抽象化した街並みモチーフに限定し、公式写真・公式ロゴは使用しない' +
    '（Editorial Trust Layer／VISUAL_ASSET_LIBRARY.md §2.4）。マロン（犬）を主役にはせず、' +
    '登場させる場合もブランド署名の位置づけに留める。'
  )
}
