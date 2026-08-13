import type { CollectionConfig } from 'payload'

// Phase 15（2026-08-10）：ARCHITECTURE_DRAFT.md 2.5節「共通承認キュー」と
// CONTENT_MODEL.md 2.6節 PublishRecordの二重配信防止思想を、SNS配信の
// 媒体別キューとして具体化したもの。本文コピー自体はArticle.socialCopy
// （AIが本文と同時に生成し、記事の承認時に編集長がレビュー済み）を正本とし、
// ここでは「その素材をどのチャネルへ・どの状態で配信するか」のみを管理する
// （Create Once, Publish Everywhereの原則。コピーの再生成・上書きはしない）。
//
// 実配信（X/Instagram Graph APIへの実際の呼び出し）はsrc/workers/の
// postToX・postToInstagramに委譲するが、いずれも認証情報未設定のため
// 実際には送信できない（Phase 15の本セッション範囲：外部認証・実投稿は
// 対象外、CLAUDE.md第9章）。noteはそもそも公式投稿APIが存在しないため、
// 人間が手動投稿した事実を確認するのみ。

const CHANNELS = ['note', 'x', 'instagram'] as const
export type SocialChannel = (typeof CHANNELS)[number]

const STATUSES = ['pending', 'ready', 'sent', 'failed'] as const
export type SocialPostStatus = (typeof STATUSES)[number]

// Sources.ts/Articles.tsと同じ人間ゲートの考え方：AI・自動化スクリプトは
// pending状態の候補を作成できるが、「配信準備完了(ready)」「配信済み(sent)」
// への遷移はログイン済みの人間のみが行える。failedは配信試行の技術的結果
// （＝人間が起点となった配信操作の結果）であり、人間ゲートの対象にしない。
const HUMAN_GATED_STATES: SocialPostStatus[] = ['ready', 'sent']

export const SocialPosts: CollectionConfig = {
  slug: 'social-posts',
  admin: {
    useAsTitle: 'dedupeKey',
    defaultColumns: ['channel', 'status', 'article', 'updatedAt'],
    description:
      'Phase 15：公開承認済み記事のSNS配信候補キュー。実投稿（X/Instagram API送信・note手動投稿の確定）は人間の最終承認後のみ行う',
  },
  fields: [
    {
      name: 'article',
      type: 'relationship',
      relationTo: 'articles',
      required: true,
      admin: { description: 'この配信候補の元になった記事（approved/publishedのみ対象）' },
    },
    {
      name: 'channel',
      type: 'select',
      required: true,
      options: CHANNELS.map((c) => ({ label: c, value: c })),
    },
    {
      name: 'dedupeKey',
      type: 'text',
      unique: true,
      admin: {
        readOnly: true,
        description:
          '二重配信防止キー：`{articleId}:{channel}`から作成時に自動計算（手動編集不可、同一組み合わせは1件のみ存在できる）',
      },
    },
    {
      name: 'copy',
      type: 'group',
      admin: {
        description:
          'Article.socialCopyから生成時点でスナップショットした投稿素材（日本語・英語）。以後Article側を編集してもここには反映されない',
      },
      fields: [
        { name: 'ja', type: 'textarea' },
        { name: 'en', type: 'textarea' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: '候補 (Pending)', value: 'pending' },
        { label: '配信準備完了 (Ready)', value: 'ready' },
        { label: '配信済み (Sent)', value: 'sent' },
        { label: '失敗 (Failed)', value: 'failed' },
      ],
    },
    {
      name: 'readyBy',
      label: '配信準備完了・承認者',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true, description: 'pending→readyへの変更時に操作者を自動記録（手動入力不可）' },
    },
    { name: 'readyAt', label: '配信準備完了日時', type: 'date', admin: { readOnly: true } },
    {
      name: 'sentBy',
      label: '配信確定者',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true, description: 'ready→sentへの変更時に操作者を自動記録（手動入力不可）' },
    },
    { name: 'sentAt', label: '配信日時', type: 'date', admin: { readOnly: true } },
    {
      name: 'reference',
      type: 'text',
      admin: {
        description: '配信先URL・投稿ID（CONTENT_MODEL.md 2.6節と同じ扱い。note手動投稿は空欄許容）',
      },
    },
    {
      name: 'failureReason',
      type: 'textarea',
      admin: { readOnly: true, description: '配信試行が失敗した場合の理由（未設定の認証情報等）' },
    },
    { name: 'generatedAt', label: '候補生成日時', type: 'date', admin: { readOnly: true } },
    {
      name: 'lastDryRunAt',
      label: '最終Dry Run日時',
      type: 'date',
      admin: {
        readOnly: true,
        description: 'Dry Run（配信内容プレビュー、実配信は行わない）を最後に実行した日時',
      },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, operation, req }) => {
        // operation('create'|'update')で判定する。originalDocの真偽値では判定しない
        // （このPayloadバージョンではcreate時でもフィールドのデフォルト値展開により
        // originalDocが空オブジェクト相当の値になるケースがあり、!originalDocによる
        // create判定は信頼できないため）。
        const isCreate = operation === 'create'

        if (isCreate) {
          if (!data.article || !data.channel) {
            throw new Error('article/channelは必須です')
          }
          data.dedupeKey = `${data.article}:${data.channel}`
          data.generatedAt = data.generatedAt ?? new Date().toISOString()
          data.status = data.status ?? 'pending'
        }

        const prevStatus: SocialPostStatus | undefined = originalDoc?.status
        const nextStatus: SocialPostStatus | undefined = data.status ?? prevStatus

        // 配信済み(sent)は不変。二重配信防止の最終防衛ライン
        if (prevStatus === 'sent' && nextStatus !== 'sent') {
          throw new Error('配信済み(sent)の配信キュー項目は変更できません（二重配信防止）')
        }

        const isEnteringHumanGate =
          !!nextStatus && nextStatus !== prevStatus && HUMAN_GATED_STATES.includes(nextStatus)

        if (isEnteringHumanGate) {
          if (!req.user) {
            throw new Error(
              `statusを「${nextStatus}」に変更するには、ログイン済みの人間による操作が必要です（AI・自動化スクリプトからの直接遷移は不可）`,
            )
          }
          if (nextStatus === 'ready') {
            data.readyBy = req.user.id
            data.readyAt = new Date().toISOString()
          }
          if (nextStatus === 'sent') {
            data.sentBy = req.user.id
            data.sentAt = new Date().toISOString()
          }
        }

        return data
      },
    ],
  },
}
