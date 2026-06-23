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
