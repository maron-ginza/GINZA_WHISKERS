import { defineConfig } from 'astro/config'

// TECH_SELECTION_DRAFT.md 2章：Astro採用理由（静的出力中心、多言語ルーティング標準対応）
export default defineConfig({
  output: 'static',
  i18n: {
    locales: ['ja', 'en'],
    defaultLocale: 'ja',
    routing: {
      prefixDefaultLocale: true,
    },
  },
})
