// GINZA WHISKERS Note Auto-Transfer — note編集画面URL判定（2026-09-14新設）。
//
// 実際の編集画面URLは https://editor.note.com/notes/{noteId}/edit/ である
// ことが判明したため（旧想定 https://note.com/notes/new は「新規作成の
// 入口」であり、実際の編集はeditor.note.comサブドメインへ遷移してから行われる）、
// この判定ロジックを isomorphic（Service Worker からも Node のテストからも
// 同じ関数を使う）な形で1箇所に切り出す——background.js と content.js の
// URL判定がズレて片方だけ対応漏れになる事態を防ぐ。
//
// IIFEで包み、グローバルスコープを汚染しない（importScripts経由でbackground.js
// と同一トップレベルスコープに読み込まれるため、const/functionの再宣言衝突を
// 避けるためにも名前空間オブジェクト self.NoteUrlMatch 経由でのみ公開する）。
//
// 【互換性】旧 note.com URL（https://note.com/notes/new、
// https://note.com/<username>/n/<noteId>/edit）も引き続き対象とする
// （note側の将来的な巻き戻し・A/Bテスト等への保険）。

;(function (global) {
  /**
   * 与えられたURLが「note下書き編集画面として扱ってよい」ものかを判定する。
   * @param {string} url
   * @returns {boolean}
   */
  function isNoteEditorTargetUrl(url) {
    if (!url || typeof url !== 'string') return false
    let u
    try {
      u = new URL(url)
    } catch {
      return false
    }
    if (u.protocol !== 'https:') return false

    // 新URL：https://editor.note.com/* を丸ごと対象とする
    // （/notes/{noteId}/edit/ が主だが、noteId採番前の中間状態等も広く拾う）。
    if (u.hostname === 'editor.note.com') return true

    // 旧URL（互換性維持）：
    //   - https://note.com/notes/new（新規作成の入口）
    //   - https://note.com/<username>/n/<noteId>/edit（旧編集画面）
    if (u.hostname === 'note.com') {
      if (/^\/notes\/new/.test(u.pathname)) return true
      if (/^\/[^/]+\/n\/[^/]+\/edit/.test(u.pathname)) return true
    }
    return false
  }

  /** background.js が新規タブを開く際の既定URL（note.com側の新規作成入口。
   * 実際の編集は最終的に editor.note.com へ遷移する）。 */
  const NOTE_NEW_DRAFT_URL = 'https://note.com/notes/new'

  const api = { isNoteEditorTargetUrl, NOTE_NEW_DRAFT_URL }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  } else if (global) {
    global.NoteUrlMatch = api
  }
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis)
