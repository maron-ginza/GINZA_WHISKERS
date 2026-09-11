import type { CollectionConfig } from 'payload'

import { evaluateReadyGate, type CommonArticleFacts, type TemplateType } from '../lib/template/readyGate'
import { buildArticleFactsReviewSummary } from '../lib/template/buildArticleFactsReviewSummary'

// GINZA WHISKERS / Project 02 改善 第2段階C Stage 1（2026-09-02）。
//
// 【役割】承認済み DiscoveredContent（催事）に、人間が構造化ファクト
// （申込期限・会場一覧・回次・テーマ 等）を付与するサイドカーコレクション。
// DiscoveredContent 自身のスキーマ・フック・データは一切変更しない
// （SourceSnapshots→SourceLedger / MusicUsageLedger→SoundtrackEditions /
//  StoryClusters→discovered-content と同じ「並行レイヤー + relationship」型）。
//
// 【この Stage の範囲】コレクション追加と型生成・ローカル検証まで。
// mapper（mapDiscoveredContentToEventFields）への接続は Stage 2（別承認）。
// この Stage では templateEligible の判定ロジックは何も変わらない
// ——現行の「templateEligible:false → human_review」経路をそのまま維持する。
//
// 【安全設計】
// - enrichmentStatus を 'ready' にできるのはログイン済みの人間のみ
//   （DiscoveredContent.curationStatus の人間ゲートと同型）。AI・自動化は不可。
// - 'ready' への遷移時に必須項目の充足を beforeChange で検査し、未充足なら reject
//   （「ready＝完全」を DB 側でも保証。Stage 2 の mapper eligible 判定の双子）。
// - 出典URL・確認日はここに持たせない。DiscoveredContent の機械確認値を使う
//   （sourceProvenanceFacts は「どの事実が confirmed か」だけを人間が記録）。
// - Postgres 識別子63文字制限（Articles.editorialProvenance の実機エラー教訓）
//   を踏まえ、select / array には短い dbName を明示する。

// 2026-09-07（根本改善）：マロンの操作を「承認／保留／却下」のいずれか1回に単純化する
// ラベル表記へ更新（value は既存のまま draft/ready/withdrawn。既存ロジック・DB値は無変更）。
const ENRICHMENT_STATUSES = [
  { label: '保留（下書きのまま・様子見）', value: 'draft' },
  { label: '承認（ready化・テンプレ生成可）', value: 'ready' },
  { label: '却下（取り下げ）', value: 'withdrawn' },
]

// 販売終了日の記載状況（sale 用。2026-09-07根本改善／2026-09-09）。
const SALE_AVAILABILITY_VALUES = [
  { label: '未確認', value: 'unknown' },
  { label: '販売中・終了日の公式記載なし（confirmed）', value: 'ongoing_no_end_stated' },
  { label: '販売期間の公式記載なし・店頭取扱商品（confirmed）', value: 'no_period_stated' },
  { label: '終了日の記載あり', value: 'has_end_date' },
]

// 入場料の該当性（event 系。2026-09-09）。'no' で paid 必須を免除する。
const ADMISSION_APPLICABLE_VALUES = [
  { label: '未記載（人間が paid を確定）', value: 'not_stated' },
  { label: '該当なし（商業画廊・物販フェア等・観覧料の概念なし／料金ラベルも公式に皆無）', value: 'no' },
  { label: '料金の記載あり（paid を free/paid で別途確定）', value: 'yes' },
]

const PAID_VALUES = [
  { label: '有料', value: 'paid' },
  { label: '無料', value: 'free' },
  { label: '未確認', value: 'unknown' },
]

const APPLY_REQUIRED_VALUES = [
  { label: '要（事前申込・抽選など）', value: 'yes' },
  { label: '不要', value: 'no' },
]

const SOURCE_TYPE_VALUES = [
  { label: 'Primary', value: 'primary' },
  { label: 'Official', value: 'official' },
  { label: 'Secondary', value: 'secondary' },
]

const FACT_TYPE_VALUES = [
  { label: '日付', value: 'date' },
  { label: '会場', value: 'venue' },
  { label: '料金', value: 'price' },
  { label: '予約', value: 'reservation' },
  { label: '営業時間', value: 'hours' },
  { label: 'アクセス', value: 'access' },
  { label: 'その他', value: 'other' },
]

const VERIFICATION_STATUS_VALUES = [
  { label: 'confirmed（本文に使う）', value: 'confirmed' },
  { label: 'unconfirmed（本文に出さない）', value: 'unconfirmed' },
  { label: 'conflicting（矛盾あり）', value: 'conflicting' },
]

