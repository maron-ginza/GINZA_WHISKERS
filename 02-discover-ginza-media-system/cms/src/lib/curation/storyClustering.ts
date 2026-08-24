// Story Clustering（2026-08-17）。
//
// 同一イベント・同一企画の複数URL（展覧会開始ページ・関連トークイベント
// ページ・別URL等）がDaily Top10を占有しないよう、関連コンテンツを
// 「1つのStory」としてまとめる。フルNLP・外部ライブラリは使わず（v1の
// スコープ、既存のextractLinks.ts等と同じ「素朴だが説明可能な実装」方針）、
// 以下を安全に組み合わせて判定する：
//   - venue / organization：sourceSite（発信元サイト）が異なる候補は
//     絶対にクラスタリングしない（最も強い制約）
//   - normalized title：日付プレフィックス・サイト名サフィックス・
//     引用符等を除去した正規化タイトル
//   - 「」『』で囲まれた引用タイトル：展覧会名等の固有名詞が明示的に
//     引用符で囲まれているケースが多く観測されたため、これが一致すれば
//     最も強いクラスタリング根拠として扱う
//   - title similarity：文字bigramのJaccard類似度（形態素解析器を
//     使わないCJKテキストの類似度判定として一般的な手法）
//   - event date：両者に開催期間が判明している場合のみ、重なり・近接を
//     追加の判定材料にする（片方でも不明な場合は日付を理由に
//     クラスタリングを妨げない——「推測しない」原則の延長）
//
// 元のDiscoveredContentは削除・変更しない。本モジュールは純粋関数のみを
// 提供し、実際の永続化はpersistStoryClusters.tsが担当する。

export interface ClusterableItem {
  id: number
  sourceSiteId: number
  title: string
  /** 一覧/インデックスページ判定に使用（2026-08-17追加）。省略可（既存呼び出し元との互換のため） */
  articleUrl?: string
  editorialScoreTotal: number | null
  eventStartAt: string | null
  eventEndAt: string | null
}

export interface StoryClusterGroup {
  clusterKey: string
  sourceSiteId: number
  memberIds: number[]
  representativeId: number
  clusterTitle: string
  eventStartAt: string | null
  eventEndAt: string | null
}

const TITLE_SIMILARITY_THRESHOLD = 0.5
const DATE_OVERLAP_TOLERANCE_DAYS = 3
// 「News」「一覧を見る」等の汎用ボイラープレート的タイトルが偶然高い
// bigram類似度を示し誤クラスタリングされるのを防ぐための下限文字数
const MIN_TITLE_LENGTH_FOR_FUZZY_MATCH = 10

// 区切り文字：／/｜|に加え、EN DASH/EM DASH（"–"/"—"、およびHTML実体参照
// &#8211;/&#8212;）も対象とする（2026-08-17追加）。GINZA SIXの
// 「タイトル &#8211; GINZA SIX | GSIX | ...」規約で、サイト名接尾辞の直前が
// ｜ではなくEN DASHのため区切りセグメントとして単離されず、無関係な2商品の
// タイトルが共通の"&#8211; GINZA SIX"部分文字列だけでbigram類似度の閾値を
// 超えて誤結合する事象を実データで確認した。**意図的に含めていない**の
// はU+2015（HORIZONTAL BAR "―"）とU+FF0D（全角ハイフン"－"）——これらは
// 「うたう仲條 おどる仲條 ―文字と画と、資生堂と」のように、展覧会名の
// タイトル内部の装飾的な区切りとして使われる実例が確認されており、区切り
// 文字として分割すると正しいタイトルの一体性を壊すリスクがあるため。
const TITLE_DELIMITER_RE = /[／/｜|–—]|&#821[12];/

