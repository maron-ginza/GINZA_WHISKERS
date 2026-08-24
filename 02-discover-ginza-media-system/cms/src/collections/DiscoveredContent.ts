import type { CollectionConfig } from 'payload'

import {
  ARTICLE_FETCH_STATUS_LABELS,
  ARTICLE_FETCH_STATUSES,
  CONTENT_TYPE_LABELS,
  CONTENT_TYPES,
  CURATION_STATUS_LABELS,
  CURATION_STATUSES,
  DISCOVERY_STATUS_LABELS,
  DISCOVERY_STATUSES,
} from '../lib/crawler/discoveredContentTypes'
import { CONTENT_RICHNESS_TIER_LABELS, CONTENT_RICHNESS_TIERS } from '../lib/curation/contentRichness'
import {
  EDITORIAL_SCORE_MAX,
  GENDER_AFFINITY_LABELS,
  GENDER_AFFINITY_VALUES,
  GENERATION_LABELS,
  GENERATION_VALUES,
  SCORING_METHOD_LABELS,
  SCORING_METHODS,
  VISIT_STYLE_LABELS,
  VISIT_STYLE_VALUES,
} from '../lib/curation/types'
import { UX_TYPE_LABELS, UX_TYPES } from '../lib/curation/uxType'

function toOptions<T extends string>(values: readonly T[], labels: Record<T, string>) {
  return values.map((value) => ({ label: labels[value], value }))
}

type CurationState = (typeof CURATION_STATUSES)[number]
// approved/rejectedはSources.tsのeditorial.editorialStatusと同じ考え方——
// 「Maron Editor's Choice」による人間の最終承認・却下のみがこの状態へ進める。
const HUMAN_GATED_STATES: CurationState[] = ['approved', 'rejected']

