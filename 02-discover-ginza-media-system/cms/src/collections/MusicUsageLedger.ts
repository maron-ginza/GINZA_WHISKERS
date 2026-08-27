import type { CollectionConfig } from 'payload'

import { TNS_EDITORIAL_CODES, WEEKDAYS } from '../lib/tns/types'

function toOptions<T extends string>(values: readonly T[]) {
  return values.map((value) => ({ label: value, value }))
}

// TNS_SPEC.md §6.4「MusicUsageLedger（重複管理台帳）」。既存SOURCE LEDGER
// の「台帳＋履歴＋重複防止」という設計パターン（SourceSnapshotsの追記専用
// ログと同型）を踏襲する——新規の設計思想を持ち込まない。
//
// 過去使用曲との重複防止（マロン指示4）に特化し、Adaptive Music Balance
// （TNS_SPEC.md §3.2）の比率集計には使わない——比率算出は
// SoundtrackEditionsを直接queryする設計とし、責務を分離する。
//
// 【2026-08-27、フィールド名変更】マロン指示のフィールド名
// （musicTrack／usedDate／soundtrackEdition）に合わせて、初回実装時の
// 名称（trackRef／usedAt／usedInEdition）からリネームした。本コレクションは
// これまで実際に使用曲が確定した週が一度もなかった（過去2回のE2Eテストは
// いずれもMusicTracksが空だったため0件のまま）ため、既存データへの影響は
// ない。
export const MusicUsageLedger: CollectionConfig = {
  slug: 'music-usage-ledger',
  admin: {
    useAsTitle: 'usedDate',
    defaultColumns: ['musicTrack', 'usedDate', 'dayOfWeek', 'ginzaCode', 'reuseAllowed'],
    description:
      '過去使用曲の重複防止台帳（TNS_SPEC.md §6.4）。1週で1曲確定するたびに1行追記される' +
      '（createWeeklySoundtrackEdition.tsが記事作成と同時に自動追記、AI呼び出しなしの決定的処理）。',
  },
  // 匿名読み取りは既存のSourceLedger/SourceSnapshots/DiscoveredContentと同じ方針
  // （機密性のないメタデータ）。書き込みは既定のPayload認証必須のまま変更しない。
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'musicTrack',
      label: '使用曲',
      type: 'relationship',
      relationTo: 'music-tracks',
      required: true,
      index: true,
    },
    {
      name: 'usedDate',
      label: '使用日',
      type: 'date',
      required: true,
      admin: { description: 'その曲が実際に割り当てられた日（SoundtrackEditions.dailyScenes[].date）' },
    },
    {
      name: 'soundtrackEdition',
      label: '使用エディション',
      type: 'relationship',
      relationTo: 'soundtrack-editions',
      required: true,
    },
    {
      name: 'dayOfWeek',
      label: '曜日',
      type: 'select',
      options: WEEKDAYS.map((w) => ({ label: w, value: w })),
    },
    {
      name: 'ginzaCode',
      label: 'GINZA CODE（TNS Editorial Code）',
      type: 'select',
      options: toOptions(TNS_EDITORIAL_CODES),
    },
    {
      name: 'reuseAllowed',
      label: '再使用を許可する',
      type: 'checkbox',
      required: true,
      defaultValue: false,
      admin: {
        description:
          '既定はfalse（この使用実績がある限り当該曲は今後の自動選曲から除外される）。' +
          '人間が明示的にtrueにした場合のみ、この使用実績は今後の重複除外判定から外れる' +
          '（マロン指示3「再使用を許可する場合だけreuseAllowed=true」）。',
      },
    },
    {
      name: 'notes',
      label: 'メモ',
      type: 'textarea',
    },
  ],
  timestamps: true,
}
