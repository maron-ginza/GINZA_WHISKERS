import type { GlobalConfig } from 'payload'

import { DEFAULT_WEEKDAY_CODE_MAPPING, TNS_EDITORIAL_CODES, WEEKDAYS } from '../lib/tns/types'

// TNS_SPEC.md §6.1「TNSSettings（Payload Global、シングルトン設定）」。
// 週次editionごとではなく1箇所に設定を持つことで、将来マッピングや基準比率を
// 変更する場合も全edition共通で一度に切り替えられる（既存SourceLedgerが
// サイト単位の設定を1箇所で管理するのと同じ考え方）。
//
// 【表記に関する注記】マロンの指示文中の「GINZA CODE」は、TNS_SPEC.md §4が
// 定める既存の「TNS Editorial Code」（Code1〜7）を指すものとして扱う——
// 仕様書が明示的に定めた表記統一ルール（「GINZA CODE」という名称は使わない）
// に従い、本ファイルでも新しい名称・定義は作らずTNS Editorial Codeを再利用する。
export const TNSSettings: GlobalConfig = {
  slug: 'tns-settings',
  admin: {
    description:
      'Tokyo Nostalgic Soundtrack（TNS）週次生成の設定値（TNS_SPEC.md §6.1）。' +
      '曜日↔TNS Editorial Codeの対応、Code別fixedMoodLabel、邦楽/洋楽の参考比率等。',
  },
  fields: [
    {
      name: 'weekdayCodeMapping',
      label: '曜日 → TNS Editorial Code 対応表',
      type: 'array',
      admin: {
        description:
          '初期値：Monday=Code1〜Sunday=Code7。管理画面から変更可能（TNS_SPEC.md §6.1）。',
      },
      defaultValue: WEEKDAYS.map((weekday) => ({
        weekday,
        code: DEFAULT_WEEKDAY_CODE_MAPPING[weekday],
      })),
      fields: [
        { name: 'weekday', type: 'select', required: true, options: WEEKDAYS.map((w) => ({ label: w, value: w })) },
        {
          name: 'code',
          type: 'select',
          required: true,
          options: TNS_EDITORIAL_CODES.map((c) => ({ label: c, value: c })),
        },
      ],
    },
    {
      name: 'codeFixedMoodLabels',
      label: 'Code別 fixedMoodLabel',
      type: 'array',
      admin: {
        description:
          'Code1〜7それぞれの週をまたいで概ね固定される気分ラベル（TNS_SPEC.md §4）。' +
          '公開済み#32・#33の実績から確認できたCode1・Code5・Code7のみ初期値を設定し、' +
          '残り（Code2・3・4・6）は未確認のため空欄のまま——推測で埋めない。',
      },
      defaultValue: [
        { code: 'code1', fixedMoodLabel: 'リスタート／静かな決意' },
        { code: 'code2', fixedMoodLabel: '' },
        { code: 'code3', fixedMoodLabel: '' },
        { code: 'code4', fixedMoodLabel: '' },
        { code: 'code5', fixedMoodLabel: '夜が始まる' },
        { code: 'code6', fixedMoodLabel: '' },
        { code: 'code7', fixedMoodLabel: 'Soft-Cloud Ginza' },
      ],
      fields: [
        {
          name: 'code',
          type: 'select',
          required: true,
          options: TNS_EDITORIAL_CODES.map((c) => ({ label: c, value: c })),
        },
        { name: 'fixedMoodLabel', type: 'text' },
      ],
    },
    {
      name: 'musicBalancePolicy',
      label: '邦楽/洋楽バランス方針',
      type: 'select',
      defaultValue: 'adaptive',
      options: [{ label: 'Adaptive（参考値、hard constraintにしない）', value: 'adaptive' }],
      admin: {
        description: 'TNS_SPEC.md §3.2 Adaptive Music Balance。固定比率をhard constraintにはしない。',
      },
    },
    {
      name: 'historicalReferenceJapaneseRatio',
      label: '邦楽 参考比率',
      type: 'number',
      min: 0,
      max: 1,
      // 2026-08-27、マロン指示「邦楽/洋楽の基本比率は60/40を目安」を受けての
      // 初期シード値更新。TNS_SPEC.md §3.2が定めた「#32〜#34実績の0.43」は
      // 参考値・非hard-constraintという位置づけ自体は維持しつつ、その
      // シード値のみ今回のマロン指示に合わせて0.6へ更新した（管理画面から
      // 随時上書き可能、TNS_SPEC.md §3.2の設計どおり）。
      defaultValue: 0.6,
      admin: {
        description:
          '選曲を制約するhard targetではなく参考値。2026-08-27時点はマロン指示により0.6に設定' +
          '（TNS_SPEC.md §3.2記載の#32〜#34実績値0.43から更新、管理画面で随時変更可）。',
      },
    },
    {
      name: 'historicalReferenceInternationalRatio',
      label: '洋楽 参考比率',
      type: 'number',
      min: 0,
      max: 1,
      defaultValue: 0.4,
      admin: {
        description: '邦楽参考比率と同様、2026-08-27のマロン指示により0.4に設定。',
      },
    },
    {
      name: 'rollingWindowWeeks',
      label: 'Rolling Historical Ratio 参照週数',
      type: 'number',
      defaultValue: 6,
      admin: {
        description:
          'TNS_SPEC.md §3.2 Rolling Historical Ratio（将来拡張）。今回のセッションでは実装せず、' +
          '設定項目のみ用意する（§8の次工程）。',
      },
    },
    {
      name: 'minSampleSizeForRolling',
      label: 'Rolling算出に必要な最小公開週数',
      type: 'number',
      defaultValue: 4,
    },
    {
      name: 'nextEditionNumber',
      label: '次回エディション番号（初回起動時のみ使用）',
      type: 'number',
      // 2026-08-27、マロン指摘を受け役割を変更：号数の実運用カウンタとしては
      // 使わない（createWeeklySoundtrackEdition.tsは既存SoundtrackEditions
      // の最新editionNumber+1を常に正とする「前回レコードからの連番取得」
      // 方式に変更した）。本フィールドは、SoundtrackEditionsが1件も存在
      // しない初回起動時のみのフォールバック初期値として残す。
      // 初期値35はTNS_SPEC.md §8「次にDry Runすべき週：#35以降の最新公開週」
      // という仕様書自身の記載に基づく（AIによる推測ではない）。
      defaultValue: 35,
      admin: {
        description:
          'SoundtrackEditionsが1件も存在しない初回起動時のみ使われるフォールバック初期値。' +
          '2件目以降は既存レコードのeditionNumber+1が自動的に使われるため、本フィールドを' +
          '手動更新する必要は通常ない。号数を修正したい場合は、直近のSoundtrackEditions' +
          'レコード自体のeditionNumberフィールドを編集すること。',
      },
    },
  ],
}
