// src/chat/normalize.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeKana } from './normalize.js'

test('カタカナ→ひらがな・記号除去で同一化', () => {
  assert.equal(normalizeKana('ボルメテウス'), normalizeKana('ぼるめてうす'))
  assert.equal(normalizeKana('ヘブンズ・ゲート'), normalizeKana('へぶんずげーと'))
  assert.equal(normalizeKana('Ｓ・トリガー'), normalizeKana('sとりがー'))
})
