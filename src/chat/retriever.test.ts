// src/chat/retriever.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCorpus } from './corpus.js'
import { retrieve } from './retriever.js'

test('カード名を含む質問でそのカードを抽出', async () => {
  const c = await loadCorpus()
  const r = retrieve(c, 'ボルメテウス・ホワイト・ドラゴンの能力は？')
  assert.ok(r.cards.some(x => x.name.includes('ボルメテウス')), '該当カード抽出')
})

test('用語質問でknowledgeを抽出', async () => {
  const c = await loadCorpus()
  const r = retrieve(c, 'ブロッカーって何？')
  assert.ok(r.knowledge.some(k => k.includes('ブロッカー')), '知識抽出')
})

test('DB外の語では空に近い結果', async () => {
  const c = await loadCorpus()
  const r = retrieve(c, '令和の最新カードについて')
  assert.equal(r.cards.length, 0)
})

test('アーキタイプ主要語（天門）でmetaまたはキーカードを抽出', async () => {
  const c = await loadCorpus()
  const r = retrieve(c, '天門デッキを組みたい')
  assert.ok(r.meta.length > 0 || r.cards.length > 0, 'meta/cardsいずれか非空')
  // S1: ヒットしたmetaのキーカードがcardsに昇格していること
  assert.ok(r.cards.length > 0, 'キーカード昇格')
})

test('用語の主要語（殿堂）で knowledge を抽出', async () => {
  const c = await loadCorpus()
  const r = retrieve(c, '殿堂って何？')
  assert.ok(r.knowledge.some(k => k.includes('殿堂')), '殿堂レギュレーション抽出')
})