// 日付プレフィックス除去・サイト名区切りセグメントの除去・引用符の正規化。
//
// 【2026-08-17、誤判定修正（マロン指示）】サイト名区切り文字除去は、
// 当初「最初の区切り文字（／/｜|）以降を全て切り捨てる」実装だった
// （「タイトル／サイト名」という、サイト名が後置される規約を前提）。
// しかしPOLA MUSEUM ANNEXは逆に「サイト名｜タイトル」とサイト名が
// **前置**される規約のため、実タイトルの方が切り捨てられ、全ページが
// 同一の短い文字列（サイト名のみ）に正規化されてしまい、無関係な10件が
// 誤って1つのStoryへ統合される事故が実データで発覚した。
//
// 次に「区切り文字で2分割し短い方をボイラープレートとみなし長い方を残す」
// 長さヒューリスティックへ変更したが、これも別の実データ
// （SHISEIDO GALLERY："年間スケジュール | SHISEIDO GALLERY"のような、
// 英語のサイト名の方が日本語の実タイトルより文字数が多いケース）で
// 逆方向に誤判定することが判明した——CJK文字とASCII文字の「文字数」を
// 単純比較する長さヒューリスティックには構造的な限界がある。
//
// 最終的に「同一サイト内の複数ページにまたがって**同一文字列で繰り返し
// 出現する区切りセグメント**をサイト名ボイラープレートとみなし除去する」
// コーパスベースの判定に変更した（boilerplateSegments引数、
// computeBoilerplateSegmentsBySiteが事前に算出）——ページごとに変わる
// はずの実タイトルは通常サイト内で1回しか出現しないのに対し、サイト名は
// 必ず繰り返されるという構造的事実を利用しており、サイト名が前置・後置
// いずれの規約でも、また英語・日本語いずれの表記でも頑健に機能する。
// boilerplateSegments未提供時（後方互換）は長さヒューリスティックへ
// フォールバックする。
export function normalizeTitleForClustering(raw: string, boilerplateSegments?: ReadonlySet<string>): string {
  let t = raw
  t = t.replace(/^\d{4}[./]\d{1,2}[./]\d{1,2}\s*/, '')

  if (TITLE_DELIMITER_RE.test(t)) {
    if (boilerplateSegments && boilerplateSegments.size > 0) {
      const segments = t
        .split(TITLE_DELIMITER_RE)
        .map((s) => s.trim())
        .filter(Boolean)
      const kept = segments.filter((s) => !boilerplateSegments.has(s.toLowerCase()))
      t = kept.length > 0 ? kept.join(' ') : segments.reduce((longest, s) => (s.length > longest.length ? s : longest), '')
    } else {
      const delimiterMatch = TITLE_DELIMITER_RE.exec(t)!
      const before = t.slice(0, delimiterMatch.index).trim()
      const after = t.slice(delimiterMatch.index + 1).trim()
      t = after.length > before.length ? after : before
    }
  }

  t = t.replace(/[「」『』"'"''｢｣]/g, '')
  t = t.replace(/\s+/g, ' ').trim()
  return t.toLowerCase()
}

// サイトごとに、区切りセグメントが複数の異なるページ（DiscoveredContent行）
// にまたがって同一文字列で出現する回数を集計し、2件以上のページで
// 繰り返し出現するセグメントを「サイト名ボイラープレート」と判定する
// （2026-08-17追加）。同一アイテム内での重複出現は1回にまとめてから
// カウントする（1ページ内でたまたま同じ語句が2回出るケースが実データに
// 存在するため——例："次回の展覧会 | 次回の展覧会 | SHISEIDO GALLERY"）。
function computeBoilerplateSegmentsBySite(items: ClusterableItem[]): Map<number, Set<string>> {
  const itemSetsBySite = new Map<number, Map<string, Set<number>>>()

  for (const item of items) {
    if (!TITLE_DELIMITER_RE.test(item.title)) continue
    const segments = new Set(
      item.title
        .split(TITLE_DELIMITER_RE)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    )
    const bySegment = itemSetsBySite.get(item.sourceSiteId) ?? new Map<string, Set<number>>()
    for (const seg of segments) {
      const itemIds = bySegment.get(seg) ?? new Set<number>()
      itemIds.add(item.id)
      bySegment.set(seg, itemIds)
    }
    itemSetsBySite.set(item.sourceSiteId, bySegment)
  }

  const result = new Map<number, Set<string>>()
  for (const [siteId, bySegment] of itemSetsBySite) {
    const boilerplate = new Set<string>()
    for (const [seg, itemIds] of bySegment) {
      if (itemIds.size >= 2) boilerplate.add(seg)
    }
    result.set(siteId, boilerplate)
  }
  return result
}

// 一覧ページ・来館案内・寄付報告等、個別の展覧会・イベントではない
// 管理的/定型ページのタイトルパターン（2026-08-17追加、マロン指示：
// 「一覧ページ、来館案内、寄付報告、footer/calendar等を個別展覧会Story
// へ統合しない」）。該当する場合、tier 2・tier 3（類似度ベースの統合）を
// 一切適用せず常に単独クラスタとして扱う——実データ（POLA MUSEUM ANNEXの
// 「開催中の企画展」一覧・「ご来館のお客様へご協力のお願い」・
// 「日本赤十字社への寄付...ご報告」等）で、これらが無関係な展覧会Storyへ
// 誤統合される事故を確認したための対応。
const ADMINISTRATIVE_PAGE_TITLE_PATTERNS = [
  /ご協力のお願い/,
  /ご報告/,
  /寄付/,
  /感謝状/,
  /サイトマップ/,
  /プライバシーポリシー/,
  /アクセス(?:マップ)?$/,
  /営業時間/,
  /よくある質問/,
  /ご利用案内/,
]

