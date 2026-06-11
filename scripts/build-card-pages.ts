/**
 * Build script: generate per-card static pages, robots.txt and sitemap.xml.
 *
 * Reads public/cards.json and emits:
 *   - public/card/{id}/index.html  (OGP / Twitter Card / JSON-LD + redirect to /?id={id})
 *   - public/robots.txt
 *   - public/sitemap.xml
 *
 * Usage: npm run build:card-pages
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '../public')
const CARDS_FILE = join(PUBLIC_DIR, 'cards.json')

const SITE = 'https://t1k2a.github.io/duelmasters-classic08-database'
const IMG_BASE = 'https://dm.takaratomy.co.jp/wp-content/card/cardimage'

interface CardJson {
  id: string
  name: string
  cardType: string
  cost: number | null
  power: number | null
  civilizations: string[]
  races: string[]
  rarity: string | null
  text: string | null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function jsonLdEscape(s: string): string {
  // Escape for embedding inside a <script type="application/ld+json"> block.
  return s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
}

function cardPageHtml(card: CardJson): string {
  const url = `${SITE}/card/${card.id}/`
  const image = `${IMG_BASE}/${card.id}.jpg`
  const title = `${card.name} - デュエルマスターズ クラシック08`
  const desc = (card.text ?? card.name).replace(/\s+/g, ' ').trim()
  const redirect = `/?id=${encodeURIComponent(card.id)}`

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Thing',
    name: card.name,
    description: card.text ?? '',
    image,
    url,
  })

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(desc)}">
  <link rel="canonical" href="${escapeHtml(url)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(desc)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(desc)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <meta http-equiv="refresh" content="0;url=${escapeHtml(redirect)}">
  <script type="application/ld+json">
${jsonLdEscape(jsonLd)}
  </script>
  <script>window.location.replace(${JSON.stringify(redirect)});</script>
</head>
<body>
  <p><a href="${escapeHtml(redirect)}">${escapeHtml(card.name)} のページへ移動</a></p>
</body>
</html>
`
}

async function main() {
  const cards: CardJson[] = JSON.parse(await readFile(CARDS_FILE, 'utf-8'))

  let pages = 0
  for (const card of cards) {
    const dir = join(PUBLIC_DIR, 'card', card.id)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.html'), cardPageHtml(card))
    pages++
  }

  // robots.txt
  const robots = `User-agent: *
Allow: /
Sitemap: ${SITE}/sitemap.xml
`
  await writeFile(join(PUBLIC_DIR, 'robots.txt'), robots)

  // sitemap.xml
  const today = new Date().toISOString().slice(0, 10)
  const urls = [
    `  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod></url>`,
    ...cards.map(
      c => `  <url><loc>${escapeXml(`${SITE}/card/${c.id}/`)}</loc><lastmod>${today}</lastmod></url>`
    ),
  ]
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`
  await writeFile(join(PUBLIC_DIR, 'sitemap.xml'), sitemap)

  console.log(`Card pages  : ${pages}`)
  console.log(`robots.txt  : ${join(PUBLIC_DIR, 'robots.txt')}`)
  console.log(`sitemap.xml : ${join(PUBLIC_DIR, 'sitemap.xml')} (${urls.length} urls)`)
}

main().catch(e => { console.error(e); process.exit(1) })
