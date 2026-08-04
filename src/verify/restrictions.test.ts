import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRestrictionList, resolveName } from './restrictions.js'

const cards = [
  { id: 'dm10-009', name: '無双竜機ボルバルザーク' },
  { id: 'dm03-001', name: 'サイバー・ブレイン' },
  { id: 'dm13-001', name: '母なる大地' },
  { id: 'dm09-002', name: '龍仙ロマネスク' },
]

const seed = {
  meta: { format: 'テスト', source: 'https://example.test/reg', asOf: '2026-01-01' },
  banned: ['無双竜機ボルバルザーク'],
  restricted: ['サイバー・ブレイン'],
  helper: ['母なる大地'],
  bannedCombos: [['母なる大地', '龍仙ロマネスク']],
  knownMissingFromCardPool: { names: [] as string[] },
}

test('resolveName: カード名から id を引ける', () => {
  assert.equal(resolveName(cards as never, 'サイバー・ブレイン')?.id, 'dm03-001')
})

test('resolveName: 存在しない名前は null', () => {
  assert.equal(resolveName(cards as never, '存在しないカード'), null)
})

test('buildRestrictionList: 各区分が id 付きで解決される', () => {
  const { list } = buildRestrictionList(cards as never, seed as never)
  assert.equal(list.banned[0]!.id, 'dm10-009')
  assert.equal(list.restricted[0]!.id, 'dm03-001')
  assert.equal(list.helper[0]!.id, 'dm13-001')
  assert.equal(list.bannedCombos[0]!.cards[1]!.id, 'dm09-002')
})

test('buildRestrictionList: 未解決かつ既知欠落に無い名前は unexpected として表面化する', () => {
  const s = { ...seed, restricted: ['サイバー・ブレイン', '幻のカード'] }
  const { unexpectedMissing } = buildRestrictionList(cards as never, s as never)
  assert.deepEqual(unexpectedMissing, ['幻のカード'])
})

test('buildRestrictionList: 既知欠落に登録済みなら unexpected にならず id は null になる', () => {
  const s = {
    ...seed,
    restricted: ['サイバー・ブレイン', '幻のカード'],
    knownMissingFromCardPool: { names: ['幻のカード'] },
  }
  const { list, unexpectedMissing } = buildRestrictionList(cards as never, s as never)
  assert.deepEqual(unexpectedMissing, [])
  assert.equal(list.restricted[1]!.id, null)
  assert.equal(list.restricted[1]!.name, '幻のカード')
})

test('buildRestrictionList: 公式殿堂と食い違うカードを差分として報告する', () => {
  const hof = [{ id: 'dm03-001', name: 'サイバー・ブレイン', status: 'プレ殿' }]
  const { divergesFromOfficial } = buildRestrictionList(cards as never, seed as never, hof as never)
  // 公式ではプレ殿(禁止)だが、クラシック08では restricted(1枚まで使える)
  assert.equal(divergesFromOfficial.length, 1)
  assert.equal(divergesFromOfficial[0]!.name, 'サイバー・ブレイン')
  assert.equal(divergesFromOfficial[0]!.official, 'プレ殿')
  assert.equal(divergesFromOfficial[0]!.classic08, 'restricted')
})

test('buildRestrictionList: helper は「12種から1枚」のルールを保持する', () => {
  const { list } = buildRestrictionList(cards as never, seed as never)
  assert.equal(list.helperPickLimit, 1)
})
