import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import { buildGrowthPages } from '../../scripts/build-growth-pages.js'
import { checkDeckLegality } from './deck-legality.js'
import type { RestrictionList } from './restrictions.js'
import { extractSitemapLastModified, growthSitemapUrls, validateGrowthPages, type GrowthPage } from '../growth/growth-pages.js'

const root = resolve(import.meta.dirname, '../..')
const contentFile = join(root, 'data/content/growth-pages.json')
const cardsFile = join(root, 'public/cards.json')
const recipesFile = join(root, 'public/data/recipes.json')
const restrictionsFile = join(root, 'public/data/classic08-restrictions.json')

const validGuide: GrowthPage = {
  kind: 'guide',
  slug: 'valid-guide',
  title: 'クラシック08を始めるための基本ガイド',
  description: 'クラシック08を始める前に知っておきたいカードプールと遊び方を、初めての人向けに説明します。',
  lead: '最初の対戦までを迷わず進めるための入口です。',
  sections: [{ heading: '概要', paragraphs: ['カードを探してデッキを組み、対戦の準備を進めます。'] }],
  relatedCardIds: [],
  relatedGuideSlugs: [],
  references: [{ label: '公式サイト', url: 'https://dm.takaratomy.co.jp/' }],
}

test('本番コンテンツは8本でslugとcanonical pathが一意である', async () => {
  const pages = JSON.parse(await readFile(contentFile, 'utf8'))
  const result = validateGrowthPages(pages, { cards: [], recipes: [], allowMissingReferences: true })
  assert.equal(result.pages.length, 8)
  assert.equal(new Set(result.pages.map(page => page.slug)).size, 8)
  assert.equal(new Set(result.pages.map(page => `${page.kind}/${page.slug}/`)).size, 8)
})

test('存在しないカードと40枚でないレシピを集約して拒否する', () => {
  const broken = {
    ...validGuide,
    kind: 'deck-guide',
    slug: 'broken-deck',
    relatedCardIds: ['missing'],
    featuredRecipeId: 'short',
  }
  assert.throws(
    () => validateGrowthPages([broken], {
      cards: [{ id: 'known', name: '既知カード' }],
      recipes: [{ id: 'short', poolStatus: 'in', cards: [{ id: 'known', count: 39 }] }],
    }, { expectedPageCount: 1 }),
    error => {
      assert.match(String(error), /relatedCardIds.*missing/)
      assert.match(String(error), /40枚/)
      return true
    },
  )
})

test('deck-guideは対象内レシピと解決可能な全カードを必要とする', () => {
  const broken = {
    ...validGuide,
    kind: 'deck-guide',
    slug: 'unresolved-deck',
    relatedCardIds: ['known'],
    featuredRecipeId: 'deck',
  }
  assert.throws(
    () => validateGrowthPages([broken], {
      cards: [{ id: 'known', name: '既知カード' }],
      recipes: [{ id: 'deck', poolStatus: 'out', cards: [{ id: 'known', count: 39 }, { id: 'missing', count: 1 }] }],
    }, { expectedPageCount: 1 }),
    error => {
      assert.match(String(error), /poolStatus.*in/)
      assert.match(String(error), /レシピ内カード.*missing/)
      return true
    },
  )
})

test('構造上の公開不備を拒否する', async t => {
  const cases: Array<[string, unknown, RegExp]> = [
    ['重複slug', [validGuide, validGuide], /slug.*重複/],
    ['不正slug', [{ ...validGuide, slug: 'Bad Slug' }], /slug/],
    ['空section', [{ ...validGuide, sections: [] }], /sections/],
    ['空paragraphs', [{ ...validGuide, sections: [{ heading: '概要', paragraphs: [] }] }], /paragraphs/],
    ['TODO', [{ ...validGuide, lead: 'TODO: 後で書く' }], /テンプレート残骸/],
    ['要確認', [{ ...validGuide, lead: '内容は要確認です' }], /テンプレート残骸/],
    ['波括弧', [{ ...validGuide, lead: '{{lead}}' }], /テンプレート残骸/],
    ['HTTP参照', [{ ...validGuide, references: [{ label: 'unsafe', url: 'http://example.com' }] }], /https/],
  ]

  for (const [name, input, pattern] of cases) {
    await t.test(name, () => {
      assert.throws(
        () => validateGrowthPages(input, { cards: [], recipes: [], allowMissingReferences: true }, { expectedPageCount: Array.isArray(input) ? input.length : 1 }),
        pattern,
      )
    })
  }
})

