/**
 * Build script: generate per-card / per-recipe static pages, robots.txt and sitemap.xml.
 *
 * Reads public/cards.json, public/data/recipes.json, public/data/meta-decks.json and emits:
 *   - public/card/{id}/index.html        (OGP / Twitter Card / JSON-LD + redirect to /?id={id})
 *   - public/recipe/{rcp-id}/index.html  (deck OGP + redirect to /?recipe={rcp-id})
 *   - public/recipe/meta-{n}/index.html  (meta deck OGP + redirect to /?recipe={rcp-id of meta})
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
const RECIPES_FILE = join(PUBLIC_DIR, 'data/recipes.json')
const META_FILE = join(PUBLIC_DIR, 'data/meta-decks.json')

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

interface DeckCard {
  id: string
  name?: string
  count: number
}

interface RecipeJson {
  id: string
  name: string
  cards: DeckCard[]
  civilizations?: string[]
  archetype?: string
  author?: string
}

interface MetaDeckJson {
  name: string
  description?: string
  civilization?: string[]
  cards: DeckCard[]
}

const RARITY_ORDER: Record<string, number> = { SR: 0, VR: 1, R: 2, U: 3, C: 4 }

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
  // card/{id}/index.html から SPA トップ(public/index.html)へは2階層上。
  // GitHub Pages のサブパス配信でも壊れないよう相対パスにする。
  const redirect = `../../?id=${encodeURIComponent(card.id)}`

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

// デッキ内の最高レアカードを返す。同レアなら採用枚数が多い方、それも同率なら先頭。
function topRarityCard(deckCards: DeckCard[], byId: Map<string, CardJson>): CardJson | null {
  let best: CardJson | null = null
  let bestRank = 99
  let bestCount = -1
  for (const dc of deckCards) {
    const card = byId.get(dc.id)
    if (!card) continue
    const rank = RARITY_ORDER[card.rarity ?? ''] ?? 9
    const count = dc.count || 0
    if (rank < bestRank || (rank === bestRank && count > bestCount)) {
      best = card
      bestRank = rank
      bestCount = count
    }
  }
  return best
}

function deckTotal(deckCards: DeckCard[]): number {
  return deckCards.reduce((s, c) => s + (c.count || 0), 0)
}

/**
 * Generate a deck OGP page (used for both recipes and meta decks).
 * `pathSlug` is the path segment under /recipe/ ; `redirectId` is the rcp-id used in ?recipe=.
 */
