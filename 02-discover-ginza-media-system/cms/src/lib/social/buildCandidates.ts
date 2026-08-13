// Phase 15：Article.socialCopy（AI生成・記事承認時に編集長がレビュー済み）から
// SNS配信候補を作る純粋関数。新規のAI呼び出しは行わない（Create Once,
// Publish Everywhereの原則。Phase 14のANTHROPIC_API_KEY未検証状態にも依存しない）。

export const SOCIAL_CHANNELS = ['note', 'x', 'instagram'] as const
export type SocialChannel = (typeof SOCIAL_CHANNELS)[number]

interface LocalizedText {
  ja?: string | null
  en?: string | null
}

// locale=allで取得したArticle.socialCopyの生値。payload-types.tsは'all'を
// 型としてモデル化しないため、呼び出し側でこの形にキャストする
// （site/src/lib/payload.tsのLocalized<T>パターンと同じ考え方）。
export interface ArticleSocialCopyRaw {
  note?: LocalizedText | null
  x?: LocalizedText | null
  instagram?: LocalizedText | null
}

export interface SocialPostCandidate {
  channel: SocialChannel
  copy: { ja: string; en: string }
}

function hasText(t?: LocalizedText | null): boolean {
  return Boolean(t && ((t.ja && t.ja.trim().length > 0) || (t.en && t.en.trim().length > 0)))
}

/**
 * publishHistoryに記録済みのチャネルは既に配信済みとみなし候補化しない
 * （CONTENT_MODEL.md 2.6節 PublishRecordの二重配信防止思想を踏襲）。
 */
export function buildSocialPostCandidates(
  socialCopy: ArticleSocialCopyRaw | null | undefined,
  alreadyPublishedChannels: ReadonlySet<string>,
): SocialPostCandidate[] {
  const candidates: SocialPostCandidate[] = []
  const copy = socialCopy ?? {}

  for (const channel of SOCIAL_CHANNELS) {
    if (alreadyPublishedChannels.has(channel)) continue

    const text = copy[channel]
    if (!hasText(text)) continue

    candidates.push({
      channel,
      copy: {
        ja: text?.ja?.trim() ?? '',
        en: text?.en?.trim() ?? '',
      },
    })
  }

  return candidates
}
