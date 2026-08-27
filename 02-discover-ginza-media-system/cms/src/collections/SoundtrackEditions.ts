import type { CollectionConfig } from 'payload'

import { TNS_EDITORIAL_CODES, WEATHER_SOURCES, WEEKDAYS } from '../lib/tns/types'

function toOptions<T extends string>(values: readonly T[]) {
  return values.map((value) => ({ label: value, value }))
}

// TNS_SPEC.md §6.2「SoundtrackEditions（週次エディション本体）」の
// 必要最小限の差分実装（2026-08-27）。
//
// 【スコープの絞り込み（今回のマロン指示に基づく判断）】
// - `humanApproval`（5フラグのApprove All）グループは実装しない——
//   マロン指示「既存reviewStatusを利用する」に従い、実際の承認ゲートは
//   本コレクションではなく、生成されたnote記事（`generatedArticle`が
//   参照する`articles`コレクション、既存`reviewStatus`）で行う設計にした。
//   本コレクションはあくまで生成の元になった構造化データを保持するだけ。
// - `qualityCheck`（AI自己採点4項目）は今回未実装——「最低限1週間分の
//   draft生成」というマロンの到達目標に対しては必須ではないため、次工程
//   として残す（§8で報告）。
// - `ginzaEvents`（既存dailyRanking再利用）も今回未接続——TNS_SPEC.md
//   v1.1で既に「主要入力ではなく補助情報」に格下げ済みのため、今回のスコープ
//   では省略し次工程に残す。
export const SoundtrackEditions: CollectionConfig = {
  slug: 'soundtrack-editions',
  admin: {
    useAsTitle: 'editionNumber',
    defaultColumns: ['editionNumber', 'weekStart', 'weekEnd', 'status', 'generatedArticle'],
    description:
      '🌈Tokyo Nostalgic Soundtrack 週次エディション（TNS_SPEC.md §6.2、必要最小限の差分実装）。' +
      '生成された記事本体は`generatedArticle`が参照するArticles側（reviewStatus）で承認する。',
  },
  fields: [
    { name: 'weekStart', label: '週開始日（月）', type: 'date', required: true, index: true },
    { name: 'weekEnd', label: '週終了日（日）', type: 'date', required: true },
    {
      name: 'editionNumber',
      label: 'エディション番号',
      type: 'number',
      unique: true,
      admin: {
        description:
          '生成時に既存の最新SoundtrackEditions.editionNumber+1を自動採番（2026-08-27〜、' +
          '固定カウンタ方式から変更）。note.com側の実際の連番と齟齬が生じた場合は' +
          'ここを直接編集して補正できる（readOnlyを解除済み）。',
      },
    },
    {
      name: 'status',
      label: 'ステータス',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: '生成済み（記事下書き作成前）', value: 'draft' },
        { label: '記事下書き作成済み', value: 'article_generated' },
        { label: '過去号の遡及登録（CMS外で公開済み）', value: 'historical_import' },
      ],
      admin: {
        description:
          '本コレクション独自の簡易ステータス（承認ゲートではない）。実際の人間承認は' +
          'generatedArticleが参照するArticles.reviewStatusで行う。' +
          '2026-08-27追加：historical_importは、本CMS運用開始前にnote.comへ直接公開済みの' +
          '過去号（#33〜等）をMusicUsageLedgerの重複防止台帳として遡及登録する際に使う' +
          '——generatedArticleは持たない（本CMSで記事生成した実績がないため）。',
      },
    },
    {
      name: 'generatedArticle',
      label: '生成された記事',
      type: 'relationship',
      relationTo: 'articles',
      admin: { description: 'この週次エディションから生成されたnote記事（reviewStatus: draft）' },
    },
    {
      name: 'context',
      label: 'Context（STEP1 Fact + STEP2 Emotion）',
      type: 'group',
      fields: [
        { name: 'season', type: 'text', admin: { readOnly: true, description: 'weekStartから決定的に算出（VISUAL_ASSET_LIBRARY.md §2.3の季節区分）' } },
        {
          name: 'weather',
          type: 'group',
          fields: [
            { name: 'weekSummary', type: 'text' },
            {
              name: 'daily',
              type: 'array',
              fields: [
                { name: 'date', type: 'date', required: true },
                { name: 'conditionLabel', type: 'text', required: true },
                { name: 'tempHighC', type: 'number' },
                { name: 'tempLowC', type: 'number' },
              ],
            },
            {
              name: 'weatherSource',
              type: 'select',
              options: toOptions(WEATHER_SOURCES),
              admin: { description: "'api'=Open-Meteo自動取得／'manual'=マロン手入力／'ai_retrieved'=将来拡張" },
            },
          ],
        },
        {
          name: 'maronWeeklyObservation',
          label: '今週の銀座を一言で（週次唯一の必須手入力）',
          type: 'textarea',
          admin: {
            description:
              'TNS_SPEC.md §6.2「週次唯一の必須手入力」。CLI/エンドポイント呼び出し時に' +
              'マロンが渡す。未入力の場合は生成前にエラーとする。',
          },
        },
        {
          name: 'maronOptional',
          label: 'マロン任意入力',
          type: 'group',
          fields: [
            { name: 'mustIncludeEvent', type: 'text' },
            { name: 'preferredTracks', type: 'relationship', relationTo: 'music-tracks', hasMany: true },
            { name: 'excludedTracks', type: 'relationship', relationTo: 'music-tracks', hasMany: true },
            { name: 'fieldworkNotes', type: 'textarea' },
          ],
        },
      ],
    },
    {
      name: 'editorialTheme',
      label: 'Editorial Theme（STEP2〜3・STEP5週レベル）',
      type: 'group',
      fields: [
        { name: 'coreTheme', type: 'text' },
        { name: 'emotion', type: 'text' },
        { name: 'lifeTheme', type: 'text' },
        { name: 'ginzaExperience', type: 'text' },
        { name: 'japaneseTitleCandidates', type: 'text', hasMany: true },
        { name: 'englishSubtitle', type: 'text' },
        { name: 'hook', type: 'textarea' },
        { name: 'afterglow', type: 'textarea' },
      ],
    },
    {
      name: 'dailyScenes',
      label: 'Daily Scenes（STEP2〜4、7日分）',
      type: 'array',
      minRows: 7,
      maxRows: 7,
      fields: [
        { name: 'date', type: 'date', required: true },
        { name: 'weekday', type: 'select', required: true, options: WEEKDAYS.map((w) => ({ label: w, value: w })) },
        {
          name: 'tnsEditorialCode',
          label: 'TNS Editorial Code',
          type: 'group',
          admin: {
            description:
              'TNS_SPEC.md §4。マロンの指示文中の「GINZA CODE」に対応する既存概念（新規定義ではない）。',
          },
          fields: [
            { name: 'code', type: 'select', options: TNS_EDITORIAL_CODES.map((c) => ({ label: c, value: c })) },
            { name: 'fixedMoodLabel', type: 'text', admin: { description: 'TNSSettings.codeFixedMoodLabelsから参照（上書き可）' } },
            { name: 'weeklyEnglishSubtitle', type: 'text', admin: { description: '週替わりで生成される英語ナラティブ副題' } },
          ],
        },
        { name: 'emotion', type: 'text' },
        { name: 'ginzaExperience', type: 'text' },
        { name: 'sceneDescription', type: 'textarea' },
        { name: 'editorialPointOfView', type: 'textarea' },
        {
          name: 'musicSelected',
          type: 'group',
          fields: [
            { name: 'trackRef', type: 'relationship', relationTo: 'music-tracks' },
            {
              name: 'pendingHumanSelection',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                description:
                  'MusicTracksに適格な候補がない（または重複回避後に候補が尽きた）場合true。' +
                  '記事生成自体は止めず、この日の曲は「選定中」として人間確認へ回す。',
              },
            },
            { name: 'internalReason', type: 'textarea', admin: { description: '非公開の内部選定根拠' } },
            { name: 'readerFacingComment', type: 'textarea', admin: { description: 'note本文用の短い編集コメント' } },
          ],
        },
      ],
    },
    {
      name: 'music',
      label: 'Music（週全体）',
      type: 'group',
      fields: [
        {
          name: 'musicBalance',
          type: 'group',
          fields: [
            { name: 'policy', type: 'text', admin: { readOnly: true } },
            { name: 'effectiveJapaneseCount', type: 'number', admin: { readOnly: true } },
            { name: 'effectiveInternationalCount', type: 'number', admin: { readOnly: true } },
            { name: 'pendingCount', type: 'number', admin: { readOnly: true, description: 'pendingHumanSelectionの日数' } },
          ],
        },
      ],
    },
    {
      name: 'visual',
      label: 'Visual',
      type: 'group',
      admin: {
        description:
          'VISUAL_ASSET_LIBRARY.md・CHARACTER_STANDARD.mdとの接続点。実際の画像生成は行わず、' +
          '方針テキストのみ生成する（既存Image生成パイプラインは未接続、§9参照）。',
      },
      fields: [
        { name: 'heroVisualBrief', type: 'textarea', admin: { description: '世界観挿絵の方針（季節タイプ等、VISUAL_ASSET_LIBRARY.md §2.3参照）' } },
        { name: 'heroImageAsset', type: 'relationship', relationTo: 'image-assets' },
        {
          name: 'visualStatus',
          type: 'select',
          defaultValue: 'pending_selection',
          options: [
            { label: '未選定（人間確認待ち）', value: 'pending_selection' },
            { label: '選定済み', value: 'attached' },
          ],
        },
      ],
    },
  ],
  timestamps: true,
}