function isAdministrativePageTitle(rawTitle: string): boolean {
  return ADMINISTRATIVE_PAGE_TITLE_PATTERNS.some((p) => p.test(rawTitle))
}

// URLパスが一覧/インデックスページ自体であることを示す強いシグナル
// （2026-08-17追加）。個別記事・イベントのURLではなく、一覧ページ自体が
// 誤って展覧会Storyへ統合される事故（POLA MUSEUM ANNEXの
// `/exhibition/index.html`等）への対応。
// 2026-08-17追加：カテゴリー/タグ別の一覧ページ（例：GINZA SIXの
// `/news_category/events`, `/news_category/beauty`等）も一覧ページと同様の
// 扱いとする。実データで、これらのカテゴリーページが「&#8211; GINZA SIX」
// という共通の接尾辞を区切り文字（｜等）の外側に持つため、
// computeBoilerplateSegmentsBySiteのセグメント単位除去では捕捉できず、
// カテゴリー名部分の短い違いにもかかわらずbigram類似度が閾値を超えて
// 誤結合する事象を確認したための対応。
function isIndexPageUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase()
    if (/\/(index)(\.html?)?\/?$/.test(pathname) || pathname === '/' || pathname.endsWith('/index')) return true
    return /\/(category|categories|tag|tags|news_category)\//.test(pathname)
  } catch {
    return false
  }
}

// 「」『』で囲まれた引用スパンを抽出する（展覧会名等の固有名詞の強いシグナル）
export function extractQuotedSpan(raw: string): string | null {
  const m = /[「『]([^」』]{4,})[」』]/.exec(raw)
  if (!m) return null
  return normalizeTitleForClustering(m[1])
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
  return set
}

export function titleSimilarity(a: string, b: string): number {
  const A = bigrams(a)
  const B = bigrams(b)
  if (A.size === 0 || B.size === 0) return a === b ? 1 : 0
  let intersection = 0
  for (const g of A) if (B.has(g)) intersection += 1
  return intersection / (A.size + B.size - intersection)
}

function datesCompatible(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null,
): boolean {
  const aHas = Boolean(aStart || aEnd)
  const bHas = Boolean(bStart || bEnd)
  if (!aHas || !bHas) return true // 片方でも不明なら日付を理由にブロックしない

  const aS = new Date(aStart ?? aEnd!).getTime()
  const aE = new Date(aEnd ?? aStart!).getTime()
  const bS = new Date(bStart ?? bEnd!).getTime()
  const bE = new Date(bEnd ?? bStart!).getTime()
  const tolMs = DATE_OVERLAP_TOLERANCE_DAYS * 24 * 60 * 60 * 1000
  return aS - tolMs <= bE && bS - tolMs <= aE
}

// 2026-08-17、実データで「イベント情報を更新いたしました。」という同一の
// 定型（ボイラープレート）タイトルが、明らかに別の年・別のURL
// （202110.html／20230629.html／20231110.html）の3件のPOLA MUSEUM ANNEX
// イベントページに使い回されており、tier 3（フルタイトル類似度）が
// これを1つのStoryに誤結合する事象が発覚。引用符もイベント日付も
// 一切ない場合、タイトルの文字列一致だけでは別々のイベントを区別できない
// ——「推測しない」原則に従い、tier 3では最低限どちらか一方に実際の
// 開催日情報がある場合のみ日付面での裏付けありとみなす（両者とも
// 日付不明のまま完全一致タイトルだけでクラスタリングすることはしない）。
function hasDateCorroboration(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null,
): boolean {
  return Boolean(aStart || aEnd || bStart || bEnd)
}

interface WorkingGroup {
  quotedKey: string | null
  normalizedTitles: string[]
  memberIds: number[]
  sourceSiteId: number
  eventStartAt: string | null
  eventEndAt: string | null
  /**
   * 一覧ページ・来館案内・寄付報告等、管理的/定型ページから作られた
   * グループであることを示す（2026-08-17追加）。このグループへは他の
   * どのアイテムも（quoted完全一致を除き）統合できない——「一覧ページ、
   * 来館案内、寄付報告...を個別展覧会Storyへ統合しない」というマロン指示を
   * 双方向で満たすため（forced item自身が他へ統合されないだけでなく、
   * 他のitemがforced itemのグループへ統合されることも防ぐ）。
   */
  isForcedSingleton: boolean
}