test('基礎3ページは必要な見出し、十分な本文、関連カードと別ガイド導線を持つ', async () => {
  const pages = JSON.parse(await readFile(contentFile, 'utf8')) as GrowthPage[]
  const requiredSections: Record<string, string[]> = {
    'classic08-getting-started': ['クラシック08とは', '必要なもの', 'デッキを組む', '対戦までの流れ'],
    'classic05-vs-classic08': ['カードプール', 'レギュレーション', 'どちらを選ぶか'],
    'classic08-restrictions': ['殿堂', 'プレミアム殿堂', 'お助けカード', '確認方法'],
  }

  for (const [slug, headings] of Object.entries(requiredSections)) {
    const page = pages.find(item => item.slug === slug)
    assert.ok(page, `${slug} が必要です`)
    const actualHeadings = page.sections.map(section => section.heading).join('\n')
    for (const heading of headings) assert.match(actualHeadings, new RegExp(heading), `${slug}: ${heading}`)
    const body = page.sections.flatMap(section => [...section.paragraphs, ...(section.bullets ?? [])]).join('')
    assert.ok(body.length >= 600, `${slug}: 本文が600文字未満です (${body.length})`)
    assert.ok(page.relatedCardIds.length >= 3, `${slug}: 関連カードが3件未満です`)
    assert.ok((page.relatedGuideSlugs ?? []).length >= 1, `${slug}: 関連ガイドがありません`)
  }
})

test('5本のデッキガイドは指定された合法な40枚レシピと主要カードを持つ', async () => {
  const [input, cards, recipes] = await Promise.all([
    readFile(contentFile, 'utf8').then(JSON.parse),
    readFile(cardsFile, 'utf8').then(JSON.parse),
    readFile(recipesFile, 'utf8').then(JSON.parse),
  ])
  const { pages } = validateGrowthPages(input, { cards, recipes })
  const expected: Record<string, { recipe: string; keyCard: string }> = {
    'shinobi-dorugeza': { recipe: 'rcp-2628', keyCard: 'dm13-s04' },
    'black-green-rush': { recipe: 'rcp-3716', keyCard: 'dm28-064' },
    'nekura-fernando': { recipe: 'rcp-5850', keyCard: 'dm28-005' },
    'bolmeteus-control': { recipe: 'rcp-1756', keyCard: 'dm06-s08' },
    'beginner-low-rarity-deck': { recipe: 'rcp-0114', keyCard: 'dm01-100' },
  }

  for (const [slug, contract] of Object.entries(expected)) {
    const page = pages.find(item => item.slug === slug)
    assert.ok(page, `${slug} が必要です`)
    assert.equal(page.kind, 'deck-guide')
    assert.equal(page.featuredRecipeId, contract.recipe)
    assert.ok(page.relatedCardIds.includes(contract.keyCard), `${slug}: 主要カードがありません`)
    const headings = page.sections.map(section => section.heading).join('\n')
    for (const heading of ['デッキの狙い', '主要カード', '基本方針', '苦手な状況', 'サンプルレシピ']) {
      assert.match(headings, new RegExp(heading), `${slug}: ${heading}`)
    }
  }
})

