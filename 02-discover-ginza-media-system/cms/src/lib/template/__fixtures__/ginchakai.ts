import type { TemplateArticleInput } from '../renderArticleFromTemplate'

// Article #54「銀茶会」相当の固定 fixture（2026-09-02、第2段階A 検証用）。
//
// 出典事実は GINZA OFFICIAL（https://www.ginza.jp/event/35565）掲載内容と
// Article #54 の editorialProvenance に基づく。数値・日付・URL は入力どおり
// 保持されることを検証するため、テンプレート側では一切再整形しない。
//
// `unconfirmedNotes` はテンプレートが読まないフィールド。「未確認項目は本文へ
// 出さない」ことを check スクリプトで検証するために置いている。
export const ginchakaiFixture: TemplateArticleInput & { unconfirmedNotes: string[] } = {
  discoveredContentId: 386,

  fields: {
    season: '秋',
    eventName: '銀茶会',
    editionLabel: '第24回',
    theme: '和（わ）',
    whatHappens: 'オリジナルのお菓子と一服のお茶を楽しむ催しです。',
    eventDate: '2026年10月25日（日）',
    eventTime: '13時から16時まで',
    venues: [
      { name: '濃茶体験会', place: '植松ビル地下1階の茶室「銀座慶庵」' },
      { name: '聞香体験会', place: '日本香堂ビル3階の香間「暁」' },
      { name: '銀座の金沢茶会', place: '銀座МＳビル1階の「KOGEI Art Gallery 銀座の金沢」' },
    ],
    areaLead: '全銀座エリアに対応した3つの企画',
    audienceNote:
      '銀座で茶の湯や香に触れる時間を探している方、この恒例行事に関心のある方に向いています。',
    paid: true,
    applyDeadline: '2026年10月7日（水）',
    resultDate: '2026年10月15日（木）',
    resultRule: '当選された方へのご連絡をもって発表に代えられます',
    applyRule:
      'お申し込みは2名様分まで、お一人様1回限り。同じ方から複数のお申し込みがあった場合は、いちばん最後のお申し込みを正として抽選されます',
    officialInfoNote:
      '当日のより詳しい内容は、2026年10月1日に公開が予定されている公式ウェブサイトで案内されます。全体の概要はPDFでも確認できます。',
    editorsNoteSeed:
      '銀座の秋は、街を歩くだけでなく、受け継がれてきた文化に触れることで、少し違って見えてきます。お茶を入口に、いつもよりゆっくり銀座と向き合う一日になりそうです。',
    closing:
      '抽選という一手間はありますが、当選のお知らせが届いたら、どうぞゆっくりと銀座へお出かけください。',
    callToAction:
      'お茶席体験を希望される場合は、期限までに公式の抽選申し込みページからご登録ください。',
  },

  sourceName: 'GINZA OFFICIAL',
  sourceUrl: 'https://www.ginza.jp/event/35565',
  verifiedAt: '2026-09-01T00:00:00.000Z',

  sourceProvenance: [
    {
      fact: '銀茶会は第24回、本年のテーマは「和（わ）」',
      sourceType: 'official',
      factType: 'other',
      verificationStatus: 'confirmed',
    },
    {
      fact: '開催日は2026年10月25日（日）13時から16時まで',
      sourceType: 'official',
      factType: 'date',
      verificationStatus: 'confirmed',
    },
    {
      fact: 'お茶席体験の抽選申し込み期限は2026年10月7日（水）、当選発表は2026年10月15日（木）',
      sourceType: 'official',
      factType: 'date',
      verificationStatus: 'confirmed',
    },
    {
      fact: '会場は植松ビル地下1階 茶室「銀座慶庵」／日本香堂ビル3階 香間「暁」／銀座МＳビル1階「KOGEI Art Gallery 銀座の金沢」',
      sourceType: 'official',
      factType: 'venue',
      verificationStatus: 'confirmed',
    },
    {
      fact: '3企画はいずれも有料。申し込みは2名様分まで、お一人様1回限り',
      sourceType: 'official',
      factType: 'price',
      verificationStatus: 'confirmed',
    },
    // 未確認事実（本文に出してはいけない）
    {
      fact: '当日券の配布があるかどうか',
      sourceType: 'secondary',
      factType: 'reservation',
      verificationStatus: 'unconfirmed',
    },
  ],

  hashtags: ['#銀茶会', '#銀座', '#お茶会'],
  relatedArticleTitles: [],

  // テンプレートが読まないフィールド（未確認情報が本文に出ないことの検証用）
  unconfirmedNotes: ['当日券の配布', '会場内の撮影可否', '駐車場の有無'],
}
