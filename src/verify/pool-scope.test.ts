// src/verify/pool-scope.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  archiveYear,
  unresolvedNames,
  buildDateProvenNames,
  classifyRecipe,
  classifyAll,
  buildScopeContext,
  SCOPE_CUTOFF_YEAR,
  type PoolScopeRecipe,
} from './pool-scope.js'

const CARDS = [
  { id: 'dm01-052', name: 'アクア・ハルカス' },
  { id: 'dm04-010', name: '雷鳴の守護者ミスト・リエス' },
  { id: 'dmc38-001', name: '無双竜機ボルバルザーク（むそうりゅうきぼるばるざーく）' },
]

function recipe(id: string, year: number, note: string): PoolScopeRecipe {
  return {
    id,
    source: { url: `https://web.archive.org/web/${year}0401000000/http://example.com/${id}` },
    validationNote: note,
  }
}

// --- 層0: アーカイブ年の取り出し -------------------------------------------

test('archiveYear: web.archive.org のスナップショット年を取り出す', () => {
  assert.equal(archiveYear('https://web.archive.org/web/20080415123456/http://x/y'), 2008)
  assert.equal(archiveYear('https://web.archive.org/web/2012id_/http://x/y'), 2012)
})

test('archiveYear: アーカイブURLでなければ null（黙って年を捏造しない）', () => {
  assert.equal(archiveYear('http://dmvault.ath.cx/deck/1234'), null)
  assert.equal(archiveYear(''), null)
})

// --- 層1: cards.json 照合 ---------------------------------------------------

test('unresolvedNames: cards.json に厳密一致する名前は解決済みとして除外する', () => {
  const ctx = buildScopeContext(CARDS, {}, {})
  assert.deepEqual(unresolvedNames(recipe('r1', 2012, 'Unmatched cards: アクア・ハルカス(4)'), ctx), [])
})

test('unresolvedNames: canonicalCardName で吸収できる表記ゆれも解決済みとする', () => {
  const ctx = buildScopeContext(CARDS, {}, {})
  // 読み仮名括弧の有無・カタカナ/ひらがな差は canonicalCardName が吸収する
  const r = recipe('r2', 2012, 'Unmatched cards: 無双竜機ボルバルザーク(1), 雷鳴の守護者ミストリエス(2)')
  assert.deepEqual(unresolvedNames(r, ctx), [])
})

test('unresolvedNames: 未知の名前だけが残る', () => {
  const ctx = buildScopeContext(CARDS, {}, {})
  const r = recipe('r3', 2012, 'Unmatched cards: アクア・ハルカス(4), 超銀河弾 HELL(1)')
  assert.deepEqual(unresolvedNames(r, ctx), ['超銀河弾 HELL'])
})

// --- 層2: アーカイブ日付による上限論法 --------------------------------------

test('buildDateProvenNames: 2008年以前のスナップショットに出た未マッチ名はスコープ内と証明される', () => {
  const ctx = buildScopeContext(CARDS, {}, {})
  const proven = buildDateProvenNames(
    [recipe('r1', 2007, 'Unmatched cards: 謎のカードA(1)'), recipe('r2', 2012, 'Unmatched cards: 謎のカードB(1)')],
    ctx
  )
  assert.equal(proven.has(ctx.canon('謎のカードA')), true)
  assert.equal(proven.has(ctx.canon('謎のカードB')), false)
})

test('buildDateProvenNames: cards.json で解決できる名前は証明対象に含めない', () => {
  const ctx = buildScopeContext(CARDS, {}, {})
  const proven = buildDateProvenNames([recipe('r1', 2007, 'Unmatched cards: アクア・ハルカス(1)')], ctx)
  assert.equal(proven.size, 0)
})

// --- 層3: プール外インデックス ----------------------------------------------

test('classifyRecipe: 2008年以前のスナップショットは無条件で IN', () => {
  const ctx = buildScopeContext(CARDS, { '超銀河弾 HELL': 'DM31' }, {})
  const r = recipe('r1', SCOPE_CUTOFF_YEAR, 'Unmatched cards: 超銀河弾 HELL(1)')
  assert.equal(classifyRecipe(r, ctx, new Set()).klass, 'IN')
})

test('classifyRecipe: 未解決名が無ければ IN', () => {
  const ctx = buildScopeContext(CARDS, {}, {})
  assert.equal(classifyRecipe(recipe('r1', 2012, ''), ctx, new Set()).klass, 'IN')
})

test('classifyRecipe: strong インデックスに当たれば OUT_STRONG（根拠セットを保持する）', () => {
  const ctx = buildScopeContext(CARDS, { '超銀河弾 HELL': 'DM31' }, {})
  const res = classifyRecipe(recipe('r1', 2012, 'Unmatched cards: 超銀河弾 HELL(1)'), ctx, new Set())
  assert.equal(res.klass, 'OUT_STRONG')
  assert.deepEqual(res.evidence, [{ name: '超銀河弾 HELL', set: 'DM31' }])
})

