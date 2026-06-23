// src/chat/corpus.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCorpus } from './corpus.js'

test('corpusがカード・知識をロードする', async () => {
  const c = await loadCorpus()
  assert.ok(c.cards.length > 2000, 'カードが2000枚超')
  assert.ok(c.cardById.get('dm01-001'), 'idで引ける')
  assert.ok(c.knowledge.some(k => k.title.includes('ブロッカー')), '知識ロード')
})
