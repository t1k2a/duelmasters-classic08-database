import { growthPagePath, type GrowthPage } from './growth-pages.js'
import type { RestrictionList } from '../verify/restrictions.js'

export interface CardSummary {
  id: string
  name: string
}

export interface RecipeSummary {
  id: string
  name: string
  cards: { id: string; count: number }[]
}

export interface GrowthRenderContext {
  siteUrl: string
  cardsById: Map<string, CardSummary>
  recipesById: Map<string, RecipeSummary>
  allPages: GrowthPage[]
  analyticsDepth: '../' | '../../'
  rules?: { classic05Pool: string; classic08Pool: string; cardCount: number; restrictions: RestrictionList }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function absoluteUrl(siteUrl: string, path: string): string {
  return `${siteUrl.replace(/\/$/, '')}/${path}`
}

function pageLink(page: GrowthPage, depth: '../' | '../../'): string {
  return `${depth}${growthPagePath(page)}`
}

const styles = `<style>
:root{color-scheme:light dark;--bg:#f8fafc;--surface:#fff;--text:#172033;--muted:#5b6475;--line:#dbe2ea;--brand:#4f46e5;--soft:#eef2ff}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Noto Sans JP",sans-serif;line-height:1.8}a{color:var(--brand)}header,main,footer{max-width:920px;margin:auto;padding:1.25rem}.brand{font-weight:800;text-decoration:none}.breadcrumb ol{display:flex;flex-wrap:wrap;gap:.5rem;list-style:none;padding:0;font-size:.875rem;color:var(--muted)}article,.hub-section{background:var(--surface);border:1px solid var(--line);border-radius:1rem;padding:clamp(1.25rem,4vw,2.5rem);box-shadow:0 12px 35px rgba(15,23,42,.06)}h1{font-size:clamp(1.8rem,6vw,3rem);line-height:1.25;margin:.25rem 0 1rem}h2{margin-top:2.25rem;line-height:1.4}.lead{font-size:1.1rem;color:var(--muted)}.cta{display:inline-block;background:var(--brand);color:#fff;text-decoration:none;font-weight:700;border-radius:.75rem;padding:.8rem 1.15rem;margin:1rem 0}.card-list,.guide-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:.75rem;padding:0;list-style:none}.card-list a,.guide-card{display:block;border:1px solid var(--line);border-radius:.75rem;padding:1rem;text-decoration:none;background:var(--soft)}.guide-card p{color:var(--muted);margin:.5rem 0}.recipe-list{padding-left:1.25rem}.references{font-size:.925rem}.footer-note{font-size:.8rem;color:var(--muted);text-align:center}@media(prefers-color-scheme:dark){:root{--bg:#101522;--surface:#171e2d;--text:#eef2ff;--muted:#b7c0d2;--line:#334155;--brand:#a5b4fc;--soft:#232b40}.cta{background:#4f46e5;color:#fff}}
</style>`

function sharedHead(title: string, description: string, canonical: string, siteUrl: string): string {
  const image = absoluteUrl(siteUrl, 'ogp.png')
  return `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  ${styles}`
}

function footer(depth: '../' | '../../'): string {
  return `<footer>
    <p class="footer-note">当サイトは非公式・非営利のファンメイドサイトです。カード画像・名称・文章の権利は各権利者に帰属します。</p>
  </footer>
  <script src="${depth}js/analytics-config.js"></script>
  <script src="${depth}js/analytics.js"></script>`
}

function renderRules(page: GrowthPage, context: GrowthRenderContext): string {
  if (page.kind !== 'guide' || !context.rules) return ''
  const { classic05Pool, classic08Pool, cardCount, restrictions } = context.rules
  const depth = context.analyticsDepth
  const pools = `<section><h2>カード範囲を確認する</h2><dl><dt>クラシック05の参考範囲</dt><dd>${escapeHtml(classic05Pool)}</dd><dt>クラシック08</dt><dd>${escapeHtml(classic08Pool)}</dd></dl><p>このサイトで検索できるカードは${cardCount.toLocaleString('ja-JP')}件です。収録件数は、そのまま大会で使用できるカードの総数を示すものではありません。</p><p><a href="${depth}?c05=1">クラシック05の参考絞り込みでカードを探す</a></p></section>`
  const entry = (card: { id: string | null; name: string }): string => card.id && context.cardsById.has(card.id)
    ? `<a href="${depth}card/${encodeURIComponent(card.id)}/">${escapeHtml(card.name)}</a>` : escapeHtml(card.name)
  const categories = [
    { title: '使用禁止', cards: restrictions.banned },
    { title: '各1枚まで', cards: restrictions.restricted },
    { title: `お助けカード（以下から合計${restrictions.helperPickLimit}枚まで）`, cards: restrictions.helper },
  ]
  const list = page.slug === 'classic08-restrictions' ? `<section><h2>クラシック08の制限一覧</h2><p>基準日: ${escapeHtml(String(restrictions.meta.asOf ?? ''))}。対戦前に採用するルールを相手と確認してください。</p>${categories.map(category => `<h3>${escapeHtml(category.title)}：${category.cards.length}種</h3><ul>${category.cards.map(card => `<li>${entry(card)}</li>`).join('')}</ul>`).join('')}<h3>同時投入禁止：${restrictions.bannedCombos.length}組</h3><ul>${restrictions.bannedCombos.map(combo => `<li>${combo.cards.map(entry).join(' ＋ ')}</li>`).join('')}</ul></section>` : ''
  return `${pools}${list}<p><a href="${depth}regulations.html">レギュレーションと制限カードの詳細を確認する</a></p>`
}

export function renderStaticPageGuideLinks(pages: GrowthPage[], depth: '../../'): string {
  if (pages.length === 0) return ''
  return `<section class="related-guides" style="margin-top:2rem;border:1px solid #c7d2fe;border-radius:.75rem;background:#eef2ff;padding:1rem;color:#172033" aria-labelledby="related-guides-heading">
    <h2 id="related-guides-heading" style="margin:0;font-size:1.125rem">関連ガイド</h2>
    <ul style="margin:.5rem 0 0;padding-left:1.25rem">
      ${pages.slice(0, 3).map(page => `<li><a href="${depth}${escapeHtml(growthPagePath(page))}" style="color:#4338ca">${escapeHtml(page.title)}</a></li>`).join('\n      ')}
    </ul>
  </section>`
}

export function renderGrowthPage(page: GrowthPage, context: GrowthRenderContext): string {
  const path = growthPagePath(page)
  const canonical = absoluteUrl(context.siteUrl, path)
  const depth = context.analyticsDepth
  const title = `${page.title} | デュエマ クラシック08 DB`
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: absoluteUrl(context.siteUrl, '') },
      { '@type': 'ListItem', position: 2, name: '遊び方・デッキ解説', item: absoluteUrl(context.siteUrl, 'guides/') },
      { '@type': 'ListItem', position: 3, name: page.title, item: canonical },
    ],
  }
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.title,
    description: page.description,
    mainEntityOfPage: canonical,
    inLanguage: 'ja',
    author: { '@type': 'Organization', name: 'デュエマ クラシック08 DB' },
  }

  const sections = page.sections.map(section => `<section>
      <h2>${escapeHtml(section.heading)}</h2>
      ${section.paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('\n      ')}
      ${section.bullets?.length ? `<ul>${section.bullets.map(bullet => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>` : ''}
    </section>`).join('\n    ')

  const relatedCards = page.relatedCardIds.flatMap(cardId => {
    const card = context.cardsById.get(cardId)
    return card ? [`<li><a href="${depth}card/${encodeURIComponent(card.id)}/">${escapeHtml(card.name)}</a></li>`] : []
  }).join('\n        ')
  const relatedPages = (page.relatedGuideSlugs ?? []).flatMap(slug => {
    const related = context.allPages.find(item => item.slug === slug)
    return related ? [`<li><a href="${escapeHtml(pageLink(related, depth))}">${escapeHtml(related.title)}</a></li>`] : []
  }).join('\n        ')

  const recipe = page.featuredRecipeId ? context.recipesById.get(page.featuredRecipeId) : undefined
  const recipeBlock = recipe ? `<section aria-labelledby="recipe-heading">
      <h2 id="recipe-heading">収録サンプルレシピ</h2>
      <p>「${escapeHtml(recipe.name)}」を40枚の出発点として読み込みます。環境や好みに合わせて調整してください。</p>
      <ul class="recipe-list">${recipe.cards.map(item => {
        const card = context.cardsById.get(item.id)
        return `<li>${card ? `<a href="${depth}card/${encodeURIComponent(item.id)}/">${escapeHtml(card.name)}</a>` : escapeHtml(item.id)} × ${item.count}</li>`
      }).join('')}</ul>
    </section>` : ''

  const cta = page.kind === 'deck-guide' && page.featuredRecipeId
    ? `<a class="cta" href="${depth}?recipe=${encodeURIComponent(page.featuredRecipeId)}&amp;utm_source=site&amp;utm_medium=guide&amp;utm_campaign=organic_growth"
       data-growth-cta="copy_deck" data-content-id="${escapeHtml(page.slug)}"
       onclick="if(window.trackGrowthEvent)window.trackGrowthEvent('content_cta_click',{content_id:${escapeHtml(scriptJson(page.slug))},destination_type:'deck_builder'})">このデッキをコピーして編集</a>`
    : ''

  const references = page.references?.length ? `<section class="references">
      <h2>参考資料</h2>
      <ul>${page.references.map(reference => `<li><a href="${escapeHtml(reference.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(reference.label)}</a></li>`).join('')}</ul>
    </section>` : ''

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  ${sharedHead(title, page.description, canonical, context.siteUrl)}
  <script type="application/ld+json">${scriptJson(article)}</script>
  <script type="application/ld+json">${scriptJson(breadcrumbs)}</script>
</head>
<body>
  <header><a class="brand" href="${depth}">デュエマ クラシック08 DB</a></header>
  <main>
    <nav class="breadcrumb" aria-label="パンくずリスト"><ol><li><a href="${depth}">ホーム</a></li><li>/</li><li><a href="${depth}guides/">遊び方・デッキ解説</a></li><li>/</li><li aria-current="page">${escapeHtml(page.title)}</li></ol></nav>
    <article>
      <h1>${escapeHtml(page.title)}</h1>
      <p class="lead">${escapeHtml(page.lead)}</p>
      ${cta}
      ${sections}
      ${renderRules(page, context)}
      ${recipeBlock}
      ${relatedCards ? `<section><h2>関連カード</h2><ul class="card-list">${relatedCards}</ul></section>` : ''}
      ${relatedPages ? `<section><h2>次に読むガイド</h2><ul class="card-list">${relatedPages}</ul></section>` : ''}
      ${references}
      <p><a href="${depth}guides/">遊び方・デッキ解説一覧へ戻る</a></p>
    </article>
  </main>
  ${footer(depth)}
</body>
</html>
`.replace(/[ \t]+$/gm, '')
}

export function renderGrowthHub(pages: GrowthPage[], context: GrowthRenderContext): string {
  const canonical = absoluteUrl(context.siteUrl, 'guides/')
  const title = '遊び方・デッキ解説 | デュエマ クラシック08 DB'
  const description = 'デュエマクラシック08の始め方、独自レギュレーション、主要デッキの動かし方と調整の考え方をまとめたガイドです。'
  const renderCards = (items: GrowthPage[]) => items.map(page => `<a class="guide-card" href="../${escapeHtml(growthPagePath(page))}"><strong>${escapeHtml(page.title)}</strong><p>${escapeHtml(page.description)}</p></a>`).join('\n      ')
  const basics = pages.filter(page => page.kind === 'guide')
  const decks = pages.filter(page => page.kind === 'deck-guide')
  const breadcrumbs = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: absoluteUrl(context.siteUrl, '') },
      { '@type': 'ListItem', position: 2, name: '遊び方・デッキ解説', item: canonical },
    ],
  }
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  ${sharedHead(title, description, canonical, context.siteUrl)}
  <script type="application/ld+json">${scriptJson(breadcrumbs)}</script>
</head>
<body>
  <header><a class="brand" href="../">デュエマ クラシック08 DB</a></header>
  <main>
    <nav class="breadcrumb" aria-label="パンくずリスト"><ol><li><a href="../">ホーム</a></li><li>/</li><li aria-current="page">遊び方・デッキ解説</li></ol></nav>
    <section class="hub-section">
      <h1>遊び方・デッキ解説</h1><p class="lead">初めての準備から主要デッキの考え方まで、目的に合う入口を選べます。</p>
      <h2>まず知りたい基本</h2><div class="guide-grid">${renderCards(basics)}</div>
      <h2>デッキ解説</h2><div class="guide-grid">${renderCards(decks)}</div>
    </section>
  </main>
  ${footer(context.analyticsDepth)}
</body>
</html>
`
}