test('classifyRecipe: weak インデックスにしか当たらなければ OUT_WEAK', () => {
  const ctx = buildScopeContext(CARDS, {}, { 'ボルバルザーク・紫電・ドラゴン': 'DMC47' })
  const res = classifyRecipe(recipe('r1', 2012, 'Unmatched cards: ボルバルザーク・紫電・ドラゴン(1)'), ctx, new Set())
  assert.equal(res.klass, 'OUT_WEAK')
  assert.deepEqual(res.evidence, [{ name: 'ボルバルザーク・紫電・ドラゴン', set: 'DMC47' }])
})

test('classifyRecipe: strong と weak の両方に当たれば strong を優先する', () => {
  const ctx = buildScopeContext(CARDS, { 'X': 'DM33' }, { 'X': 'DMC50' })
  assert.equal(classifyRecipe(recipe('r1', 2012, 'Unmatched cards: X(1)'), ctx, new Set()).klass, 'OUT_STRONG')
})

test('classifyRecipe: 日付証明された名前は weak インデックスより優先される（再録の可能性があるため）', () => {
  const ctx = buildScopeContext(CARDS, {}, { '聖霊王アルカディアス': 'DMC47' })
  const proven = new Set([ctx.canon('聖霊王アルカディアス')])
  assert.equal(classifyRecipe(recipe('r1', 2012, 'Unmatched cards: 聖霊王アルカディアス(1)'), ctx, proven).klass, 'IN')
})

test('classifyRecipe: 日付証明は strong インデックスより優先される', () => {
  const ctx = buildScopeContext(CARDS, { 'Y': 'DM31' }, {})
  const proven = new Set([ctx.canon('Y')])
  assert.equal(classifyRecipe(recipe('r1', 2012, 'Unmatched cards: Y(1)'), ctx, proven).klass, 'IN')
})

test('classifyRecipe: どのインデックスにも当たらない未解決名が残れば UNDECIDED', () => {
  const ctx = buildScopeContext(CARDS, {}, {})
  const res = classifyRecipe(recipe('r1', 2012, 'Unmatched cards: 得体の知れないカード(1)'), ctx, new Set())
  assert.equal(res.klass, 'UNDECIDED')
  assert.deepEqual(res.unresolved, ['得体の知れないカード'])
})

// --- 集計 -------------------------------------------------------------------

test('classifyAll: 4分類の合計は必ず入力件数と一致する（取りこぼしを作らない）', () => {
  const ctx = buildScopeContext(CARDS, { 'S1': 'DM31' }, { 'W1': 'DMC47' })
  const recipes = [
    recipe('a', 2007, 'Unmatched cards: 謎(1)'), // IN（日付）
    recipe('b', 2012, 'Unmatched cards: アクア・ハルカス(1)'), // IN（照合）
    recipe('c', 2012, 'Unmatched cards: S1(1)'), // OUT_STRONG
    recipe('d', 2012, 'Unmatched cards: W1(1)'), // OUT_WEAK
    recipe('e', 2012, 'Unmatched cards: ZZZ(1)'), // UNDECIDED
  ]
  const result = classifyAll(recipes, ctx)
  assert.deepEqual(result.counts, { IN: 2, OUT_STRONG: 1, OUT_WEAK: 1, UNDECIDED: 1 })
  assert.equal(result.counts.IN + result.counts.OUT_STRONG + result.counts.OUT_WEAK + result.counts.UNDECIDED, recipes.length)
  assert.equal(result.results.length, recipes.length)
})

test('classifyAll: アーカイブ年を取り出せないレシピは数え上げて表面化させる（サイレント成功を作らない）', () => {
  const ctx = buildScopeContext(CARDS, {}, {})
  const r: PoolScopeRecipe = {
    id: 'x',
    source: { url: 'http://dmvault.ath.cx/deck/1' },
    validationNote: 'Unmatched cards: ZZZ(1)',
  }
  const result = classifyAll([r], ctx)
  assert.deepEqual(result.unknownYearIds, ['x'])
  // 年が不明なら ≤2008 の免除は使えないので、未解決名の判定に落ちる
  assert.equal(result.results[0]!.klass, 'UNDECIDED')
})

test('classifyAll: poolStatus は OUT_STRONG/OUT_WEAK をまとめて "out" にする', () => {
  const ctx = buildScopeContext(CARDS, { 'S1': 'DM31' }, { 'W1': 'DMC47' })
  const result = classifyAll(
    [
      recipe('b', 2012, ''),
      recipe('c', 2012, 'Unmatched cards: S1(1)'),
      recipe('d', 2012, 'Unmatched cards: W1(1)'),
      recipe('e', 2012, 'Unmatched cards: ZZZ(1)'),
    ],
    ctx
  )
  assert.deepEqual(result.results.map(r => r.poolStatus), ['in', 'out', 'out', 'undecided'])
})
