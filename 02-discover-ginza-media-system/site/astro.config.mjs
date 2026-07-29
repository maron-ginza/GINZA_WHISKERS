import { defineConfig } from 'astro/config'

// TECH_SELECTION_DRAFT.md 2章：Astro採用理由（静的出力中心、多言語ルーティング標準対応）
export default defineConfig({
  output: 'static',
  // 2026-07-29 Phase 12でドメイン確定（CLAUDE.md第9章・付録F参照）。
  // canonical/hreflang/og:imageの絶対URL化（Phase 7の残課題）はこの設定を前提にする
  site: 'https://discover.ginzawhiskers.com',
  i18n: {
    locales: ['ja', 'en'],
    defaultLocale: 'ja',
    routing: {
      prefixDefaultLocale: true,
    },
  },
})
