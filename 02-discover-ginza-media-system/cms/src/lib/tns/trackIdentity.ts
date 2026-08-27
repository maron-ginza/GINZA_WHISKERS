// 楽曲の表記ゆれ対策（2026-08-27、Project 02-1「核情報→最大5記事」の
// textSimilarity.tsと同じ「AI呼び出しなしの決定的正規化」方針を踏襲）。
//
// 【背景】同一の実在曲が、全角/半角・スペース・中黒（・）・長音表記の
// 揺れにより、MusicTracksへ意図せず複数レコードとして重複登録される
// 可能性がある（例：「プラスティック・ラブ」と「プラスチックラブ」）。
// idベースの重複判定（MusicUsageLedger.musicTrack）だけでは、こうした
// 「見た目は同じ曲だが別レコード」のケースをすり抜けてしまうため、
// title×artistの正規化フィンガープリントでも突き合わせる。
//
// NFKC正規化（全角/半角統一）→ 空白・中黒・長音記号・括弧類の除去→
// 小文字化、という素朴な処理に留める（contentRichness.ts等、本プロジェクトの
// 他の判定ロジックと同じ「フルNLPは使わない」方針）。
const NORMALIZE_STRIP_RE = /[\s・･\-–—ー()（）\[\]「」『』.,、。]/g

function normalizeForFingerprint(value: string): string {
  return value.normalize('NFKC').replace(NORMALIZE_STRIP_RE, '').toLowerCase()
}

export function computeTrackFingerprint(title: string, artist: string): string {
  return `${normalizeForFingerprint(title)}::${normalizeForFingerprint(artist)}`
}