function deckPageHtml(opts: {
  pathSlug: string
  redirectId: string
  deckName: string
  cards: DeckCard[]
  civilizations: string[]
  byId: Map<string, CardJson>
  extraDesc?: string
}): string {
  const { pathSlug, redirectId, deckName, cards, civilizations, byId, extraDesc } = opts
  const url = `${SITE}/recipe/${pathSlug}/`
  const top = topRarityCard(cards, byId)
  const total = deckTotal(cards)
  const image = top ? `${IMG_BASE}/${top.id}.jpg` : `${SITE}/ogp.png`

  const title = `${deckName} — デッキレシピ | デュエマ クラシック08`
  const rarityTag = top && top.rarity ? `【${top.rarity}】` : ''
  const topPart = top ? `${rarityTag}${top.name}入り。` : ''
  const civPart = civilizations.length ? `文明: ${civilizations.join('・')}。` : ''
  const desc = `${topPart}${total}枚デッキ。${civPart}${extraDesc ? ` ${extraDesc}` : ''}`
    .replace(/\s+/g, ' ')
    .trim()
  // recipe/{slug}/index.html から SPA トップへは2階層上（相対パス）。
  const redirect = `../../?recipe=${encodeURIComponent(redirectId)}`

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: deckName,
    description: desc,
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
  <p><a href="${escapeHtml(redirect)}">${escapeHtml(deckName)} のデッキレシピへ移動</a></p>
</body>
</html>
`
}

async function main() {
  const cards: CardJson[] = JSON.parse(await readFile(CARDS_FILE, 'utf-8'))
  const recipes: RecipeJson[] = JSON.parse(await readFile(RECIPES_FILE, 'utf-8'))
  const metaDecks: MetaDeckJson[] = JSON.parse(await readFile(META_FILE, 'utf-8'))
  const byId = new Map(cards.map(c => [c.id, c]))

  // --- card pages ---
  let cardPages = 0
  for (const card of cards) {
    const dir = join(PUBLIC_DIR, 'card', card.id)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.html'), cardPageHtml(card))
    cardPages++
  }

  // --- recipe pages ---
  let recipePages = 0
  const recipeUrls: string[] = []
  for (const recipe of recipes) {
    const dir = join(PUBLIC_DIR, 'recipe', recipe.id)
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'index.html'),
      deckPageHtml({
        pathSlug: recipe.id,
        redirectId: recipe.id,
        deckName: recipe.name || '無題のデッキ',
        cards: recipe.cards || [],
        civilizations: recipe.civilizations ?? [],
        byId,
        extraDesc: recipe.archetype ? `アーキタイプ: ${recipe.archetype}。` : undefined,
      })
    )
    recipeUrls.push(`${SITE}/recipe/${recipe.id}/`)
    recipePages++
  }

  // --- meta deck pages ---
  // meta-decks.json には id が無いため meta-{n} を採番する。
  // SPA の ?recipe= は RECIPES（recipes.json）の id しか解決できないため、
  // メタデッキのリダイレクト先は name 一致で対応する recipe があればその id、
  // 無ければトップ（/）へフォールバックする。
  let metaPages = 0
  const metaUrls: string[] = []
  const recipeByName = new Map(recipes.map(r => [r.name, r.id]))
  for (let i = 0; i < metaDecks.length; i++) {
    const deck = metaDecks[i]
    const slug = `meta-${i + 1}`
    const dir = join(PUBLIC_DIR, 'recipe', slug)
    const top = topRarityCard(deck.cards || [], byId)
    const matchedRecipeId = recipeByName.get(deck.name)
    // SPA で開ける recipe があればそこへ、無ければトップへ。
    // SPA は ?id= を消費せず着地がトップになるだけなので、明示的に / に統一する。
    // recipe/meta-{n}/index.html から SPA トップへは2階層上（相対パス）。
    const redirect = matchedRecipeId
      ? `../../?recipe=${encodeURIComponent(matchedRecipeId)}`
      : '../../'
    const url = `${SITE}/recipe/${slug}/`
    const total = deckTotal(deck.cards || [])
    const rarityTag = top && top.rarity ? `【${top.rarity}】` : ''
    const civ = deck.civilization ?? []
    const title = `${deck.name} — メタデッキ | デュエマ クラシック08`
    // OGP description は短く保つ（deck.description は長文なので含めない）。
    const desc = `${top ? `${rarityTag}${top.name}入り。` : ''}${total}枚デッキ。${
      civ.length ? `文明: ${civ.join('・')}。` : ''
    }`
      .replace(/\s+/g, ' ')
      .trim()
    const image = top ? `${IMG_BASE}/${top.id}.jpg` : `${SITE}/ogp.png`
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: deck.name,
      description: desc,
      image,
      url,
    })
    const html = `<!DOCTYPE html>
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
  <p><a href="${escapeHtml(redirect)}">${escapeHtml(deck.name)} のメタデッキへ移動</a></p>
</body>
</html>
`
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.html'), html)
    metaUrls.push(url)
    metaPages++
  }

  // robots.txt
  const robots = `User-agent: *
Allow: /
Sitemap: ${SITE}/sitemap.xml
`
  await writeFile(join(PUBLIC_DIR, 'robots.txt'), robots)

  // sitemap.xml（card + recipe + meta を一括生成、上書き競合を避ける）
  const today = new Date().toISOString().slice(0, 10)
  const urls = [
    `  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod></url>`,
    ...cards.map(
      c => `  <url><loc>${escapeXml(`${SITE}/card/${c.id}/`)}</loc><lastmod>${today}</lastmod></url>`
    ),
    ...recipeUrls.map(
      u => `  <url><loc>${escapeXml(u)}</loc><lastmod>${today}</lastmod></url>`
    ),
    ...metaUrls.map(
      u => `  <url><loc>${escapeXml(u)}</loc><lastmod>${today}</lastmod></url>`
    ),
  ]
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`
  await writeFile(join(PUBLIC_DIR, 'sitemap.xml'), sitemap)

  console.log(`Card pages   : ${cardPages}`)
  console.log(`Recipe pages : ${recipePages}`)
  console.log(`Meta pages   : ${metaPages}`)
  console.log(`robots.txt   : ${join(PUBLIC_DIR, 'robots.txt')}`)
  console.log(`sitemap.xml  : ${join(PUBLIC_DIR, 'sitemap.xml')} (${urls.length} urls)`)
}

main().catch(e => { console.error(e); process.exit(1) })
