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
  findDateProvenStrongConflicts,
  findDateProvenWeakOverlaps,
  ARCHIVE_MIN_YEAR,
  KNOWN_WEAK_OVERLAP,
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

test('archiveYear: 妥当域外の年は null にする（≤2008判定をすり抜けて無条件INになるのを防ぐ）', () => {
  // 実データに現れる壊れたURL。数値としては ≤2008 なので、素通しすると
  // 「日付証明でIN」という最も緩い判定に落ちてしまう（フェイルセーフの向きが逆）
  assert.equal(archiveYear('https://web.archive.org/web/0000/http://x/y'), null)
  assert.equal(archiveYear('https://web.archive.org/web/1969/http://x/y'), null)
  assert.equal(archiveYear(`https://web.archive.org/web/${ARCHIVE_MIN_YEAR - 1}0401/http://x/y`), null)
})

test('archiveYear: 妥当域の境界は通す（1996 と 現在年）', () => {
  assert.equal(archiveYear(`https://web.archive.org/web/${ARCHIVE_MIN_YEAR}0401/http://x/y`), ARCHIVE_MIN_YEAR)
  const thisYear = new Date().getFullYear()
  assert.equal(archiveYear(`https://web.archive.org/web/${thisYear}0401/http://x/y`), thisYear)
})

test('archiveYear: 未来年は null（アーカイブに存在し得ないのでURLの破損とみなす）', () => {
  assert.equal(archiveYear(`https://web.archive.org/web/${new Date().getFullYear() + 1}0401/http://x/y`), null)
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

// --- 層2 と 層3 の矛盾検出（tripwire） --------------------------------------

test('findDateProvenStrongConflicts: 交差が無ければ空（健全な状態）', () => {
  const ctx = buildScopeContext(CARDS, { '超銀河弾 HELL': 'DM31' }, {})
  assert.deepEqual(findDateProvenStrongConflicts(new Set([ctx.canon('謎のカードA')]), ctx), [])
})

test('findDateProvenStrongConflicts: 日付証明済みの名前が strong にもあれば矛盾として返す', () => {
  // ≤2008 のスナップショットに実在するカードが「DM-31以降が初出」と登録されている状態。
  // 索引かデータのどちらかが誤っているので、握りつぶさず表面化させる
  const ctx = buildScopeContext(CARDS, { '超銀河弾 HELL': 'DM31' }, {})
  const conflicts = findDateProvenStrongConflicts(new Set([ctx.canon('超銀河弾 HELL')]), ctx)
  assert.deepEqual(conflicts, [{ name: ctx.canon('超銀河弾 HELL'), set: 'DM31' }])
})

test('findDateProvenWeakOverlaps: 日付証明と weak の交差は「異常」ではなく計測対象として返す', () => {
  // weak（DMC/DMX/DMD）は再録が多く、≤2008 に実在すること自体は矛盾しない。
  // よって失敗にはせず、件数の増加を監視するために返す
  const ctx = buildScopeContext(CARDS, {}, { '聖霊王アルカディアス': 'DMC47', '別のカード': 'DMX01' })
  const overlaps = findDateProvenWeakOverlaps(new Set([ctx.canon('聖霊王アルカディアス')]), ctx)
  assert.deepEqual(overlaps, [{ name: ctx.canon('聖霊王アルカディアス'), set: 'DMC47' }])
})

test('findDateProvenWeakOverlaps: 交差が無ければ空', () => {
  const ctx = buildScopeContext(CARDS, {}, { '聖霊王アルカディアス': 'DMC47' })
  assert.deepEqual(findDateProvenWeakOverlaps(new Set([ctx.canon('無関係')]), ctx), [])
})

test('KNOWN_WEAK_OVERLAP: 既知値は実測の20件（増えたら再録以外の原因を疑う基準）', () => {
  assert.equal(KNOWN_WEAK_OVERLAP, 20)
})

test('classifyAll: strong の矛盾と weak の交差を両方集計して返す', () => {
  const ctx = buildScopeContext(CARDS, { 'S1': 'DM31' }, { 'W1': 'DMC47' })
  // 2007年のスナップショットに S1 と W1 が実在する = 日付証明される
  const result = classifyAll([recipe('a', 2007, 'Unmatched cards: S1(1), W1(1)')], ctx)
  assert.deepEqual(result.dateProvenStrongConflicts, [{ name: ctx.canon('S1'), set: 'DM31' }])
  assert.deepEqual(result.dateProvenWeakOverlaps, [{ name: ctx.canon('W1'), set: 'DMC47' }])
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
