// GINZA WHISKERS / Project 02（2026-09-16続き8、マロン指示：SWEETS 0件の上流原因修正）
//
// 松屋銀座 sitemap.xml から「今週のGINZAスイート」週替わりページのURLを列挙する
// 純粋関数（ネットワークなし・XML文字列を受け取るだけ）。
//
// 【発見した不具合】旧実装は `sweets/(\d{8})`（8桁の日付のみ）にしか一致せず、
// 2026-09-16時点の実際のスラッグ `sweets/ginza20260916`（"ginza"接頭辞つき）を
// 取りこぼしていた（2026-05-27〜07-08の期間も `sweets/sweet20260527` 等の
// "sweet"接頭辞つきスラッグが使われており、同様に取りこぼしていたことをsitemap.xml
// の実データで確認）。サイト側のスラッグ命名規則が時期によって変わる
// （無接頭辞／"sweet"接頭辞／"ginza"接頭辞）ため、接頭辞の有無・種類を問わず
// 「sweets/の直後にある8桁の日付」を抽出するよう正規表現を広げた。
// 日付以外の判定（現在の週を選ぶロジック）は date（8桁）だけを見るため無変更。

export interface MatsuyaWeeklySweetsUrl {
  url: string
  slug: string
  date: string
}

export function parseMatsuyaSweetsWeeklyUrlsFromSitemap(xml: string): MatsuyaWeeklySweetsUrl[] {
  const matches = [
    ...xml.matchAll(/https:\/\/www\.matsuyaginza\.com\/(jp\/ginza\/events\/food\/sweets\/[a-z]*(\d{8}))/gi),
  ]
  // Storyblok Content Delivery APIは`language=jp`パラメータでロケールを指定する方式のため、
  // フルスラッグ先頭の`jp/`（ロケールフォルダ）は取り除いたものをAPI呼び出しに使う
  // （2026-09-14実データ確認：`jp/`を含めると404、除いた`ginza/events/...`で200）。
  return matches
    .map((m) => ({ url: `https://www.matsuyaginza.com/${m[1]}`, slug: m[1].replace(/^jp\//, ''), date: m[2] }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
