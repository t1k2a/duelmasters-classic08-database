// src/chat/scrape-resume.test.ts
// scrape-recipes.ts の resume 復元反映（seedResumedOutput）の回帰テスト。
// test:chat の glob(src/chat/*.test.ts)で回るよう checkpoint.test.ts と同じくここに置く。
// scrape-recipes.ts は entry-guard 済みなので import しても scrape は走らない（ネットワーク非介在）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seedResumedOutput } from '../scraper/scrape-recipes.js'

const rec = (id: string) => ({ id })

test('seedResumedOutput: sample モードは空基点＋復元分（既存は含めない）', () => {
  const out = seedResumedOutput(true, [rec('rcp-0001')], [rec('rcp-0463')])
  assert.deepEqual(out.map(r => r.id), ['rcp-0463'])
})

test('seedResumedOutput: default モードは既存＋復元分（復元分を取りこぼさない）', () => {
  const out = seedResumedOutput(false, [rec('rcp-0001'), rec('rcp-0002')], [rec('rcp-0463')])
  assert.deepEqual(out.map(r => r.id), ['rcp-0001', 'rcp-0002', 'rcp-0463'])
})

test('seedResumedOutput: 復元なしなら従来どおり（default=既存 / sample=空）', () => {
  assert.deepEqual(seedResumedOutput(false, [rec('rcp-0001')], []).map(r => r.id), ['rcp-0001'])
  assert.deepEqual(seedResumedOutput(true, [rec('rcp-0001')], []).map(r => r.id), [])
})

test('seedResumedOutput: 新しい配列を返し、渡した existing を破壊しない', () => {
  const existing = [rec('rcp-0001')]
  const out = seedResumedOutput(false, existing, [rec('rcp-0463')])
  out.push(rec('rcp-9999'))
  assert.equal(existing.length, 1, 'existing は不変')
})