test('5本の掲載レシピはクラシック08独自制限にも違反しない', async () => {
  const [pages, cards, recipes, restrictions]: [GrowthPage[], Array<{ id: string; name: string }>, Array<{ id: string; cards: Array<{ id: string; count: number }> }>, RestrictionList] = await Promise.all([
    readFile(contentFile, 'utf8').then(JSON.parse),
    readFile(cardsFile, 'utf8').then(JSON.parse),
    readFile(recipesFile, 'utf8').then(JSON.parse),
    readFile(restrictionsFile, 'utf8').then(JSON.parse),
  ])
  const cardsById = new Map(cards.map(card => [card.id, card]))
  const recipesById = new Map(recipes.map(recipe => [recipe.id, recipe]))
  for (const page of pages.filter(item => item.kind === 'deck-guide')) {
    const recipe = recipesById.get(page.featuredRecipeId ?? '')
    assert.ok(recipe, `${page.slug}: 掲載レシピが必要です`)
    const deck = recipe.cards.map(item => ({ ...item, name: cardsById.get(item.id)?.name ?? item.id }))
    const result = checkDeckLegality(deck, restrictions)
    assert.equal(result.legal, true, `${page.slug}: ${result.violations.map(item => item.message).join(' / ')}`)
  }
})

test('hubと8本を決定的に生成する', async () => {
  const out = await mkdtemp(join(tmpdir(), 'growth-pages-'))
  try {
    const first = await buildGrowthPages({ publicDir: out, contentFile, cardsFile, recipesFile })
    const firstHub = await readFile(join(out, 'guides/index.html'), 'utf8')
    const second = await buildGrowthPages({ publicDir: out, contentFile, cardsFile, recipesFile })
    const secondHub = await readFile(join(out, 'guides/index.html'), 'utf8')
    assert.equal(first.urls.length, 9)
    assert.deepEqual(second, first)
    assert.equal(secondHub, firstHub)
    await access(join(out, 'guide/classic08-getting-started/index.html'))
    await access(join(out, 'deck-guide/shinobi-dorugeza/index.html'))
    const restrictionsHtml = await readFile(join(out, 'guide/classic08-restrictions/index.html'), 'utf8')
    const pool = JSON.parse(await readFile(join(root, 'public/data/classic05-pool.json'), 'utf8'))
    const restrictions = JSON.parse(await readFile(restrictionsFile, 'utf8'))
    const cards = JSON.parse(await readFile(cardsFile, 'utf8'))
    assert.ok(restrictionsHtml.includes(pool.meta.cardPool))
    assert.ok(restrictionsHtml.includes(restrictions.meta.cardPool))
    assert.ok(restrictionsHtml.includes(`${cards.length.toLocaleString('ja-JP')}件`))
    assert.ok(restrictionsHtml.includes(restrictions.banned[0].name))
    assert.ok(restrictionsHtml.includes(`各1枚まで：${restrictions.restricted.length}種`))
    assert.ok(restrictionsHtml.includes('href="../../regulations.html"'))
  } finally {
    await rm(out, { recursive: true, force: true })
  }
})

test('サイトマップ用URLはハブと全ガイドを重複なく返す', async () => {
  const pages = JSON.parse(await readFile(contentFile, 'utf8')) as GrowthPage[]
  const urls = growthSitemapUrls(pages, 'https://example.com/base/')
  assert.equal(urls.length, 9)
  assert.equal(urls[0], 'https://example.com/base/guides/')
  assert.ok(urls.includes('https://example.com/base/deck-guide/shinobi-dorugeza/'))
  assert.equal(new Set(urls).size, urls.length)
})

test('既存サイトマップのlastmodをURLごとに再利用できる', () => {
  const dates = extractSitemapLastModified(`<?xml version="1.0"?><urlset>
    <url><loc>https://example.com/</loc><lastmod>2026-08-01</lastmod></url>
    <url><loc>https://example.com/card/a/</loc><lastmod>2026-08-02</lastmod></url>
  </urlset>`)
  assert.equal(dates.get('https://example.com/'), '2026-08-01')
  assert.equal(dates.get('https://example.com/card/a/'), '2026-08-02')
})
