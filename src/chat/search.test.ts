// src/chat/search.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { webSearch, searchEnabled } from './search.js'

function tavilyResponse(results: object[]): Response {
  return new Response(JSON.stringify({ results }), { status: 200, headers: { 'content-type': 'application/json' } })
}

test('Tavily結果から sources と context を組み立てる', async () => {
  const fake = async () => tavilyResponse([
    { title: 'ジョリー・ザ・ジョニー', url: 'https://example.com/a', content: '能力の説明' },
    { title: '別ページ', url: 'https://example.com/b', content: '補足' },
  ])
  const r = await webSearch('ジョリー・ザ・ジョニー', { apiKey: 'k', fetchImpl: fake as any })
  assert.ok(r)
  assert.equal(r!.sources.length, 2)
  assert.equal(r!.sources[0]!.url, 'https://example.com/a')
  assert.match(r!.context, /能力の説明/)
  assert.match(r!.context, /出典: https:\/\/example\.com\/a/)
})

test('APIキー未設定なら null（呼び出し側はDB回答へフォールバック）', async () => {
  assert.equal(searchEnabled(''), false)
  const r = await webSearch('x', { apiKey: '' })
  assert.equal(r, null)
})

test('検索結果が空なら null', async () => {
  const fake = async () => tavilyResponse([])
  const r = await webSearch('x', { apiKey: 'k', fetchImpl: fake as any })
  assert.equal(r, null)
})

test('HTTPエラー時は null', async () => {
  const fake = async () => new Response('err', { status: 500 })
  const r = await webSearch('x', { apiKey: 'k', fetchImpl: fake as any })
  assert.equal(r, null)
})
