// Payload CMS REST APIから公開済み記事を取得する薄いラッパー。
// 型はCONTENT_MODEL.md 2節に対応する最小限の形のみを定義する
// （cms側のpayload-types.tsとの共有は今後の課題。6節「未決事項」参照）。

const PAYLOAD_API_URL = import.meta.env.PAYLOAD_API_URL ?? 'http://localhost:3000'

export type Locale = 'ja' | 'en'

export interface ArticleSummary {
  id: string
  title: string
  slug: string
  accessionNumber: string | null
  representedYear: number | null
  historicalPeriod: string | null
  pillars: Array<{ id: string; name: string }>
}

interface PayloadListResponse<T> {
  docs: T[]
  totalDocs: number
}

export async function fetchPublishedArticles(locale: Locale): Promise<ArticleSummary[]> {
  const params = new URLSearchParams({
    locale,
    'where[reviewStatus][equals]': 'published',
    depth: '1',
    limit: '100',
  })

  const res = await fetch(`${PAYLOAD_API_URL}/api/articles?${params.toString()}`)

  if (!res.ok) {
    throw new Error(`Payload API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as PayloadListResponse<ArticleSummary>
  return data.docs
}
