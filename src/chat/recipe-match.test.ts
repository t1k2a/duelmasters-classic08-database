// src/chat/recipe-match.test.ts
// レシピのカード名照合ロジック（src/scraper/recipe-match.ts）のゴールデンケース。
// test:chat の glob(src/chat/*.test.ts)で回るよう、ここに置いて scraper の純関数を検証する。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalCardName,
  buildMatchIndex,
  matchCardName,
  parseUnmatchedNote,
  rematchRecipe,
} from '../scraper/recipe-match.js'

// cards.json は弾ごとに読み仮名括弧の有無が不統一（DBに括弧付き/無しが混在）。
const CARDS = [
  { id: 'c1', name: '魂と記憶の盾', civilizations: ['光'] }, // DB側は括弧なし
  { id: 'c2', name: '青銅の鎧(ブロンズ・アーム・トライブ)', civilizations: ['自然'] }, // DB側は括弧あり(半角)
  { id: 'c3', name: '龍神ヘヴィ', civilizations: ['火'] },
  { id: 'c4', name: '口寄の化身', civilizations: ['自然'] },
]

test('canonicalCardName: 読み仮名括弧の有無で同一キーになる（全角/半角）', () => {
  assert.equal(canonicalCardName('魂と記憶の盾（エターナル・ガード）'), canonicalCardName('魂と記憶の盾'))
  assert.equal(canonicalCardName('青銅の鎧（ブロンズ・アーム・トライブ）'), canonicalCardName('青銅の鎧(ブロンズ・アーム・トライブ)'))
})

test('matchCardName: DM Vaultの読み仮名括弧付き → DB側の括弧なし名に一致', () => {
  const idx = buildMatchIndex(CARDS)
  assert.equal(matchCardName('魂と記憶の盾（エターナル・ガード）', idx), 'c1')
})

test('matchCardName: 全角括弧のクエリ → DB側の半角括弧付き名に一致', () => {
  const idx = buildMatchIndex(CARDS)
  assert.equal(matchCardName('青銅の鎧（ブロンズ・アーム・トライブ）', idx), 'c2')
})

test('matchCardName: 括弧なしの通常名は従来どおり厳密一致する', () => {
  const idx = buildMatchIndex(CARDS)
  assert.equal(matchCardName('龍神ヘヴィ', idx), 'c3')
})

test('matchCardName: DBに無い名は null（誤マッチしない）', () => {
  const idx = buildMatchIndex(CARDS)
  assert.equal(matchCardName('フレイムバーン・ドラゴン', idx), null)
})

test('parseUnmatchedNote: 括弧を含む名でも末尾の(枚数)だけを枚数として切り出す', () => {
  const parsed = parseUnmatchedNote('Unmatched cards: 魂と記憶の盾（エターナル・ガード）(3), 龍神ヘヴィ(2)')
  assert.deepEqual(parsed, [
    { name: '魂と記憶の盾（エターナル・ガード）', count: 3 },
    { name: '龍神ヘヴィ', count: 2 },
  ])
})

test('parseUnmatchedNote: validated（note空）は空配列', () => {
  assert.deepEqual(parseUnmatchedNote(''), [])
})

test('rematchRecipe: 未マッチが全解決したら validated:true・cards統合・note空・枚数保持', () => {
  const idx = buildMatchIndex(CARDS)
  const recipe = {
    cards: [{ id: 'c3', count: 35 }], // 既存マッチ済み
    civilizations: ['火'],
    validated: false,
    validationNote: 'Unmatched cards: 魂と記憶の盾（エターナル・ガード）(3), 青銅の鎧（ブロンズ・アーム・トライブ）(2)',
  }
  const out = rematchRecipe(recipe, idx)
  assert.equal(out.validated, true)
  assert.equal(out.validationNote, '')
  const total = out.cards.reduce((s, c) => s + c.count, 0)
  assert.equal(total, 40)
  const ids = out.cards.map(c => c.id).sort()
  assert.deepEqual(ids, ['c1', 'c2', 'c3'])
  // civ は全カードから再導出
  assert.deepEqual(out.civilizations, ['光', '火', '自然'].sort())
})

test('rematchRecipe: 未解決が残るレシピは変更しない（validated:false維持）', () => {
  const idx = buildMatchIndex(CARDS)
  const recipe = {
    cards: [{ id: 'c3', count: 38 }],
    civilizations: ['火'],
    validated: false,
    validationNote: 'Unmatched cards: フレイムバーン・ドラゴン(2)',
  }
  const out = rematchRecipe(recipe, idx)
  assert.equal(out.validated, false)
  assert.deepEqual(out.cards, [{ id: 'c3', count: 38 }])
  assert.equal(out.validationNote, 'Unmatched cards: フレイムバーン・ドラゴン(2)')
})

test('rematchRecipe: 既に validated のレシピは素通し', () => {
  const idx = buildMatchIndex(CARDS)
  const recipe = { cards: [{ id: 'c3', count: 40 }], civilizations: ['火'], validated: true, validationNote: '' }
  const out = rematchRecipe(recipe, idx)
  assert.equal(out, recipe)
})
