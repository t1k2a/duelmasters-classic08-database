// src/verify/set-completeness.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePackNumber, checkCompleteness, findEmptySets } from './set-completeness.js'

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
  // 今回の不具合の再現: SR枠の取得が始まる前に停止し、s枠が0件のまま静かに通っていた
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

test('checkCompleteness: cardNumber が空のものは unparsable として必ず表面化する', () => {
  const { unparsable } = checkCompleteness([
    { setCode: 'DM-28', cardNumber: '' },
    { setCode: 'DM-28', cardNumber: '1/1' },
  ])
  assert.equal(unparsable.length, 1)
  assert.equal(unparsable[0]!.setCode, 'DM-28')
})
