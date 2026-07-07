// src/chat/checkpoint.test.ts
// スクレイプのチェックポイント純ロジック（src/scraper/checkpoint.ts）の検証。
// test:chat の glob(src/chat/*.test.ts)で回るよう、recipe-match.test.ts と同じくここに置く。
// ネットワークは介在しない（保存＝行の直列化、再開＝行のパース）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeRecord, parseCheckpoint, resumeState, shouldSafeStop, type CheckpointRecord } from '../scraper/checkpoint.js'

test('serializeRecord: 1行(末尾改行付き)でparseと往復する', () => {
  const rec: CheckpointRecord = { url: 'https://x/1', status: 'collected', recipe: { id: 'rcp-1' } }
  const line = serializeRecord(rec)
  assert.ok(line.endsWith('\n'), '末尾に改行')
  assert.equal(line.indexOf('\n'), line.length - 1, '改行は末尾の1つだけ')
  const back = parseCheckpoint(line)
  assert.deepEqual(back, [rec])
})

test('parseCheckpoint: 空行は無視する', () => {
  const jsonl = '\n' + serializeRecord({ url: 'a', status: 'failed' }) + '\n\n' + serializeRecord({ url: 'b', status: 'empty' }) + '\n'
  const recs = parseCheckpoint(jsonl)
  assert.equal(recs.length, 2)
  assert.deepEqual(recs.map(r => r.url), ['a', 'b'])
})

test('parseCheckpoint: 末尾の途中切れ行を許容し完全な行のみ返す（truncated耐性）', () => {
  const good = serializeRecord({ url: 'a', status: 'collected', recipe: { id: 'rcp-1' } })
    + serializeRecord({ url: 'b', status: 'empty' })
  // クラッシュで最後の行が途中まで書かれた状態
  const truncated = good + '{"url":"c","status":"colle'
  const recs = parseCheckpoint(truncated)
  assert.equal(recs.length, 2)
  assert.deepEqual(recs.map(r => r.url), ['a', 'b'])
})

test('parseCheckpoint: url を持たない/壊れた行は捨てる', () => {
  const jsonl = serializeRecord({ url: 'a', status: 'failed' })
    + '{"status":"collected"}\n'  // url なし
    + 'not json at all\n'
    + serializeRecord({ url: 'b', status: 'collected', recipe: { id: 'rcp-2' } })
  const recs = parseCheckpoint(jsonl)
  assert.deepEqual(recs.map(r => r.url), ['a', 'b'])
})

test('resumeState: 収集/空は再開でスキップ、失敗は再試行対象（processedに含めない）', () => {
  const recs: CheckpointRecord[] = [
    { url: 'a', status: 'collected', recipe: { id: 'rcp-1' } },
    { url: 'b', status: 'empty' },
    { url: 'c', status: 'failed' },
  ]
  const { processed, recipes } = resumeState(recs)
  assert.ok(processed.has('a') && processed.has('b'), '収集/空はスキップ')
  assert.ok(!processed.has('c'), '失敗は再試行のためスキップしない')
  assert.deepEqual(recipes, [{ id: 'rcp-1' }], '収集レシピのみ復元')
})

test('resumeState: 同一URLは後勝ち（失敗後に収集できたら収集を採用）', () => {
  const recs: CheckpointRecord[] = [
    { url: 'a', status: 'failed' },
    { url: 'a', status: 'collected', recipe: { id: 'rcp-9' } },
  ]
  const { processed, recipes } = resumeState(recs)
  assert.ok(processed.has('a'), '最終状態が収集ならスキップ')
  assert.deepEqual(recipes, [{ id: 'rcp-9' }])
})

test('shouldSafeStop: 連続失敗が上限(既定20)以上で停止', () => {
  assert.equal(shouldSafeStop(19), false)
  assert.equal(shouldSafeStop(20), true)
  assert.equal(shouldSafeStop(21), true)
  assert.equal(shouldSafeStop(2, 3), false)
  assert.equal(shouldSafeStop(3, 3), true)
})
