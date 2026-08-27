import type { CollectionConfig } from 'payload'

import {
  ERA_ELIGIBILITIES,
  GINZA_AFFINITY_EVIDENCES,
  MUSIC_GENRES,
  MUSIC_ORIGINS,
  SEASON_TYPES,
  TNS_EDITORIAL_CODES,
} from '../lib/tns/types'

function toOptions<T extends string>(values: readonly T[]) {
  return values.map((value) => ({ label: value, value }))
}

// TNS_SPEC.md §6.3「MusicTracks（楽曲マスタ）」。既存Tagsマスタと同じ
// 「マスタ管理・表記ゆれ防止」の設計パターンを踏襲する。歌詞・音源は
// 保持しない（Music Provenance原則、TNS_SPEC.md §3・CLAUDE.md第8章）。
//
// 【重要・2026-08-27の運用方針確定】このコレクションは**人間（マロン）が
// 事前に実在確認のうえ登録する曲のみを保持する**。AIによる自動投入・
// 自動生成は行わない——TNS選曲パイプライン（generateTnsWeeklyEditionDraft.ts）
// はこのコレクションに登録済みの曲からのみ選ぶ設計とすることで、「実在
// しない曲・歌手・年を生成しない」という要件を構造的に担保する。初期状態は
// 意図的に空（0件）——ゼロからのAI推測でシードすると誤った曲名・
// アーティスト・年を作ってしまうリスクがあるため（ユーザー確認済み）。
export const MusicTracks: CollectionConfig = {
  slug: 'music-tracks',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'artist', 'releaseYear', 'origin', 'verified', 'active', 'eraEligibility'],
    description:
      'TNS楽曲マスタ（TNS_SPEC.md §6.3）。マロンが実在確認済みの曲のみを登録すること。' +
      'TNS週次選曲（generateTnsWeeklyEditionDraft.ts）はここに登録済みの曲からのみ選ぶ。',
  },
  fields: [
    { name: 'title', label: '曲名', type: 'text', required: true },
    { name: 'artist', label: 'アーティスト', type: 'text', required: true },
    {
      name: 'releaseYear',
      label: '発表年',
      type: 'number',
      required: true,
    },
    {
      name: 'eraEligibility',
      label: '時代適格性',
      type: 'select',
      required: true,
      defaultValue: 'showa',
      options: toOptions(ERA_ELIGIBILITIES),
      admin: {
        description:
          'TNS Music Selection Logic Era Gate（TNS_SPEC.md §3.1）。showa=1926〜1989年内、' +
          'exception=1990年以降だが人間が明示承認した例外、out_of_scope=対象外（選曲候補から除外）',
      },
    },
    {
      name: 'origin',
      label: '邦楽／洋楽（japaneseOrWestern）',
      type: 'select',
      required: true,
      options: toOptions(MUSIC_ORIGINS),
      admin: {
        description:
          'マロン指示の「japaneseOrWestern」に対応する既存フィールド（2026-08-17導入済み）。' +
          '重複を避けるため新規フィールドは追加せず、この既存フィールドをそのまま使う。',
      },
    },
    {
      name: 'country',
      label: '国',
      type: 'text',
      admin: { description: '例：Japan／United States／France（任意入力、自由記述）' },
    },
    {
      name: 'language',
      label: '言語',
      type: 'text',
      admin: { description: '例：Japanese／English／French（任意入力、自由記述）' },
    },
    {
      name: 'genre',
      label: 'ジャンル',
      type: 'select',
      // 2026-08-27、マロン指摘を受け required を解除。「確認できない情報を
      // 推測で補完しない」原則に従い、公開note本文等で確認できていない
      // ジャンルは空欄のまま保持できるようにする（一般知識からの推定で
      // 必須項目を埋めることを避ける）。確認できた場合のみ人間が入力する。
      options: toOptions(MUSIC_GENRES),
    },
    {
      name: 'moodTags',
      label: '気分・情景タグ',
      type: 'text',
      hasMany: true,
      admin: { description: '気分・情景との対応タグ（自由入力、複数可）。TNS_SPEC.md §6.3のfixedMoodLabelとの緩い一致判定に使用（musicScoring.ts）' },
    },
    {
      name: 'weatherTags',
      label: '天気タグ',
      type: 'text',
      hasMany: true,
      admin: {
        description:
          'この曲が似合う天気（例：雨／晴れ／曇り／雪／霧）。7曲選定スコアリング（musicScoring.ts）が' +
          'その日の天気ラベルとの一致判定に使う（自由入力、複数可）。',
      },
    },
    {
      name: 'seasonTags',
      label: '季節タグ',
      type: 'select',
      hasMany: true,
      options: toOptions(SEASON_TYPES),
      admin: {
        description:
          'この曲が似合う季節（VISUAL_ASSET_LIBRARY.md §2.3の季節区分を再利用、新規区分は作らない）。',
      },
    },
    {
      name: 'ginzaCodeTags',
      label: 'GINZA CODE（TNS Editorial Code）タグ',
      type: 'select',
      hasMany: true,
      options: toOptions(TNS_EDITORIAL_CODES),
      admin: {
        description:
          'この曲が似合うTNS Editorial Code（Code1〜7、TNS_SPEC.md §4）。マロン指示の' +
          '「GINZA CODE」に対応する既存概念（新規定義ではない）。',
      },
    },
    {
      name: 'ginzaAffinity',
      label: '銀座との親和性',
      type: 'textarea',
      admin: {
        description: '昭和期の銀座の都市文化・情景との親和性の説明（TNS_SPEC.md §3.1）',
      },
    },
    {
      name: 'ginzaAffinityEvidence',
      label: '銀座親和性の根拠',
      type: 'select',
      defaultValue: 'unknown',
      options: toOptions(GINZA_AFFINITY_EVIDENCES),
      admin: {
        description:
          'verified=「銀座で実際に流れていた」等の出典あり、contextual=根拠不明だが文脈的親和性、unknown=未確認',
      },
    },
    {
      name: 'verified',
      label: '実在確認済み',
      type: 'checkbox',
      required: true,
      defaultValue: false,
      admin: {
        description:
          '人間（マロン）が曲名・アーティスト・発表年の実在を確認済みの場合のみtrueにする。' +
          '**verified=trueの曲だけが自動選曲（selectWeeklyTracks.ts）の対象になる**——falseのままの' +
          '曲は登録されていても週次選曲候補には一切現れない（マロン指示1の安全ゲート）。',
      },
    },
    {
      name: 'sourceNote',
      label: '確認根拠',
      type: 'textarea',
      admin: {
        description:
          'verified=trueにする根拠（例：公式ディスコグラフィで確認／過去のnote記事#12で使用実績あり等）。' +
          'verified=trueの場合は入力必須。',
      },
      validate: (value: unknown, { siblingData }: { siblingData?: { verified?: boolean } }) => {
        if (siblingData?.verified && (!value || String(value).trim() === '')) {
          return 'verified=trueにする場合、sourceNote（確認根拠）の入力が必須です。'
        }
        return true
      },
    },
    {
      name: 'active',
      label: '選曲候補として有効',
      type: 'checkbox',
      required: true,
      defaultValue: true,
      admin: {
        description:
          '一時的に選曲候補から外したい場合（権利関係の懸念等）はfalseにする。verifiedと異なり、' +
          'データ自体は保持したまま候補からのみ除外する（削除ではなく非活性化）。',
      },
    },
  ],
  timestamps: true,
}
