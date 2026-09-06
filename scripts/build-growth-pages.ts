import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { growthPagePath, growthSitemapUrls, validateGrowthPages, type GrowthCardSource, type GrowthRecipeSource } from '../src/growth/growth-pages.js'
import { renderGrowthHub, renderGrowthPage } from '../src/growth/render-growth-page.js'
import type { RestrictionList } from '../src/verify/restrictions.js'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const SITE_URL = 'https://t1k2a.github.io/duelmasters-classic08-database'

export interface BuildGrowthPagesOptions {
  publicDir?: string
  contentFile?: string
  cardsFile?: string
  recipesFile?: string
  classic05PoolFile?: string
  restrictionsFile?: string
}

export interface GrowthPageManifestEntry {
  path: string
  title: string
  kind: 'guide' | 'deck-guide'
  relatedCardIds: string[]
  featuredRecipeId?: string
}

export interface BuildGrowthPagesResult {
  urls: string[]
  pages: GrowthPageManifestEntry[]
}

export async function buildGrowthPages(options: BuildGrowthPagesOptions = {}): Promise<BuildGrowthPagesResult> {
  const publicDir = options.publicDir ?? join(projectRoot, 'public')
  const contentFile = options.contentFile ?? join(projectRoot, 'data/content/growth-pages.json')
  const cardsFile = options.cardsFile ?? join(projectRoot, 'public/cards.json')
  const recipesFile = options.recipesFile ?? join(projectRoot, 'public/data/recipes.json')

  const [input, cards, recipes, classic05, restrictions] = await Promise.all([
    readFile(contentFile, 'utf8').then(JSON.parse),
    readFile(cardsFile, 'utf8').then(JSON.parse) as Promise<GrowthCardSource[]>,
    readFile(recipesFile, 'utf8').then(JSON.parse) as Promise<GrowthRecipeSource[]>,
    readFile(options.classic05PoolFile ?? join(projectRoot, 'public/data/classic05-pool.json'), 'utf8').then(JSON.parse) as Promise<{ meta: { cardPool: string } }>,
    readFile(options.restrictionsFile ?? join(projectRoot, 'public/data/classic08-restrictions.json'), 'utf8').then(JSON.parse) as Promise<RestrictionList>,
  ])
  const { pages } = validateGrowthPages(input, { cards, recipes })
  const cardsById = new Map(cards.map(card => [card.id, card]))
  const recipesById = new Map(recipes.map(recipe => [recipe.id, {
    id: recipe.id,
    name: recipe.name ?? recipe.id,
    cards: (recipe.cards ?? []).map(card => ({ id: card.id, count: card.count ?? 0 })),
  }]))
  const context = {
    siteUrl: SITE_URL, cardsById, recipesById, allPages: pages, analyticsDepth: '../../' as const,
    rules: { classic05Pool: classic05.meta.cardPool, classic08Pool: String(restrictions.meta.cardPool), cardCount: cards.length, restrictions },
  }

  const manifest: GrowthPageManifestEntry[] = pages.map(page => ({
    path: growthPagePath(page),
    title: page.title,
    kind: page.kind,
    relatedCardIds: page.relatedCardIds,
    ...(page.featuredRecipeId ? { featuredRecipeId: page.featuredRecipeId } : {}),
  }))

  await mkdir(join(publicDir, 'guides'), { recursive: true })
  await writeFile(
    join(publicDir, 'guides/index.html'),
    renderGrowthHub(pages, { ...context, analyticsDepth: '../' }),
  )
  for (const page of pages) {
    const outputDir = join(publicDir, page.kind, page.slug)
    await mkdir(outputDir, { recursive: true })
    await writeFile(join(outputDir, 'index.html'), renderGrowthPage(page, context))
  }
  await mkdir(join(publicDir, 'data'), { recursive: true })
  await writeFile(join(publicDir, 'data/growth-pages.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  return {
    urls: growthSitemapUrls(pages, SITE_URL),
    pages: manifest,
  }
}

async function main(): Promise<void> {
  const result = await buildGrowthPages()
  console.log(`Growth pages: ${result.pages.length}`)
  console.log(`Growth URLs : ${result.urls.length}`)
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (entry === import.meta.url) {
  main().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
