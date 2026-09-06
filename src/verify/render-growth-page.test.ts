import assert from 'node:assert/strict'
import test from 'node:test'

import type { GrowthPage } from '../growth/growth-pages.js'
import { renderGrowthHub, renderGrowthPage, renderStaticPageGuideLinks, type GrowthRenderContext } from '../growth/render-growth-page.js'

const guide: GrowthPage = {
  kind: 'guide',
  slug: 'classic08-getting-started',
  title: 'クラシック08の始め方',
  description: 'デュエマクラシック08をこれから始める人に、カード検索から対戦準備までを案内します。',
  lead: 'まずは遊び方の全体像をつかみましょう。',
  sections: [{ heading: '概要', paragraphs: ['カードを探してデッキを組みます。'] }],
  relatedCardIds: ['card-1'],
  relatedGuideSlugs: ['deck'],
  references: [{ label: '安全な外部資料', url: 'https://example.com/reference' }],
}

const deck: GrowthPage = {
  ...guide,
  kind: 'deck-guide',
  slug: 'deck',
  title: 'サンプルデッキ解説',
  relatedGuideSlugs: ['classic08-getting-started'],
  featuredRecipeId: 'rcp-3828',
}

const context: GrowthRenderContext = {
  siteUrl: 'https://t1k2a.github.io/duelmasters-classic08-database',
  cardsById: new Map([['card-1', { id: 'card-1', name: '関連カード' }]]),
  recipesById: new Map([['rcp-3828', { id: 'rcp-3828', name: 'サンプルレシピ', cards: [{ id: 'card-1', count: 40 }] }]]),
  allPages: [guide, deck],
  analyticsDepth: '../../',
}

test('固有SEOメタデータ、OGP、ArticleとBreadcrumbListを生成する', () => {
  const html = renderGrowthPage(guide, context)
  assert.match(html, /<html lang="ja">/)
  assert.match(html, /<link rel="canonical" href="https:\/\/t1k2a\.github\.io\/duelmasters-classic08-database\/guide\/classic08-getting-started\/">/)
  assert.match(html, /property="og:title"/)
  assert.match(html, /name="twitter:card"/)
  assert.match(html, /"@type":"Article"/)
  assert.match(html, /"@type":"BreadcrumbList"/)
})

test('本文、カード、外部参照をescapeし外部リンクを保護する', () => {
  const malicious: GrowthPage = {
    ...guide,
    title: '<script>alert(1)</script>',
    sections: [{ heading: '<img src=x onerror=alert(1)>', paragraphs: ['<script>alert(2)</script>'] }],
    references: [{ label: '<b>資料</b>', url: 'https://example.com/?q=<script>' }],
  }
  const maliciousContext: GrowthRenderContext = {
    ...context,
    cardsById: new Map([['card-1', { id: 'card-1', name: '<script>alert(3)</script>' }]]),
  }
  const html = renderGrowthPage(malicious, maliciousContext)
  assert.doesNotMatch(html, /<script>alert/)
  assert.doesNotMatch(html, /<img src=x/)
  assert.match(html, /&lt;script&gt;alert/)
  assert.match(html, /target="_blank" rel="noopener noreferrer"/)
  assert.match(html, /\\u003cscript>/)
})

test('deck-guideだけにJS不要のコピー編集CTAを出す', () => {
  const deckHtml = renderGrowthPage(deck, context)
  assert.match(deckHtml, /href="\.\.\/\.\.\/\?recipe=rcp-3828&amp;utm_source=site&amp;utm_medium=guide&amp;utm_campaign=organic_growth"/)
  assert.match(deckHtml, /data-growth-cta="copy_deck"/)
  assert.match(deckHtml, /data-content-id="deck"/)
  assert.match(deckHtml, /trackGrowthEvent\('content_cta_click'/)
  assert.match(deckHtml, /destination_type:'deck_builder'/)
  assert.match(deckHtml, /@media\(prefers-color-scheme:dark\).*\.cta\{background:#4f46e5;color:#fff\}/)
  assert.doesNotMatch(renderGrowthPage(guide, context), /data-growth-cta="copy_deck"/)
})

test('関連カード、関連ガイド、ハブへの文脈リンクを生成する', () => {
  const html = renderGrowthPage(guide, context)
  assert.match(html, /href="\.\.\/\.\.\/card\/card-1\/"/)
  assert.match(html, />関連カード<\/a>/)
  assert.match(html, /href="\.\.\/\.\.\/deck-guide\/deck\/"/)
  assert.match(html, /href="\.\.\/\.\.\/guides\/"/)
})

test('ハブは8本の種類別リンクと固有canonicalを出す', () => {
  const pages = Array.from({ length: 8 }, (_, index): GrowthPage => ({
    ...guide,
    kind: index < 3 ? 'guide' : 'deck-guide',
    slug: `page-${index}`,
    title: `ページ${index}`,
  }))
  const html = renderGrowthHub(pages, { ...context, allPages: pages, analyticsDepth: '../' })
  assert.match(html, /<link rel="canonical" href="https:\/\/t1k2a\.github\.io\/duelmasters-classic08-database\/guides\/">/)
  assert.equal((html.match(/class="guide-card"/g) ?? []).length, 8)
  assert.match(html, /\.\.\/guide\/page-0\//)
  assert.match(html, /\.\.\/deck-guide\/page-7\//)
})

test('GAスクリプトは指定された相対深度で読み込む', () => {
  const html = renderGrowthPage(guide, context)
  assert.match(html, /src="\.\.\/\.\.\/js\/analytics-config\.js"/)
  assert.match(html, /src="\.\.\/\.\.\/js\/analytics\.js"/)
})

test('既存カード・レシピページ用の関連ガイドリンクを最大3件生成する', () => {
  const pages = [guide, deck, { ...guide, slug: 'third', title: '3本目' }, { ...guide, slug: 'fourth', title: '4本目' }]
  const html = renderStaticPageGuideLinks(pages, '../../')
  assert.match(html, /関連ガイド/)
  assert.match(html, /\.\.\/\.\.\/guide\/classic08-getting-started\//)
  assert.match(html, /\.\.\/\.\.\/deck-guide\/deck\//)
  assert.equal((html.match(/<li>/g) ?? []).length, 3)
  assert.equal(renderStaticPageGuideLinks([], '../../'), '')
})

test('制限資料のカード名を安全に表示し、未収録カードへリンクを作らない', () => {
  const html = renderGrowthPage({ ...guide, slug: 'classic08-restrictions' }, {
    ...context,
    rules: {
      classic05Pool: '05の範囲 <比較>', classic08Pool: '08の範囲', cardCount: 2,
      restrictions: {
        meta: { asOf: '2026-09-06' },
        banned: [{ id: null, name: '<script>未収録</script>' }],
        restricted: [{ id: 'card-1', name: '関連カード' }],
        helper: [{ id: null, name: 'お助け候補' }], helperPickLimit: 1,
        bannedCombos: [{ cards: [{ id: 'card-1', name: '関連カード' }, { id: null, name: '未収録' }] }],
      },
    },
  })
  assert.match(html, /05の範囲 &lt;比較&gt;/)
  assert.match(html, /使用禁止：1種/)
  assert.match(html, /お助けカード（以下から合計1枚まで）/)
  assert.match(html, /同時投入禁止：1組/)
  assert.match(html, /&lt;script&gt;未収録&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>未収録|card\/null/)
  assert.match(html, /href="\.\.\/\.\.\/regulations.html"/)
})
