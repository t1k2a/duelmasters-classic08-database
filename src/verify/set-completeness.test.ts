// src/verify/set-completeness.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parsePackNumber,
  checkCompleteness,
  findEmptySets,
  expectedSeriesFor,
  EXPECTED_SERIES_BY_SET,
} from './set-completeness.js'

test('parsePackNumber: 通常枠 "1/110" を分子・分母に分解する', () => {
  assert.deepEqual(parsePackNumber('1/110'), { series: '', index: 1, total: 110 })
})

test('parsePackNumber: SR枠は大文字/小文字どちらの表記でも同じ系列として扱う', () => {
  assert.deepEqual(parsePackNumber('S1/S5'), { series: 'S', index: 1, total: 5 })
  assert.deepEqual(parsePackNumber('s6/s10'), { series: 'S', index: 6, total: 10 })
})

test('parsePackNumber: 空文字や解釈不能な値は null', () => {
  assert.equal(parsePackNumber(''), null)
  assert.equal(parsePackNumber('SEC001'), null)
})

test('checkCompleteness: 分母どおり揃っていれば complete', () => {
  const { reports } = checkCompleteness([
    { setCode: 'DM-29', cardNumber: 's1/s5' },
    { setCode: 'DM-29', cardNumber: 's2/s5' },
    { setCode: 'DM-29', cardNumber: 's3/s5' },
    { setCode: 'DM-29', cardNumber: 's4/s5' },
    { setCode: 'DM-29', cardNumber: 's5/s5' },
  ])
  assert.equal(reports.length, 1)
  assert.equal(reports[0]!.complete, true)
  assert.equal(reports[0]!.expected, 5)
  assert.equal(reports[0]!.actual, 5)
  assert.deepEqual(reports[0]!.missing, [])
})

test('checkCompleteness: 途中で中断したセットは欠番付きで incomplete になる', () => {
  // 系列内の欠番パターン。系列が丸ごと0件のケースは absent のテストで別途担保する
  const { reports } = checkCompleteness([
    { setCode: 'DM-28', cardNumber: 's1/s10' },
    { setCode: 'DM-28', cardNumber: 's2/s10' },
    { setCode: 'DM-28', cardNumber: 's4/s10' },
  ])
  const sr = reports.find(r => r.series === 'S')!
  assert.equal(sr.complete, false)
  assert.equal(sr.expected, 10)
  assert.equal(sr.actual, 3)
  assert.deepEqual(sr.missing, [3, 5, 6, 7, 8, 9, 10])
})

test('checkCompleteness: 通常枠とSR枠は別系列として集計する', () => {
  const { reports } = checkCompleteness([
    { setCode: 'DM-27', cardNumber: '1/2' },
    { setCode: 'DM-27', cardNumber: '2/2' },
    { setCode: 'DM-27', cardNumber: 'S1/S5' },
  ])
  assert.equal(reports.length, 2)
  assert.equal(reports.find(r => r.series === '')!.complete, true)
  assert.equal(reports.find(r => r.series === 'S')!.complete, false)
})

test('findEmptySets: 1件も取得できていないセットを検出する（0件を「OK」にしない）', () => {
  // セットのディレクトリごと存在しないケースは「検査対象0件＝合格」になりがちで、
  // 中断の見逃しそのものなので明示的に落とす
  const empty = findEmptySets(['DM-27', 'DM-28', 'DM-29'], [
    { setCode: 'DM-27', cardNumber: '1/55' },
    { setCode: 'DM-29', cardNumber: '1/55' },
  ])
  assert.deepEqual(empty, ['DM-28'])
})

test('checkCompleteness: 系列が丸ごと欠けているセットを absent として検出する', () => {
  // 実際に起きた不具合: DM-27 の通常枠55枚は取れたが S枠が0件。観測データからしか
  // 系列グループを作らないと S枠のグループ自体が生まれず、欠落が素通りしていた
  const { reports } = checkCompleteness(
    Array.from({ length: 55 }, (_v, i) => ({ setCode: 'DM-27', cardNumber: `${i + 1}/55` })),
    expectedSeriesFor(['DM-27'])
  )
  const sr = reports.find(r => r.series === 'S')!
  assert.equal(sr.absent, true)
  assert.equal(sr.complete, false)
  assert.equal(reports.find(r => r.series === '')!.complete, true)
})

test('checkCompleteness: 期待系列がすべて揃っていれば absent は立たない', () => {
  const { reports } = checkCompleteness(
    [
      ...Array.from({ length: 55 }, (_v, i) => ({ setCode: 'DM-27', cardNumber: `${i + 1}/55` })),
      ...Array.from({ length: 5 }, (_v, i) => ({ setCode: 'DM-27', cardNumber: `S${i + 1}/S5` })),
    ],
    expectedSeriesFor(['DM-27'])
  )
  assert.equal(reports.length, 2)
  assert.ok(reports.every(r => r.complete && !r.absent))
})

test('EXPECTED_SERIES_BY_SET: DM-01〜DM-30 すべてが通常枠とS枠を持つ', () => {
  // 件数だけの検証では「DM-30 が欠落し別キーが混入」を見逃し、
  // そのセットのS系列欠落を事前登録できなくなる。キー集合そのものを比較する
  const expectedSetCodes = Array.from({ length: 30 }, (_v, i) => `DM-${String(i + 1).padStart(2, '0')}`)
  assert.deepEqual(Object.keys(EXPECTED_SERIES_BY_SET).sort(), expectedSetCodes)
  assert.ok(expectedSetCodes.every(s => EXPECTED_SERIES_BY_SET[s]!.includes('') && EXPECTED_SERIES_BY_SET[s]!.includes('S')))
})

test('checkCompleteness: cardNumber が空のものは unparsable として必ず表面化する', () => {
  const { unparsable } = checkCompleteness([
    { setCode: 'DM-28', cardNumber: '' },
    { setCode: 'DM-28', cardNumber: '1/1' },
  ])
  assert.equal(unparsable.length, 1)
  assert.equal(unparsable[0]!.setCode, 'DM-28')
})
