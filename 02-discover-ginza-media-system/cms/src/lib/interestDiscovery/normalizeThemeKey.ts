// Theme正規化（2026-08-27、Phase A統合ロジック 承認済み方針）。
//
// 【原則（マロン承認、2026-08-27）】正規化は「表記ゆれの解消」までに限定し、
// 「意味的な統合」は行わない。NFKC（全角/半角統一）・前後空白トリム・内部空白
// 圧縮・ASCII文字の大文字小文字統一・先頭#の除去のみを行う。
// 「旅」「旅行」「旅行記」のような語幹の近い別概念を機械的に同一視することは
// しない——これは近似候補として別途フラグを立てるのみ（computeInterestScore.ts
// のfindNearDuplicateCandidates参照）、自動統合は人間承認後にのみ行う。
export function normalizeThemeKey(theme: string): string {
  return theme
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^#/, '')
    .replace(/[A-Za-z]/g, (c) => c.toLowerCase())
}