function mergeDateRange(
  a: string | null,
  b: string | null,
  pick: (x: number, y: number) => number,
): string | null {
  if (!a) return b
  if (!b) return a
  const t = pick(new Date(a).getTime(), new Date(b).getTime())
  return new Date(t).toISOString()
}

export function computeStoryClusters(items: ClusterableItem[]): StoryClusterGroup[] {
  const groups: WorkingGroup[] = []

  const boilerplateBySite = computeBoilerplateSegmentsBySite(items)
  const sorted = [...items].sort((a, b) => a.id - b.id)

  for (const item of sorted) {
    const siteBoilerplate = boilerplateBySite.get(item.sourceSiteId)
    const normalized = normalizeTitleForClustering(item.title, siteBoilerplate)
    const quoted = extractQuotedSpan(item.title)

    // 2026-08-17追加：区切り文字を含まないタイトル（例："SHISEIDO GALLERY"
    // 単体、サイトのトップページ等）は正規化の区切りセグメント処理自体を
    // 経由しないため、そのタイトル全体がたまたま他ページで判明済みの
    // サイト名ボイラープレートと完全一致していても除去されない
    // ——実データでid=61「SHISEIDO GALLERY」がid=64「年間スケジュール」等の
    // 実際に異なるページと誤って同一クラスタに扱われかける事象を発見した
    // （直接similarity一致するわけではないが、正規化後の値がボイラー
    // プレートそのものであるため区別する情報を持たない）。正規化後の値が
    // そのサイトの既知ボイラープレートと完全一致する場合も
    // forced singleton扱いとする。
    const normalizedIsPureBoilerplate = Boolean(siteBoilerplate?.has(normalized))

    // 2026-08-17追加（マロン指示）：一覧ページ・来館案内・寄付報告等の
    // 管理的/定型ページ、およびURLが一覧/インデックスページ自体を指す
    // ものは、類似度ベースの統合（tier 2・tier 3）を一切適用せず常に
    // 単独クラスタとして扱う。
    const isForcedSingleton =
      isAdministrativePageTitle(item.title) ||
      (item.articleUrl ? isIndexPageUrl(item.articleUrl) : false) ||
      normalizedIsPureBoilerplate

    let target: WorkingGroup | undefined

    // 同一サイト内でのみ探索（venueが異なれば絶対にクラスタリングしない）
    const candidates = groups.filter((g) => g.sourceSiteId === item.sourceSiteId)

    // 1. 引用スパンの完全一致（最も強い根拠）——forced singletonグループへは
    // 他のアイテムから統合させない（双方向の隔離、2026-08-17）
    if (quoted) {
      target = candidates.find((g) => !g.isForcedSingleton && g.quotedKey === quoted)
    }
    // 2. 引用スパン同士の類似度（表記揺れ吸収）——2026-08-17、実データで
    // 「うたう仲條 おどる仲條 －文字と画と、資生堂と」の3URLが、引用符内の
    // ダッシュ文字違い（全角ハイフン"－" vs 水平線"―"）だけで完全一致に
    // 失敗しクラスタリングされない事象が発覚。フルタイトル同士の類似度
    // フォールバック（下記3）は周辺テキスト（"がスタートしました"等）の
    // ノイズで閾値を下回っていた。引用スパンが両者にある場合は、周辺
    // テキストを含まない引用スパン同士を直接比較する方が信頼できる。
    if (!target && quoted && !isForcedSingleton) {
      target = candidates.find((g) => {
        if (g.isForcedSingleton) return false
        if (!g.quotedKey) return false
        if (!datesCompatible(g.eventStartAt, g.eventEndAt, item.eventStartAt, item.eventEndAt)) return false
        return titleSimilarity(g.quotedKey, quoted) >= TITLE_SIMILARITY_THRESHOLD
      })
    }
    // 3. フルタイトル類似度（引用スパンがない場合のフォールバック）。
    // 短すぎる正規化タイトル（「News」「一覧を見る」等の汎用ボイラー
    // プレート）はbigram類似度が偶然高くなりやすく誤クラスタリングの
    // リスクが高いため、一定の長さ以上のタイトルのみを対象にする
    // （2026-08-17、実データで汎用タイトルの誤結合を確認し追加した防御）。
    // 2026-08-17追加：normalizedが空文字の場合もtier 3を適用しない
    // （マロン指示）——サイト名区切り文字の位置次第では正規化後に空文字に
    // なりうるため、念のための防御（現行のnormalizeTitleForClustering
    // 修正後は通常発生しないはずだが、空文字同士の意図しない一致を
    // 構造的に防ぐ）。isForcedSingletonの場合もtier 3を適用しない。
    if (!target && !isForcedSingleton && normalized.length >= MIN_TITLE_LENGTH_FOR_FUZZY_MATCH) {
      target = candidates.find((g) => {
        if (g.isForcedSingleton) return false
        if (!datesCompatible(g.eventStartAt, g.eventEndAt, item.eventStartAt, item.eventEndAt)) {
          return false
        }
        if (!hasDateCorroboration(g.eventStartAt, g.eventEndAt, item.eventStartAt, item.eventEndAt)) {
          return false
        }
        return g.normalizedTitles.some(
          (t) =>
            t.length >= MIN_TITLE_LENGTH_FOR_FUZZY_MATCH && titleSimilarity(t, normalized) >= TITLE_SIMILARITY_THRESHOLD,
        )
      })
    }

    if (target) {
      target.memberIds.push(item.id)
      target.normalizedTitles.push(normalized)
      if (quoted && !target.quotedKey) target.quotedKey = quoted
      target.eventStartAt = mergeDateRange(target.eventStartAt, item.eventStartAt, Math.min)
      target.eventEndAt = mergeDateRange(target.eventEndAt, item.eventEndAt, Math.max)
    } else {
      groups.push({
        quotedKey: quoted,
        normalizedTitles: [normalized],
        memberIds: [item.id],
        sourceSiteId: item.sourceSiteId,
        eventStartAt: item.eventStartAt,
        eventEndAt: item.eventEndAt,
        isForcedSingleton,
      })
    }
  }

  const itemById = new Map(items.map((i) => [i.id, i]))

  const withBaseKey = groups.map((g) => ({
    group: g,
    baseKey: `${g.sourceSiteId}::${g.quotedKey ?? g.normalizedTitles[0]}`,
  }))

  // clusterKeyの衝突検知（2026-08-17、実データで発覚）：異なるグループが
  // 「同一サイト×同一タイトル文字列」を持つのに、日付・引用符いずれの
  // 裏付けもないため意図的にクラスタリングを見送った（＝別グループのまま
  // 残した）ケースで、素朴なbaseKeyだけだと2つの異なるグループが同じ
  // clusterKeyになってしまう（例：POLA MUSEUM ANNEXの同一ボイラープレート
  // タイトル「イベント情報を更新いたしました。」を持つ別々の3イベント）。
  // これをそのままpersistStoryClusters.tsのfindOrCreateに渡すと、後続の
  // グループが先行グループのDBレコードを無言で上書きしてしまう
  // （Daily Ranking側はgroups配列を直接使うため影響を受けないが、
  // 永続化ビューが壊れる）。同一baseKeyが複数グループに現れた場合のみ、
  // 各グループの最小memberId（idソート済みのため決定的・再計算しても
  // 安定）をsuffixとして付与し一意性を確保する。単独のbaseKeyはsuffixなし
  // のまま維持し、既存の永続化データとの後方互換を保つ。
  const baseKeyCounts = new Map<string, number>()
  for (const { baseKey } of withBaseKey) {
    baseKeyCounts.set(baseKey, (baseKeyCounts.get(baseKey) ?? 0) + 1)
  }

  return withBaseKey.map(({ group: g, baseKey }) => {
    // 代表コンテンツ：Editorial Score最高点を優先、同点ならid最小
    const members = g.memberIds.map((id) => itemById.get(id)!).filter(Boolean)
    const representative = members.reduce((best, cur) => {
      const bestScore = best.editorialScoreTotal ?? -1
      const curScore = cur.editorialScoreTotal ?? -1
      if (curScore > bestScore) return cur
      if (curScore === bestScore && cur.id < best.id) return cur
      return best
    }, members[0])

    const isColliding = (baseKeyCounts.get(baseKey) ?? 0) > 1
    const clusterKey = isColliding ? `${baseKey}::${Math.min(...g.memberIds)}` : baseKey

    return {
      clusterKey,
      sourceSiteId: g.sourceSiteId,
      memberIds: g.memberIds,
      representativeId: representative.id,
      clusterTitle: g.quotedKey ?? representative.title,
      eventStartAt: g.eventStartAt,
      eventEndAt: g.eventEndAt,
    }
  })
}
