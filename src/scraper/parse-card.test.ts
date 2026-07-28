// src/scraper/parse-card.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCardNumber } from './parse-card.js'

// 公式カードDBの span.packname は表記に揺れがある:
//   DM-01〜27 … 大文字 "(DM27 S1/S5)"
//   DM-28〜30 … 小文字 "(DM28 s1/s10)"
// 小文字を取りこぼすと DM-28/29/30 のSR枠が cardNumber 空になる。
test('parseCardNumber: 通常枠の連番を取れる', () => {
  assert.equal(parseCardNumber('(DM6 1/110)'), '1/110')
})

test('parseCardNumber: 大文字S のSR枠を取れる', () => {
  assert.equal(parseCardNumber('(DM27 S1/S5)'), 'S1/S5')
})

test('parseCardNumber: 小文字s のSR枠を取れる', () => {
  assert.equal(parseCardNumber('(DM28 s1/s10)'), 's1/s10')
})
