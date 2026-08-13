import type { APIRoute } from 'astro'

import { isIndexable } from '../lib/seo'

// robots.txtを静的ファイル（public/）ではなくエンドポイントとして生成する理由：
// meta robotsと同じスイッチ（src/lib/seo.ts）から内容を導出し、ローンチ時に
// 2箇所を別々に直す必要をなくすため。output: 'static' のためビルド時に
// /robots.txt として書き出される。
const preLaunch = `# Discover GINZA — ローンチ前（記事の蓄積中）
# 検索エンジンへのインデックスは意図的に抑止している。
# 解除するには site/.env に SITE_INDEXABLE=true を設定して再ビルドする
# （CLAUDE.md第12章 2026-08-13の決定）。
User-agent: *
Disallow: /
`

const launched = `# Discover GINZA
User-agent: *
Allow: /
`

export const GET: APIRoute = () =>
  new Response(isIndexable() ? launched : preLaunch, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
