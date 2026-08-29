// src/chat/deck.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCorpus } from './corpus.js'
import type { Corpus } from './corpus.js'
import { retrieve } from './retriever.js'
import { detectDeckIntent, selectDeck } from './deck.js'
import type { CardData, RecipeData, RetrievalResult } from './types.js'

function card(id: string, name: string, cost = 3, civ: string[] = ['光']): CardData {
  return { id, name, cardType: 'クリーチャー', cost, power: 1000, civilizations: civ, races: [], rarity: null, text: null, printings: [] }
}
function recipe(id: string, opts: { validated?: boolean; total?: number; name?: string; civ?: string[] }): RecipeData {
  const total = opts.total ?? 40
  const cards = [{ id: 'c1', count: Math.min(total, 4) }]
  let rest = total - Math.min(total, 4)
  let n = 0
  while (rest > 0) { const c = Math.min(rest, 4); cards.push({ id: `f${n++}`, count: c }); rest -= c }
  return { id, name: opts.name ?? id, cards, validated: opts.validated, civilizations: opts.civ ?? ['光'] } as RecipeData
}
function makeCorpus(recipes: RecipeData[]): Corpus {
  const cards = [card('c1', 'ザボルグ')]
  return { cards, recipes, meta: [], knowledge: [], cardById: new Map(cards.map(c => [c.id, c])) }
}
const EMPTY_RETRIEVAL: RetrievalResult = { cards: [], recipes: [], meta: [], knowledge: [] }
const THEME_Q = 'ザボルグのデッキ組んで'

test('detectDeckIntent: デッキ構築系プロンプトを検出する', () => {
  for (const q of [
    'デッキ組んで',
    'デッキを組んで',
    'デッキ作って',
    'デッキ教えて',
    'デッキ構築して',
    'デッキが欲しい',
    'デッキ組みたい',
    'ボルメテウスのデッキ組んで',
    '白単ビートのデッキを考えて',
    '白単ビート組んで',
    'おすすめのデッキ提案して',
    'ボルコンのテンプレ教えて',
    'ドロマー天門の構築案',
    '赤緑速攻のおすすめレシピ',
    'デッキのレシピを共有して',
  ]) {
    assert.equal(detectDeckIntent(q), true, `should be true: ${q}`)
  }
})

test('detectDeckIntent: 単発カード質問は誤検出しない', () => {
  for (const q of [
    '《ボルメテウス・ホワイト・ドラゴン》のコストは？',
    'ボルメテウスってどんなカード？',
    'ブロッカーって何？',
    '殿堂レギュレーションについて教えて',
    'クラシック08とは？',
  ]) {
    assert.equal(detectDeckIntent(q), false, `should be false: ${q}`)
  }
})

test('detectDeckIntent: 情報系質問（とは/コツ/違い等）は誤検出しない', () => {
  for (const q of [
    '構築済みデッキとは何ですか？',
    'デッキ構築のコツは？',
    'コンボを組み合わせると？',
    'ビートダウンとコントロールの違いは？',
    'デッキ構築の方法について教えて',
  ]) {
    assert.equal(detectDeckIntent(q), false, `should be false: ${q}`)
  }
})

test('detectDeckIntent: 履歴付きの文脈依存レシピ要求を検出する', () => {
  const history = [
    { role: 'user' as const, content: 'ブロッカーを主体としたデッキは？' },
    { role: 'assistant' as const, content: 'ヘブンズ・ゲートを活用した天門デッキなどがあります。' }
  ]
  assert.equal(detectDeckIntent('レシピを共有して', history), true)
  assert.equal(detectDeckIntent('リスト見せて', history), true)
})

test('selectDeck: 3色カラー名（ドロマー / ネクラ / クローシス）を考慮して選定', async () => {
  const c = await loadCorpus()
  const dromarRes = selectDeck(c, 'ドロマー天門のデッキ組んで', { cards: [], recipes: [], meta: [], knowledge: [] })
  if (dromarRes) {
    assert.equal(dromarRes.recipe.validated, true)
  }

  const bolconRes = selectDeck(c, 'ボルコンのテンプレ教えて', { cards: [], recipes: [], meta: [], knowledge: [] })
  assert.ok(bolconRes != null, 'ボルコンレシピが選定されること')
})

test('selectDeck: 会話履歴からテーマ（天門/ブロッカー）を解決して40枚レシピを選定', async () => {
  const c = await loadCorpus()
  const history = [
    { role: 'user' as const, content: 'ブロッカーを主体としたデッキは？' },
    { role: 'assistant' as const, content: 'ヘブンズ・ゲートを活用した天門デッキなどがあります。' }
  ]
  const retrieval = retrieve(c, 'デッキのレシピを共有して', history)
  const res = selectDeck(c, 'デッキのレシピを共有して', retrieval, history)
  assert.ok(res != null, 'デッキレシピが選定されること')
  assert.equal(res.recipe.validated, true, 'validatedなレシピであること')
  assert.ok(
    (res.recipe.name ?? '').includes('天門') || (res.recipe.name ?? '').includes('ヘブンズ') || (res.recipe.archetype === 'ヘブンズゲート') || (res.recipe.name ?? '').includes('ブロッカー') || (res.recipe.name ?? '').includes('ガーディアン'),
    'ブロッカー/天門系のレシピが選ばれること'
  )
})