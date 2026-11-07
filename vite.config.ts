import { existsSync, readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import config from './portfolio.config'

const BASE = process.env.BASE_PATH || '/'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Title, description and link-preview tags for the configured owner, baked into index.html.
 * Crawlers don't run JavaScript, so previews always describe this deployment's owner;
 * ?u= pages still get their own title in the browser tab.
 */
function portfolioMeta(): Plugin {
  return {
    name: 'portfolio-meta',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        let count: number | null = null
        try {
          const snap = JSON.parse(readFileSync('src/data/snapshot.json', 'utf8')) as { handle?: string; count?: number }
          if (snap.handle?.toLowerCase() === config.github.toLowerCase()) count = snap.count ?? null
        } catch {
          /* no snapshot yet */
        }
        const name = config.name || config.github
        const title = `${name} · open-source work`
        const description = `${count ? `${count} public pull requests` : 'Public pull requests'} by ${name}, merged into projects beyond their own. Live from GitHub.`

        // absolute URLs when the deploy knows its address (GitHub Actions sets SITE_URL)
        const site = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/?$/, '/') : null
        const card = `og-${config.github.toLowerCase()}.png`
        const hasCard = existsSync(`public/${card}`)
        const image = hasCard ? (site ? site + card : BASE + card) : null

        const tags = [
          `<meta property="og:type" content="website" />`,
          `<meta property="og:title" content="${esc(title)}" />`,
          `<meta property="og:description" content="${esc(description)}" />`,
          site && `<meta property="og:url" content="${esc(site)}" />`,
          image && `<meta property="og:image" content="${esc(image)}" />`,
          image && `<meta property="og:image:width" content="1200" />`,
          image && `<meta property="og:image:height" content="630" />`,
          image && `<meta property="og:image:alt" content="${esc(description)}" />`,
          `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
          `<meta name="twitter:title" content="${esc(title)}" />`,
          `<meta name="twitter:description" content="${esc(description)}" />`,
          image && `<meta name="twitter:image" content="${esc(image)}" />`,
        ].filter(Boolean)

        return html
          .replace('%PORTFOLIO_TITLE%', esc(title))
          .replace('%PORTFOLIO_DESCRIPTION%', esc(description))
          .replace('%PORTFOLIO_SHARE_TAGS%', tags.join('\n    '))
      },
    },
  }
}

// GitHub Pages project sites live under /<repo>/; the deploy workflow sets BASE_PATH.
// Locally, and for user sites or custom domains, it stays '/'.
export default defineConfig({
  base: BASE,
  plugins: [react(), portfolioMeta()],
  define: {
    // "Fork this site" link: config.sourceRepo, else the repo GitHub Actions is building
    __SOURCE_REPO__: JSON.stringify(config.sourceRepo || process.env.GITHUB_REPOSITORY || ''),
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 700 },
})
