import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkDeckLegality, DeckEntry } from './deck-legality.js'
import { RestrictionList } from './restrictions.js'

// テスト用の最小 RestrictionList。名前ベースで判定するため id は適当でよい。
function makeList(overrides: Partial<RestrictionList> = {}): RestrictionList {
  return {
    meta: {},
    banned: [{ name: '無双竜機ボルバルザーク', id: 'dm10-009' }],
    restricted: [{ name: '予言者マリエル', id: 'dm08-008' }],
    helper: [
      { name: '母なる大地', id: 'dm10-036' },
      { name: 'アクアン', id: 'dm04-010' },
    ],
    helperPickLimit: 1,
    bannedCombos: [
      {
        cards: [
          { name: '母なる大地', id: 'dm10-036' },
          { name: '龍仙ロマネスク', id: 'dm25-s04' },
        ],
      },
    ],
    ...overrides,
  }
}

// 40枚ちょうど・違反なしのフィラーカードでデッキを埋める
function fillerEntries(n: number, excludeNames: Set<string> = new Set()): DeckEntry[] {
  const entries: DeckEntry[] = []
  let total = 0
  let i = 0
  while (total < n) {
    const name = `フィラー${i}`
    if (excludeNames.has(name)) { i++; continue }
    const count = Math.min(4, n - total)
    entries.push({ id: `filler-${i}`, name, count })
    total += count
    i++
  }
  return entries
}

test('正常系: 40枚・違反なしなら legal:true', () => {
  const deck = fillerEntries(40)
  const result = checkDeckLegality(deck, makeList())
  assert.equal(result.legal, true)
  assert.deepEqual(result.violations, [])
})

test('使用禁止カードが1枚でも入っていれば違反', () => {
  const deck = [
    { id: 'dm10-009', name: '無双竜機ボルバルザーク', count: 1 },
    ...fillerEntries(39),
  ]
  const result = checkDeckLegality(deck, makeList())
  assert.equal(result.legal, false)
  const v = result.violations.find(v => v.type === 'banned')
  assert.ok(v, '禁止カード違反が検出されること')
  assert.match(v!.message, /無双竜機ボルバルザーク/)
})

test('制限カードが2枚以上入っていれば違反', () => {
  const deck = [
    { id: 'dm08-008', name: '予言者マリエル', count: 2 },
    ...fillerEntries(38),
  ]
  const result = checkDeckLegality(deck, makeList())
  assert.equal(result.legal, false)
  const v = result.violations.find(v => v.type === 'restricted')
  assert.ok(v, '制限カード超過違反が検出されること')
  assert.match(v!.message, /予言者マリエル/)
})

test('お助け枠は別カードでも合計枚数で超過を検出する', () => {
  const deck = [
    { id: 'dm10-036', name: '母なる大地', count: 1 },
    { id: 'dm04-010', name: 'アクアン', count: 1 },
    ...fillerEntries(38),
  ]
  const result = checkDeckLegality(deck, makeList())
  assert.equal(result.legal, false)
  const v = result.violations.find(v => v.type === 'helper-limit')
  assert.ok(v, 'お助け枠合計超過違反が検出されること')
  assert.match(v!.message, /2種のうち合計1枚/)
  assert.match(v!.message, /母なる大地/)
  assert.match(v!.message, /アクアン/)
})

test('禁止コンビの同時投入は違反', () => {
  const deck = [
    { id: 'dm10-036', name: '母なる大地', count: 1 },
    { id: 'dm25-s04', name: '龍仙ロマネスク', count: 1 },
    ...fillerEntries(38),
  ]
  const result = checkDeckLegality(deck, makeList())
  assert.equal(result.legal, false)
  const v = result.violations.find(v => v.type === 'banned-combo')
  assert.ok(v, '禁止コンビ違反が検出されること')
  assert.match(v!.message, /母なる大地/)
  assert.match(v!.message, /龍仙ロマネスク/)
})

test('40枚未満は違反', () => {
  const deck = fillerEntries(39)
  const result = checkDeckLegality(deck, makeList())
  assert.equal(result.legal, false)
  const v = result.violations.find(v => v.type === 'deck-size')
  assert.ok(v)
  assert.match(v!.message, /39/)
})

test('40枚超過は違反', () => {
  const deck = [{ id: 'over-1', name: 'オーバー', count: 1 }, ...fillerEntries(40)]
  const result = checkDeckLegality(deck, makeList())
  assert.equal(result.legal, false)
  const v = result.violations.find(v => v.type === 'deck-size')
  assert.ok(v)
  assert.match(v!.message, /41/)
})