// --- 共通 Article Facts（記事種別非依存化。2026-09-03、RUNBOOKS 付録 G.25）---
//
// 【編集カテゴリー】VISUAL_ASSET_LIBRARY §3.3 の正式18カテゴリー
// （2026-09-11、SWEETS を FOOD から分離し追加。呼称「18カテゴリー」は歴史的名称として維持）。
// カテゴリーアイコン選択と編集上の集計（ART 等）に使う。**記事テンプレート種別とは別概念**。
// 展覧会・個展も編集カテゴリーとしては ART（templateType=exhibition を編集カテゴリー扱いしない）。
// SWEETS＝菓子・デザート・アフタヌーンティーが主題のもの。FOOD＝単なる飲食店情報・食事メニュー
// （provisionalCategory.ts の TITLE_RULES が同じ切り分けを決定的に行う）。
const PRIMARY_CATEGORY_VALUES = [
  { label: 'グルメ / FOOD', value: 'FOOD' },
  { label: 'カフェ / CAFE', value: 'CAFE' },
  { label: 'スウィーツ / SWEETS', value: 'SWEETS' },
  { label: 'ショッピング / SHOPPING', value: 'SHOPPING' },
  { label: '名所・建築 / ARCHITECTURE', value: 'ARCHITECTURE' },
  { label: 'アート・文化 / ART', value: 'ART' },
  { label: 'イベント / EVENT', value: 'EVENT' },
  { label: 'バー・お酒 / NIGHT', value: 'NIGHT' },
  { label: '音楽・ライブ / MUSIC', value: 'MUSIC' },
  { label: 'ビューティー / BEAUTY', value: 'BEAUTY' },
  { label: 'ホテル / HOTEL', value: 'HOTEL' },
  { label: '癒し・リラクゼーション / WELLNESS', value: 'WELLNESS' },
  { label: 'トラベル・体験 / EXPERIENCE', value: 'EXPERIENCE' },
  { label: '手土産・ギフト / GIFT', value: 'GIFT' },
  { label: '学び・ワークショップ / WORKSHOP', value: 'WORKSHOP' },
  { label: 'フォトスポット / PHOTO', value: 'PHOTO' },
  { label: 'ファミリー / FAMILY', value: 'FAMILY' },
  { label: '夜景・ナイトスポット / NIGHT VIEW', value: 'NIGHT_VIEW' },
  { label: '雨の日おすすめ / RAINY DAY', value: 'RAINY_DAY' },
]

// 【記事テンプレート種別】必須項目・本文構造の切替に使う。readyGate.ts の TemplateType と一致。
// unknown のままでも draft 保存は可。ready 化・記事生成はできない（マロンが確定する）。
const TEMPLATE_TYPE_VALUES = [
  { label: '展覧会・個展・企画展（exhibition）', value: 'exhibition' },
  { label: '公募・コンテスト・作品募集（application）', value: 'application' },
  { label: 'ワークショップ・体験会・講座（workshop）', value: 'workshop' },
  { label: '商品・販売（sale）', value: 'sale' },
  { label: '恒例行事・回次あり（recurring_event）', value: 'recurring_event' },
  { label: '汎用（generic・専用テンプレのない種別のフォールバック）', value: 'generic' },
  { label: '未確定（unknown・ready 化不可）', value: 'unknown' },
]

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== ''
}

/** date 型（Date | ISO 文字列）を ISO 文字列へ（readyGate は文字列を期待する） */
function toIsoString(v: unknown): string {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString()
  if (typeof v === 'string') return v.trim()
  return ''
}

