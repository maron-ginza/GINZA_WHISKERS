import { PILLAR_NAMES } from '../../collections/Tags'
import { normalizeThemeKey } from './normalizeThemeKey'

// Project 02-2 収益化②：テーマ → 収蔵室（6本柱）ヒント（2026-08-28）。
//
// 【役割】プレマッチ段1で「包含」も「テーマ側バイグラム被覆率 ≥ C_MATCH」も
// 全滅したとき（＝抽象度の高いテーマや語形が銀座記事タイトルと語を共有しない
// テーマ）の最後のフォールバック。類似度は一切使わず、手編集の
// 「ヒントキー（部分文字列）→ 収蔵室名」対応表の exact 部分一致で解決する。
//
// 【既知の制約】承認済み DiscoveredContent の収蔵室は
// CONTENT_TYPE_TO_PILLAR_NAME（contentType 由来）で解決するため、実際に
// 当たり得るのは「イベント」「アート」「文化」の3値のみ（歴史/建築/人物は
// contentType からは出てこない）。そのためヒント表に「歴史」「建築」「人物」を
// 書いても現状はマッチしないが、将来 DiscoveredContent 側の収蔵室解決が
// 精緻化されたときにそのまま効くよう、意味的に正しい対応を残しておく。
type PillarName = (typeof PILLAR_NAMES.ja)[number]

// キーは正規化済み（normalizeThemeKey 適用後）の部分文字列で照合する。
// 実データ（interest-themes）を見ながら追記していく生きた表。
const THEME_KEYWORD_TO_PILLARS: { keyword: string; pillars: PillarName[] }[] = [
  { keyword: '写真', pillars: ['アート', '人物'] },
  { keyword: 'カメラ', pillars: ['アート'] },
  { keyword: '展示', pillars: ['アート'] },
  { keyword: '展覧会', pillars: ['アート'] },
  { keyword: '個展', pillars: ['アート'] },
  { keyword: 'アート', pillars: ['アート'] },
  { keyword: '美術', pillars: ['アート'] },
  { keyword: '工芸', pillars: ['アート', '文化'] },
  { keyword: 'デザイン', pillars: ['アート'] },
  { keyword: '旅', pillars: ['文化', '建築'] },
  { keyword: '旅行', pillars: ['文化', '建築'] },
  { keyword: '建築', pillars: ['建築'] },
  { keyword: 'たてもの', pillars: ['建築'] },
  { keyword: 'ビル', pillars: ['建築'] },
  { keyword: 'カフェ', pillars: ['文化'] },
  { keyword: '喫茶', pillars: ['文化'] },
  { keyword: '珈琲', pillars: ['文化'] },
  { keyword: 'コーヒー', pillars: ['文化'] },
  { keyword: 'グルメ', pillars: ['文化'] },
  { keyword: '食', pillars: ['文化'] },
  { keyword: 'レシピ', pillars: ['文化'] },
  { keyword: '読書', pillars: ['文化', '人物'] },
  { keyword: '本', pillars: ['文化', '人物'] },
  { keyword: '書店', pillars: ['文化'] },
  { keyword: 'エッセイ', pillars: ['文化', '人物'] },
  { keyword: '日記', pillars: ['文化'] },
  { keyword: '歴史', pillars: ['歴史'] },
  { keyword: '昭和', pillars: ['歴史', '文化'] },
  { keyword: 'イベント', pillars: ['イベント'] },
  { keyword: 'フェス', pillars: ['イベント'] },
  { keyword: '音楽', pillars: ['アート', 'イベント'] },
  { keyword: 'ライブ', pillars: ['イベント'] },
  { keyword: '映画', pillars: ['アート', '文化'] },
  { keyword: 'ファッション', pillars: ['文化', 'アート'] },
  { keyword: '着物', pillars: ['文化', '歴史'] },
]

// テーマに含まれるヒントキーから、対応する収蔵室名の集合（重複排除）を返す。
// 何も当たらなければ空配列。
export function resolvePillarHints(theme: string): PillarName[] {
  const key = normalizeThemeKey(theme)
  const hit = new Set<PillarName>()
  for (const entry of THEME_KEYWORD_TO_PILLARS) {
    if (key.includes(normalizeThemeKey(entry.keyword))) {
      for (const p of entry.pillars) hit.add(p)
    }
  }
  return Array.from(hit)
}
