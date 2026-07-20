/**
 * Build script: generate per-card / per-recipe static pages, robots.txt and sitemap.xml.
 *
 * Reads public/cards.json, public/data/recipes.json, public/data/meta-decks.json and emits:
 *   - public/card/{id}/index.html        (OGP / Twitter Card / JSON-LD + 静的コンテンツ + アプリへのリンク)
 *   - public/recipe/{rcp-id}/index.html  (deck OGP + 静的カードリスト + アプリへのリンク)
 *   - public/recipe/meta-{n}/index.html  (meta deck OGP + 静的カードリスト + アプリへのリンク)
 *   - public/robots.txt
 *   - public/sitemap.xml
 *
 * クローラにリダイレクト扱いされてロングテール検索資産が死ぬのを防ぐため、
 * <body> には実コンテンツを静的描画し、即時リダイレクト（refresh=0 / location.replace）は行わない。
 * アプリ（SPA）へは通常リンク / 遷移ボタンで案内する。
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

// SPA(public/index.html)と同じ文明カラー。静的ページでも見た目を揃える。
const PAGE_STYLE = `
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    .civ-光  { background:#fef9c3; border-color:#ca8a04; color:#713f12; }
    .civ-水  { background:#dbeafe; border-color:#3b82f6; color:#1e3a8a; }
    .civ-闇  { background:#f3e8ff; border-color:#9333ea; color:#581c87; }
    .civ-火  { background:#fee2e2; border-color:#ef4444; color:#7f1d1d; }
    .civ-自然 { background:#dcfce7; border-color:#22c55e; color:#14532d; }`

const CIV_CLASS: Record<string, string> = {
  光: 'civ-光', 水: 'civ-水', 闇: 'civ-闇', 火: 'civ-火', 自然: 'civ-自然',
}

function civBadges(civs: string[]): string {
  return civs
    .map(c => `<span class="${CIV_CLASS[c] ?? ''} border rounded-full px-2 py-0.5 text-xs font-medium">${escapeHtml(c)}</span>`)
    .join(' ')
}

// navigator.share + クリップボード fallback（public/index.html:1231 shareDeck() と同方式）。
function shareScript(shareTitle: string, shareUrl: string): string {
  return `<script>
function shareCard() {
  var url = ${JSON.stringify(shareUrl)};
  var title = ${JSON.stringify(shareTitle)};
  if (navigator.share) {
    navigator.share({ title: title, text: title, url: url }).catch(function () {});
    return;
  }
  navigator.clipboard.writeText(title + '\\n' + url)
    .then(function () { showToast('共有URLをコピーしました'); })
    .catch(function () { showToast('コピーに失敗しました'); });
}
function showToast(msg) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(function () { t.classList.add('hidden'); }, 2000);
}
</script>`
}

function cardPageHtml(card: CardJson): string {
  const url = `${SITE}/card/${card.id}/`
  const image = `${IMG_BASE}/${card.id}.jpg`
  const title = `${card.name} - デュエルマスターズ クラシック08`
  const desc = (card.text ?? card.name).replace(/\s+/g, ' ').trim()
  // card/{id}/index.html から SPA トップ(public/index.html)へは2階層上。
  // GitHub Pages のサブパス配信でも壊れないよう相対パスにする。
  const appLink = `../../?id=${encodeURIComponent(card.id)}`

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Thing',
    name: card.name,
    description: card.text ?? '',
    image,
    url,
  })

  const civs = civBadges(card.civilizations ?? [])
  const specs: string[] = []
  if (card.cardType) specs.push(`<span class="border border-gray-300 rounded-full px-2 py-0.5 text-xs">${escapeHtml(card.cardType)}</span>`)
  if (card.rarity) specs.push(`<span class="border border-gray-300 rounded-full px-2 py-0.5 text-xs">${escapeHtml(card.rarity)}</span>`)
  if (card.cost != null) specs.push(`<span class="border border-gray-300 rounded-full px-2 py-0.5 text-xs">コスト ${card.cost}</span>`)
  if (card.power != null) specs.push(`<span class="border border-gray-300 rounded-full px-2 py-0.5 text-xs">パワー ${card.power}</span>`)
  const racesRow = (card.races && card.races.length)
    ? `<p class="text-sm text-gray-600 mt-2">種族: ${escapeHtml(card.races.join(' / '))}</p>`
    : ''
  const textBlock = card.text
    ? `<div class="mt-4 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">${escapeHtml(card.text)}</div>`
    : ''

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
  <script src="https://cdn.tailwindcss.com"></script>
  <style>${PAGE_STYLE}</style>
  <script type="application/ld+json">
${jsonLdEscape(jsonLd)}
  </script>
</head>
<body class="bg-gray-50 text-gray-900">
  <main class="max-w-3xl mx-auto px-4 py-8">
    <div class="sm:flex sm:gap-6">
      <img src="${escapeHtml(image)}" alt="${escapeHtml(card.name)}" width="300" height="418"
           class="w-56 mx-auto sm:mx-0 rounded-lg shadow" loading="lazy">
      <div class="mt-4 sm:mt-0 flex-1">
        <h1 class="text-2xl font-bold">${escapeHtml(card.name)}</h1>
        <div class="flex flex-wrap gap-1.5 mt-3">${civs} ${specs.join(' ')}</div>
        ${racesRow}
        ${textBlock}
        <div class="flex flex-wrap gap-3 mt-6">
          <a href="${escapeHtml(appLink)}"
             class="inline-block bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2">アプリで開く（検索・デッキ構築）</a>
          <button type="button" onclick="shareCard()"
             class="inline-block border border-gray-300 hover:bg-gray-100 text-sm font-medium rounded-lg px-4 py-2">共有</button>
        </div>
        <p class="mt-6"><a href="../../" class="text-indigo-600 hover:underline text-sm">デュエルマスターズ クラシック08 データベース トップへ</a></p>
      </div>
    </div>
  </main>
  <div id="toast" class="hidden fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm rounded-lg px-4 py-2 shadow-lg"></div>
  ${shareScript(title, url)}
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

// デッキ内のカードを画像サムネイル + 名前 + 枚数の静的リストで描画する。
function deckCardListHtml(deckCards: DeckCard[], byId: Map<string, CardJson>): string {
  const items = deckCards
    .map(dc => {
      const card = byId.get(dc.id)
      const name = card?.name ?? dc.name ?? dc.id
      const image = `${IMG_BASE}/${dc.id}.jpg`
      return `    <li class="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-2">
      <img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" width="40" height="56" class="w-10 rounded" loading="lazy">
      <span class="flex-1 text-sm">${escapeHtml(name)}</span>
      <span class="text-sm font-semibold text-gray-500">×${dc.count || 0}</span>
    </li>`
    })
    .join('\n')
  return `<ul class="grid sm:grid-cols-2 gap-2 mt-4">\n${items}\n  </ul>`
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
  const appLink = `../../?recipe=${encodeURIComponent(redirectId)}`

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: deckName,
    description: desc,
    image,
    url,
  })

  const civs = civBadges(civilizations)
  const cardList = deckCardListHtml(cards, byId)

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
  <script src="https://cdn.tailwindcss.com"></script>
  <style>${PAGE_STYLE}</style>
  <script type="application/ld+json">
${jsonLdEscape(jsonLd)}
  </script>
</head>
<body class="bg-gray-50 text-gray-900">
  <main class="max-w-3xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold">${escapeHtml(deckName)}</h1>
    <div class="flex flex-wrap items-center gap-1.5 mt-3">
      ${civs}
      <span class="border border-gray-300 rounded-full px-2 py-0.5 text-xs">${total}枚</span>
    </div>
    <div class="flex flex-wrap gap-3 mt-6">
      <a href="${escapeHtml(appLink)}"
         class="inline-block bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2">アプリで開く（デッキ構築）</a>
      <button type="button" onclick="shareCard()"
         class="inline-block border border-gray-300 hover:bg-gray-100 text-sm font-medium rounded-lg px-4 py-2">共有</button>
    </div>
    <h2 class="text-lg font-semibold mt-8">カードリスト</h2>
    ${cardList}
    <p class="mt-6"><a href="../../" class="text-indigo-600 hover:underline text-sm">デュエルマスターズ クラシック08 データベース トップへ</a></p>
  </main>
  <div id="toast" class="hidden fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm rounded-lg px-4 py-2 shadow-lg"></div>
  ${shareScript(title, url)}
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
    // recipe/meta-{n}/index.html から SPA トップへは2階層上（相対パス）。
    const appLink = matchedRecipeId
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
    const civs = civBadges(civ)
    const cardList = deckCardListHtml(deck.cards || [], byId)
    const descBlock = deck.description
      ? `<p class="mt-4 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">${escapeHtml(deck.description)}</p>`
      : ''
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
  <script src="https://cdn.tailwindcss.com"></script>
  <style>${PAGE_STYLE}</style>
  <script type="application/ld+json">
${jsonLdEscape(jsonLd)}
  </script>
</head>
<body class="bg-gray-50 text-gray-900">
  <main class="max-w-3xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold">${escapeHtml(deck.name)}</h1>
    <div class="flex flex-wrap items-center gap-1.5 mt-3">
      ${civs}
      <span class="border border-gray-300 rounded-full px-2 py-0.5 text-xs">${total}枚</span>
      <span class="border border-gray-300 rounded-full px-2 py-0.5 text-xs">メタデッキ</span>
    </div>
    ${descBlock}
    <div class="flex flex-wrap gap-3 mt-6">
      <a href="${escapeHtml(appLink)}"
         class="inline-block bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2">アプリで開く（デッキ構築）</a>
      <button type="button" onclick="shareCard()"
         class="inline-block border border-gray-300 hover:bg-gray-100 text-sm font-medium rounded-lg px-4 py-2">共有</button>
    </div>
    <h2 class="text-lg font-semibold mt-8">カードリスト</h2>
    ${cardList}
    <p class="mt-6"><a href="../../" class="text-indigo-600 hover:underline text-sm">デュエルマスターズ クラシック08 データベース トップへ</a></p>
  </main>
  <div id="toast" class="hidden fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm rounded-lg px-4 py-2 shadow-lg"></div>
  ${shareScript(title, url)}
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