export const ArticleFacts: CollectionConfig = {
  slug: 'article-facts',
  admin: {
    useAsTitle: 'eventName',
    defaultColumns: [
      'eventName',
      'primaryCategory',
      'templateType',
      'enrichmentStatus',
      'discoveredContent',
      'humanReviewedAt',
      'updatedAt',
    ],
    description:
      '承認済み DiscoveredContent へ人間が構造化ファクトを付与するサイドカー（記事種別非依存の共通構造）。' +
      'templateType（exhibition / sale / application / workshop / recurring_event / generic / unknown）ごとに、' +
      'ready 化に必要な項目を evaluateReadyGate が判定する。unknown のままでも draft 保存は可、ready 化・記事生成は不可。' +
      '編集カテゴリー（primaryCategory・18種）はアイコン選択と集計用で、記事テンプレート種別とは別概念。' +
      '出典URL・確認日は持たず DiscoveredContent の機械確認値を使う。',
  },
  // DiscoveredContent / SourceSnapshots と同方針：非機密メタデータのため匿名読み取りを許可。
  // 書き込みは Payload 標準の認証必須デフォルト（Local API は overrideAccess で読み取りのみ想定）。
  access: {
    read: () => true,
  },
  // 1 DiscoveredContent = 1 enrichment。
  indexes: [{ fields: ['discoveredContent'], unique: true }],
  fields: [
    {
      name: 'discoveredContent',
      label: '対象 DiscoveredContent（承認済み・催事）',
      type: 'relationship',
      relationTo: 'discovered-content',
      required: true,
      hasMany: false,
      admin: {
        description:
          'curationStatus=approved の候補を選ぶ。この Stage では選択制約はコードで強制しない。',
      },
    },
    {
      name: 'enrichmentStatus',
      label: 'エンリッチ状態',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      dbName: 'af_enrichment_status',
      options: ENRICHMENT_STATUSES,
      admin: {
        description:
          '「承認（ready）」への変更はログイン済みの人間のみ（AI・自動化は不可）。必須項目が未充足だと承認にできない。' +
          '通常はこのプルダウンを操作せず、下の「候補要約」直下の承認／保留／却下ボタン（1クリックで保存完了）を使う。',
      },
    },
    {
      name: 'reviewSummary',
      label: '候補要約（自動生成・読み取り専用）',
      type: 'textarea',
      virtual: true,
      admin: {
        readOnly: true,
        description:
          '確認済み事実・出典・不足項目を自動要約する（保存されない・常に最新表示）。' +
          '不足項目があっても個別入力は必須ではない——公式情報を確認できなければ「保留」のまま保存してよい。',
      },
      hooks: {
        afterRead: [
          ({ siblingData }) => buildArticleFactsReviewSummary(siblingData as Record<string, unknown>),
        ],
      },
    },
    {
      name: 'decisionButtons',
      label: '',
      type: 'ui',
      admin: {
        components: {
          Field: '/src/components/ArticleFactsDecisionButtons#ArticleFactsDecisionButtonsField',
        },
      },
    },

    // --- 共通 Article Facts の分類（2026-09-03。編集カテゴリーと記事テンプレート種別は別概念） ---
    {
      name: 'primaryCategory',
      label: '編集カテゴリー（18種・アイコン選択と集計用）',
      type: 'select',
      dbName: 'af_primary_category',
      options: PRIMARY_CATEGORY_VALUES,
      admin: {
        description:
          '推測しない。未判定は空欄（＝未分類）のまま。展覧会・個展も編集カテゴリーは ART。' +
          '記事テンプレート種別（templateType）とは別。混同しない。',
      },
    },
    {
      name: 'templateType',
      label: '記事テンプレート種別（必須項目・本文構造の切替）',
      type: 'select',
      defaultValue: 'unknown',
      dbName: 'af_template_type',
      options: TEMPLATE_TYPE_VALUES,
      admin: {
        description:
          'unknown のままでも draft 保存は可。ready 化・記事生成はできない（マロンが確定する）。' +
          '18カテゴリー（primaryCategory）とは別概念。',
      },
    },

    // --- EventArticleFields に対応する構造化ファクト（すべて「入力どおり保持」前提） ---
    { name: 'season', label: '季節（例: 秋。無ければ空欄＝開催日から補完可）', type: 'text' },
    { name: 'eventName', label: 'イベント名（例: 銀茶会）', type: 'text' },
    { name: 'editionLabel', label: '回次ラベル（例: 第24回。無ければ空欄）', type: 'text' },
    { name: 'theme', label: 'テーマ（例: 和（わ）。無ければ空欄）', type: 'text' },
    { name: 'whatHappens', label: '何が行われるか（1文、入力どおり）', type: 'textarea' },
    {
      name: 'eventDate',
      label: '開催日（表示文字列そのまま。例: 2026年10月25日（日））',
      type: 'text',
    },
    {
      name: 'eventDateISO',
      label: '開催日（機械比較用の日付。過去/未来の判定に使う）',
      type: 'date',
    },
    { name: 'eventTime', label: '開催時間（例: 13時から16時まで）', type: 'text' },
    {
      name: 'venues',
      label: '会場・体験の一覧',
      type: 'array',
      dbName: 'article_facts_venues',
      labels: { singular: '会場', plural: '会場' },
      fields: [
        { name: 'name', label: '企画・体験名', type: 'text', required: true },
        { name: 'place', label: '場所', type: 'text', required: true },
      ],
    },
    {
      name: 'areaLead',
      label: 'エリア/企画数の前置き（例: 全銀座エリアに対応した3つの企画）',
      type: 'text',
    },
    { name: 'audienceNote', label: '対象読者の一文（〜に向いています。）', type: 'text' },
    {
      name: 'paid',
      label: '有料/無料',
      type: 'select',
      defaultValue: 'unknown',
      dbName: 'af_paid',
      options: PAID_VALUES,
      admin: {
        description:
          'イベント系（exhibition / recurring_event / application / workshop）は unknown のままだと ready にできない。' +
          'sale / generic は priceText で代替可（paid 任意）。',
      },
    },
    {
      name: 'priceText',
      label: '価格の表示文字列（sale / generic 用。paid 列とは別。例: 各1,980円（税込））',
      type: 'text',
      admin: {
        description:
          'sale テンプレートで ready 化に必須。値そのままを保持し、推測で補完しない。',
      },
    },
    {
      name: 'saleAvailability',
      label: '販売終了日の記載状況（sale 用）',
      type: 'select',
      defaultValue: 'unknown',
      dbName: 'af_sale_availability',
      options: SALE_AVAILABILITY_VALUES,
      admin: {
        description:
          '「販売中・終了日の公式記載なし」を確定すると、販売開始日が過去でも sale の ready 化を' +
          '妨げなくなる（2026-09-07根本改善。終了日が無い以上「過去」を判定できないため）。' +
          '公式本文に「発売中/販売中」の明記があり、完売・数量限定・期間限定等の終了を示す語が' +
          'ないことを確認できたときだけ選ぶ（推測しない）。',
      },
    },
    {
      name: 'admissionApplicable',
      label: '入場料の該当性（イベント系）',
      type: 'select',
      defaultValue: 'not_stated',
      dbName: 'af_admission_applicable',
      options: ADMISSION_APPLICABLE_VALUES,
      admin: {
        description:
          '「該当なし」を選ぶと、イベント系（exhibition / recurring_event / application / workshop）で ' +
          'paid（有料/無料）を未確認のままでも ready 化できる（2026-09-09）。商業画廊・物販フェア等で、' +
          '会場種別に観覧料の概念がなく、かつ公式本文にも料金ラベルが無いことを確認できたときだけ選ぶ' +
          '（「無料と推測」ではなく「入場料という項目が該当しないことの確認」）。料金の明示がある場合は' +
          '「料金の記載あり」を選び、paid を free/paid で確定する。',
      },
    },
    {
      name: 'applyRequired',
      label: '事前申込の要否',
      type: 'select',
      defaultValue: 'no',
      dbName: 'af_apply_required',
      options: APPLY_REQUIRED_VALUES,
    },
    {
      name: 'applyDeadline',
      label: '申込期限（applyRequired=要 のとき必須。表示文字列そのまま）',
      type: 'text',
    },
    { name: 'resultDate', label: '当選発表日（同上）', type: 'text' },
    { name: 'resultRule', label: '当選発表の方法（例: 当選者へのご連絡をもって発表に代える）', type: 'text' },
    { name: 'applyRule', label: '申込条件（末尾に句点を付けない）', type: 'textarea' },
    {
      name: 'officialInfoNote',
      label: '公式情報の補足（公開予定日・PDF での確認可否 等）',
      type: 'textarea',
    },
    {
      name: 'editorsNoteSeed',
      label: 'GINZA WHISKERS の編集後記（任意・1〜2文。空なら定型文にフォールバック）',
      type: 'textarea',
    },
    { name: 'closing', label: '結び（任意・1文。空ならテンプレ既定）', type: 'text' },
    { name: 'callToAction', label: '次の行動（任意。空ならテンプレ既定）', type: 'text' },
    {
      name: 'hashtags',
      label: 'ハッシュタグ（先頭 # 込み、入力どおり）',
      type: 'array',
      dbName: 'article_facts_hashtags',
      labels: { singular: 'タグ', plural: 'タグ' },
      fields: [{ name: 'tag', type: 'text', required: true }],
    },
    {
      name: 'sourceProvenanceFacts',
      label: '出典事実（confirmed のみ本文に使う）',
      type: 'array',
      dbName: 'article_facts_provenance',
      admin: {
        description:
          'どの事実が confirmed / unconfirmed / conflicting かを人間が記録する。' +
          'unconfirmed・conflicting は本文に出さない（既存の安全規則を維持）。',
      },
      fields: [
        { name: 'fact', type: 'text', required: true },
        {
          name: 'sourceType',
          type: 'select',
          dbName: 'af_prov_source_type',
          defaultValue: 'official',
          options: SOURCE_TYPE_VALUES,
        },
        {
          name: 'factType',
          type: 'select',
          dbName: 'af_prov_fact_type',
          defaultValue: 'other',
          options: FACT_TYPE_VALUES,
        },
        {
          name: 'verificationStatus',
          type: 'select',
          dbName: 'af_prov_verification',
          defaultValue: 'confirmed',
          options: VERIFICATION_STATUS_VALUES,
        },
      ],
    },

    // --- 監査情報 ---
    {
      name: 'enteredBy',
      label: '入力者（初回作成者）',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true, description: '作成時に自動記録（手動入力不可）' },
    },
    {
      name: 'humanReviewedBy',
      label: 'ready にした人',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true, description: 'ready 遷移時に自動記録（手動入力不可）' },
    },
    {
      name: 'humanReviewedAt',
      label: 'ready にした日時',
      type: 'date',
      admin: { readOnly: true },
    },
    { name: 'notes', label: '内部メモ（本文には出ない）', type: 'textarea' },
  ],
  hooks: {
    // DiscoveredContent.curationStatus の人間ゲートと同型。
    beforeChange: [
      async ({ data, originalDoc, req, operation }) => {
        if (operation === 'create' && req.user && !data.enteredBy) {
          data.enteredBy = req.user.id
        }

        const prevStatus: string | undefined = originalDoc?.enrichmentStatus
        const nextStatus: string | undefined = data.enrichmentStatus ?? prevStatus
        const enteringReady = nextStatus === 'ready' && prevStatus !== 'ready'

        if (enteringReady) {
          if (!req.user) {
            throw new Error(
              'enrichmentStatus を「ready」にするには、ログイン済みの人間による操作が必要です（AI・自動化スクリプトからの直接遷移は不可）',
            )
          }

          // 「ready＝完全」を保証する（記事種別ごとの必須項目・本文構造は
          // evaluateReadyGate に一本化。event 固定の必須判定は廃止した。2026-09-03）。
          const get = (k: string): unknown =>
            (data as Record<string, unknown>)[k] ??
            (originalDoc as Record<string, unknown> | undefined)?.[k]

          const templateType = (isNonEmptyString(get('templateType'))
            ? (get('templateType') as string)
            : 'unknown') as TemplateType

          const facts: CommonArticleFacts = {
            primaryCategory: (get('primaryCategory') as string | null) ?? null,
            templateType,
            contentTitle: (get('eventName') as string | null) ?? null,
            contentSummary: (get('whatHappens') as string | null) ?? null,
            availablePeriod: (get('eventDate') as string | null) ?? null,
            eventDateISO: toIsoString(get('eventDateISO')),
            eventTime: (get('eventTime') as string | null) ?? null,
            venues: (get('venues') as CommonArticleFacts['venues']) ?? null,
            priceText: (get('priceText') as string | null) ?? null,
            saleAvailability: (get('saleAvailability') as string | null) ?? null,
            admissionApplicable: (get('admissionApplicable') as string | null) ?? null,
            paid: (get('paid') as string | null) ?? null,
            applyRequired: (get('applyRequired') as string | null) ?? null,
            applyDeadline: (get('applyDeadline') as string | null) ?? null,
            resultDate: (get('resultDate') as string | null) ?? null,
            resultRule: (get('resultRule') as string | null) ?? null,
            applyRule: (get('applyRule') as string | null) ?? null,
            officialInfoNote: (get('officialInfoNote') as string | null) ?? null,
            editionLabel: (get('editionLabel') as string | null) ?? null,
            theme: (get('theme') as string | null) ?? null,
            areaLead: (get('areaLead') as string | null) ?? null,
            audienceNote: (get('audienceNote') as string | null) ?? null,
            hashtags: (get('hashtags') as CommonArticleFacts['hashtags']) ?? null,
            // confirmed 以外の事実は本文にも ready 判定にも使わない（readyGate 側で除外）。
            sourceProvenanceFacts:
              (get('sourceProvenanceFacts') as CommonArticleFacts['sourceProvenanceFacts']) ?? null,
            enrichmentStatus: 'ready',
          }

          const gate = evaluateReadyGate(facts, templateType)
          if (!gate.eligible) {
            throw new Error(
              `記事種別「${templateType}」を ready にできません（必須未充足）: ${gate.missing.join(' / ')}`,
            )
          }

          data.humanReviewedBy = req.user.id
          data.humanReviewedAt = new Date().toISOString()
        }

        return data
      },
    ],
  },
  timestamps: true,
}