// トップページ更新検知 → 個別記事・イベント抽出（2026-08-17）。
//
// 既存パイプライン（SOURCE LEDGER→Snapshot→Diff→Sources→Inbox→Editorial
// Score）はサイト単位（トップページ全体）の粒度だった。本コレクションは
// その先の工程として、トップページ上で見つかった個別記事・イベントの
// URL単位でエンティティを持つ——「何が新規／更新されたか」を具体的に
// 特定できるようにする。
//
// 【既存実装との関係（最小変更の原則）】
// - `Sources`・`SourceLedger`・`SourceSnapshots`のスキーマ・フック・
//   アクセス制御は一切変更していない。本コレクションは独立した並行の
//   レイヤーとして追加した。
// - 生成元は`SourceLedger`（サイト単位の情報源台帳）——`sourceSite`で
//   参照する。`Sources`（サイト単位のInbox候補）とは接続しない
//   （二重の承認導線を作らないため。個別記事・イベントの承認は本
//   コレクション自身の`curationStatus`で完結する）。
// - スコアリング（editorialScore/audienceTags）はSources.tsと同一の
//   フィールド構成・同一のスコアリング関数（lib/curation/scoreSource.ts・
//   heuristicScore.ts）を再利用する——AIロジックの重複実装はしていない。
//
// 【1記事1行のモデル】SourceSnapshots（1巡回=1行の追記ログ）とは異なり、
// SourceLedgerと同様「1URL=1行」の永続エンティティとして扱う
// （`lastCheckedAt`/`lastChangedAt`的な最新状態の更新方式）。個別記事ごとの
// 巡回履歴ログは今回のスコープ外——discoveryStatusは「直近の検知で
// 何が起きたか」を表す現在値のみを保持する。
//
// 【URL正規化と重複耐性】articleUrlは正規化後の値（lib/crawler/
// normalizeUrl.ts）。将来正規化ロジック自体を変更する場合に備え、
// 元の生URL（rawUrl）も保持し、再正規化を生データから再現できるように
// している（SOURCE LEDGERのnormalizedContentHash導入時に得た教訓と
// 同じ考え方）。
export const DiscoveredContent: CollectionConfig = {
  slug: 'discovered-content',
  admin: {
    useAsTitle: 'title',
    defaultColumns: [
      'contentType',
      'discoveryStatus',
      'title',
      'sourceSite',
      'detectedAt',
      'curationStatus',
    ],
    description:
      'トップページ更新検知から抽出した個別記事・イベント候補（2026-08-17）。' +
      '1URL=1行の永続エンティティ。生成ロジック：cms/src/lib/crawler/extractLinks.ts・' +
      'fetchArticlePage.ts・cms/src/lib/curation/processDiscoveredLinks.ts',
  },
  // 機密性のないメタデータであり、SourceLedger/SourceSnapshotsと同様の方針で
  // 匿名読み取りを許可する（将来の巡回ワーカー・GINZA Conciergeからの読み取りも想定）。
  access: {
    read: () => true,
  },
  // (sourceSite, articleUrl)の組み合わせが重複判定キー。DBレベルでも一意性を
  // 強制することで、並行実行等による重複行の作成を防ぐ（アプリ側でも
  // 事前find-then-createで冪等性を担保するが、二重の防衛ライン）。
  indexes: [{ fields: ['sourceSite', 'articleUrl'], unique: true }],
  fields: [
    {
      name: 'sourceSite',
      label: 'Source Site',
      type: 'relationship',
      relationTo: 'source-ledger',
      required: true,
      index: true,
    },
    {
      name: 'articleUrl',
      label: 'Article/Event URL（正規化後）',
      type: 'text',
      required: true,
      index: true,
      admin: { description: '重複判定キー。lib/crawler/normalizeUrl.tsで正規化済み' },
    },
    {
      name: 'rawUrl',
      label: '生URL（正規化前）',
      type: 'text',
      admin: {
        readOnly: true,
        description: 'トップページ上で実際に見つかった生のhref値。再正規化が必要になった際の参照用',
      },
    },
    {
      name: 'title',
      type: 'text',
      admin: {
        description:
          'Stage 2（個別ページ取得）が成功していれば記事自身の<title>、' +
          '未取得の場合はトップページ上のアンカーテキストを暫定titleとして使用',
      },
    },
    {
      name: 'publishedAt',
      label: '公開日 (publishedAt)',
      type: 'date',
      admin: {
        description:
          '構造化データ（JSON-LD datePublished／article:published_timeメタタグ等）から' +
          '取得できた場合のみ設定。取得できない場合はnullのまま——本文中の日付表現からの' +
          '推測はしない（誤認防止のため）',
      },
    },
    {
      name: 'contentUpdatedAt',
      label: '記事更新日時 (updatedAt)',
      type: 'date',
      admin: {
        description:
          'Payload標準の`updatedAt`（このDBレコード自体の更新時刻）と意味が異なるため' +
          '別名にしている——こちらは記事自身が構造化データで申告する更新日時',
      },
    },
    {
      name: 'eventStartAt',
      label: '開催開始日 (eventStartAt)',
      type: 'date',
      admin: { description: '構造化データ（JSON-LD Event.startDate等）から取得できた場合のみ' },
    },
    {
      name: 'eventEndAt',
      label: '開催終了日 (eventEndAt)',
      type: 'date',
      admin: { description: '構造化データ（JSON-LD Event.endDate等）から取得できた場合のみ' },
    },
    {
      name: 'venue',
      label: '会場 (venue)',
      type: 'text',
      admin: {
        description:
          '構造化データ（JSON-LD Event.location.name等）から取得できた場合のみ設定。' +
          '取得できない場合はnullのまま——本文中の自由テキストからの推測はしない' +
          '（日付フィールドと同じ「推測しない」原則、2026-08-17 Source Coverage拡張）',
      },
    },
    {
      name: 'imageUrl',
      label: '代表画像URL',
      type: 'text',
      admin: {
        description:
          '記事・イベントページのog:image（未取得の場合はtwitter:image）から取得した' +
          '絶対URL。取得できない場合はnullのまま——推測での補完はしない' +
          '（2026-08-18）。画像ファイル自体はダウンロード・保存しない。' +
          '取得元：cms/src/lib/crawler/extractImageUrl.ts',
      },
    },
    {
      name: 'imageUrlSource',
      label: '代表画像URLの取得元',
      type: 'select',
      options: [
        { label: 'og:image', value: 'og_image' },
        { label: 'twitter:image', value: 'twitter_image' },
      ],
      admin: { readOnly: true, description: 'imageUrlがどのメタタグから取得されたか' },
    },
    {
      name: 'dateExtraction',
      label: '日付抽出の根拠（Event Date Extraction、2026-08-17）',
      type: 'json',
      admin: {
        readOnly: true,
        description:
          'publishedAt/contentUpdatedAt/eventStartAt/eventEndAtそれぞれについて、' +
          '抽出元（source: json_ld/meta/time_tag/body_label）と信頼度（confidence: ' +
          'high/medium）、Tier 3（body_label）の場合は根拠となった本文の生テキスト片' +
          '（rawMatch）を保持する。取得元：cms/src/lib/crawler/extractStructuredDates.ts',
      },
    },
    {
      name: 'excerpt',
      label: 'Excerpt / Summary',
      type: 'textarea',
      maxLength: 1300,
    },
    {
      name: 'detectedAt',
      label: '検知日時 (detectedAt)',
      type: 'date',
      required: true,
      index: true,
      admin: {
        description:
          '直近の巡回でこのURLを確認した日時（毎回更新——discoveryStatusがunchangedでも更新する）。' +
          '「最初に検知した日時」はPayload標準の`createdAt`が正確に表す——本レコードは' +
          'first_seen時にのみ新規作成されるため、`createdAt`＝初回検知日時になる',
      },
    },
    {
      name: 'discoveryStatus',
      label: '検知種別',
      type: 'select',
      required: true,
      options: toOptions(DISCOVERY_STATUSES, DISCOVERY_STATUS_LABELS),
      index: true,
    },
    {
      name: 'contentType',
      type: 'select',
      required: true,
      defaultValue: 'other',
      options: toOptions(CONTENT_TYPES, CONTENT_TYPE_LABELS),
    },
    {
      name: 'uxType',
      label: '参加／体験型UXタイプ',
      type: 'select',
      options: toOptions(UX_TYPES, UX_TYPE_LABELS),
      admin: {
        description:
          '「見る・買う」だけでなく「参加する・体験する・味わう・作る・聴く」等、' +
          'どんな種類の体験につながる情報かを示す補助的な分類（2026-08-18）。' +
          'Editorial Scoreには一切影響しない——優劣をつける軸ではなく、Editor\'s Choiceの' +
          '判断材料としての付加情報（Audience Tagsと同じ位置づけ）。タイトル・excerptからの' +
          'キーワード判定（AI呼び出しなし）。ロジック：cms/src/lib/curation/uxType.ts',
      },
    },
    {
      name: 'linkFingerprint',
      label: 'リンク指紋（変化検知用）',
      type: 'text',
      admin: {
        readOnly: true,
        description:
          'Stage 2未取得時はアンカーテキストのハッシュ、取得済みの場合は記事本文excerptの' +
          'ハッシュ。次回巡回時にこれと比較しdiscoveryStatusのchanged/unchangedを判定する',
      },
    },
    {
      name: 'articleFetchStatus',
      label: '個別ページ取得状況',
      type: 'select',
      required: true,
      defaultValue: 'not_fetched',
      options: toOptions(ARTICLE_FETCH_STATUSES, ARTICLE_FETCH_STATUS_LABELS),
      admin: {
        description:
          'Stage 2（個別記事・イベントページの実HTTP取得）を実行したかどうか。' +
          'コスト制御のため1巡回あたりの取得件数に上限がある（processDiscoveredLinks.ts）',
      },
    },
    {
      name: 'lastCheckedAt',
      label: '最終確認日時',
      type: 'date',
      admin: { description: 'このURLを最後に（Stage 1リンク一覧上で）確認した日時。unchangedでも毎回更新される' },
    },
    {
      name: 'lastChangedAt',
      label: '最終変化検知日時',
      type: 'date',
      admin: {
        description:
          'discoveryStatusがfirst_seen／changedになった回のみ更新される（SourceLedger.' +
          'lastChangedAtと同じ考え方）。「本日新規/更新」の判定はこちらを使う——' +
          'detectedAtは毎回更新されるため、同日に2回以上巡回すると2回目の"unchanged"判定で' +
          'detectedAtだけを見ると当日発見分が判定から漏れてしまう（2026-08-17、実地テストで' +
          '発見・修正）',
      },
    },
    {
      name: 'editorialScore',
      label: 'Editorial Score（旬の銀座、合計100点）',
      type: 'group',
      admin: {
        description:
          'Sources.editorialScoreと同一構成。個別記事・イベント単位でAI（Editorial Desk）が' +
          '付与する構造化スコア——採否を決めるものではなく順位付けのための参考情報',
      },
      fields: [
        { name: 'now', label: `NOW / 今だけ性（0〜${EDITORIAL_SCORE_MAX.now}）`, type: 'number', min: 0, max: EDITORIAL_SCORE_MAX.now },
        { name: 'nowReason', label: 'NOW 判定理由', type: 'text' },
        { name: 'ginza', label: `GINZA / 銀座固有性（0〜${EDITORIAL_SCORE_MAX.ginza}）`, type: 'number', min: 0, max: EDITORIAL_SCORE_MAX.ginza },
        { name: 'ginzaReason', label: 'GINZA 判定理由', type: 'text' },
        { name: 'ux', label: `UX / 体験価値（0〜${EDITORIAL_SCORE_MAX.ux}）`, type: 'number', min: 0, max: EDITORIAL_SCORE_MAX.ux },
        { name: 'uxReason', label: 'UX 判定理由', type: 'text' },
        { name: 'story', label: `STORY / 文化・物語性（0〜${EDITORIAL_SCORE_MAX.story}）`, type: 'number', min: 0, max: EDITORIAL_SCORE_MAX.story },
        { name: 'storyReason', label: 'STORY 判定理由', type: 'text' },
        { name: 'discovery', label: `DISCOVERY / 発見性（0〜${EDITORIAL_SCORE_MAX.discovery}）`, type: 'number', min: 0, max: EDITORIAL_SCORE_MAX.discovery },
        { name: 'discoveryReason', label: 'DISCOVERY 判定理由', type: 'text' },
        {
          name: 'rawTotal',
          label: '本文情報量ペナルティ適用前の合計（0〜100）',
          type: 'number',
          min: 0,
          max: 100,
          admin: {
            readOnly: true,
            description:
              '5項目の合計そのもの（本文情報量ペナルティ適用前）。ランキングが実際に使うのは' +
              '下記totalの方——差があれば本文情報量ペナルティが働いたことを意味する（2026-08-18）',
          },
        },
        {
          name: 'total',
          label: '合計（自動計算・本文情報量ペナルティ適用後、0〜100）',
          type: 'number',
          min: 0,
          max: 100,
          admin: {
            readOnly: true,
            description: '5項目の合計にcontentRichnessPenaltyFactorを乗算した値。サーバー側で再計算する（自己申告値は信用しない）',
          },
        },
        {
          name: 'contentRichnessTier',
          label: '本文情報量の判定',
          type: 'select',
          options: toOptions(CONTENT_RICHNESS_TIERS, CONTENT_RICHNESS_TIER_LABELS),
          admin: {
            readOnly: true,
            description:
              'title+excerptの文末句点数・文字数から決定的に判定（AI呼び出しなし）。' +
              'ロジック：cms/src/lib/curation/contentRichness.ts（2026-08-18）',
          },
        },
        {
          name: 'contentRichnessPenaltyFactor',
          label: '本文情報量ペナルティ係数',
          type: 'number',
          admin: { readOnly: true, description: 'rawTotalに乗算した係数（rich:1.0/thin:0.85/boilerplate:0.65）' },
        },
        {
          name: 'scoringMethod',
          label: '採点方式',
          type: 'select',
          options: toOptions(SCORING_METHODS, SCORING_METHOD_LABELS),
          admin: { readOnly: true },
        },
        { name: 'scoredAt', label: '採点日時', type: 'date', admin: { readOnly: true } },
      ],
    },
    {
      name: 'audienceTags',
      label: 'Audience Tags（誰に響くか）',
      type: 'group',
      admin: {
        description: 'Sources.audienceTagsと同一構成。情報を除外するfilterではなく付加情報として付与する',
      },
      fields: [
        { name: 'genderAffinity', label: 'Gender Affinity', type: 'select', hasMany: true, options: toOptions(GENDER_AFFINITY_VALUES, GENDER_AFFINITY_LABELS) },
        { name: 'generation', label: 'Generation', type: 'select', hasMany: true, options: toOptions(GENERATION_VALUES, GENERATION_LABELS) },
        { name: 'visitStyle', label: 'Visit Style', type: 'select', hasMany: true, options: toOptions(VISIT_STYLE_VALUES, VISIT_STYLE_LABELS) },
      ],
    },
    {
      name: 'curationStatus',
      label: 'Maron Editor\'s Choice ステータス',
      type: 'select',
      required: true,
      defaultValue: 'inbox',
      options: toOptions(CURATION_STATUSES, CURATION_STATUS_LABELS),
      admin: {
        description: '「承認済み」「却下」への移行はログイン済みの人間のみ実行可（AI・自動化は採点・順位付けまで）',
      },
    },
    {
      name: 'decisionBy',
      label: '最終承認/却下者',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true, description: '承認済み・却下への変更時に操作者を自動記録（手動入力不可）' },
    },
    { name: 'decisionAt', label: '最終承認/却下日時', type: 'date', admin: { readOnly: true } },
  ],
  hooks: {
    // Sources.tsのeditorialグループと同じ人間ゲートパターン。人間ゲート判定に
    // 使うのはcurationStatusのみのため、editorial（Sources.ts）ほど複雑な
    // マージ処理は不要——beforeChangeで直接curationStatusの遷移だけをチェックする。
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        const prevStatus: CurationState | undefined = originalDoc?.curationStatus
        const nextStatus: CurationState | undefined = data.curationStatus ?? prevStatus

        // createでも直接approved/rejectedを指定させない——Sources.tsのeditorial
        // ゲートと同じく、prevStatusがundefined（=create）でも判定する。
        const isEnteringHumanGate =
          !!nextStatus && nextStatus !== prevStatus && HUMAN_GATED_STATES.includes(nextStatus)

        if (isEnteringHumanGate) {
          if (!req.user) {
            throw new Error(
              `curationStatusを「${nextStatus}」に変更するには、ログイン済みの人間による操作が必要です（AI・自動化スクリプトからの直接遷移は不可）`,
            )
          }
          data.decisionBy = req.user.id
          data.decisionAt = new Date().toISOString()
        }

        return data
      },
    ],
  },
  timestamps: true,
}
