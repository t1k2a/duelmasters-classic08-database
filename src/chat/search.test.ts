// src/chat/search.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { webSearch, searchEnabled } from './search.js'

function tavilyResponse(results: object[], answer?: string): Response {
  return new Response(JSON.stringify({ results, answer }), { status: 200, headers: { 'content-type': 'application/json' } })
}

// fetch 呼び出しの url / パース済みボディを記録し、キューされた Response を順に返すモック。
function recordingFetch(responses: Response[]) {
  const calls: { url: string; body: any }[] = []
  const impl = async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return responses[calls.length - 1] ?? responses[responses.length - 1]!
  }
  return { impl, calls }
}

test('Tavilyの要約(answer)を context 先頭に入れる', async () => {
  const fake = async () => tavilyResponse(
    [{ title: 'T', url: 'https://example.com/a', content: '本文' }],
    'これは検索要約です',
  )
  const r = await webSearch('x', { apiKey: 'k', fetchImpl: fake as any })
  assert.ok(r)
  assert.match(r!.context, /^検索エンジンによる要約:\nこれは検索要約です/)
})

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

test('DM関連語が無い質問はクエリ先頭に「デュエル・マスターズ」を付与', async () => {
  const { impl, calls } = recordingFetch([tavilyResponse([{ title: 'T', url: 'https://dmwiki.net/x', content: '本文' }])])
  await webSearch('イラストレーターは？', { apiKey: 'k', fetchImpl: impl as any })
  assert.equal(calls[0]!.body.query, 'デュエル・マスターズ イラストレーターは？')
})

test('DM関連語を含む質問はクエリを変更しない', async () => {
  const { impl, calls } = recordingFetch([tavilyResponse([{ title: 'T', url: 'https://dmwiki.net/x', content: '本文' }])])
  await webSearch('デュエマの殿堂は？', { apiKey: 'k', fetchImpl: impl as any })
  assert.equal(calls[0]!.body.query, 'デュエマの殿堂は？')
})

test('信頼ドメイン検索が0件なら include_domains なしで再検索し結果を返す', async () => {
  const { impl, calls } = recordingFetch([
    tavilyResponse([]), // 一段目（信頼ドメイン絞り込み）ヒットなし
    tavilyResponse([{ title: 'T', url: 'https://example.com/a', content: '本文' }]), // 二段目
  ])
  const r = await webSearch('イラストレーターは？', { apiKey: 'k', fetchImpl: impl as any })
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0]!.body.include_domains, ['dmwiki.net', 'dm.takaratomy.co.jp'])
  assert.equal('include_domains' in calls[1]!.body, false)
  assert.ok(r)
  assert.equal(r!.sources[0]!.url, 'https://example.com/a')
})

test('信頼ドメインでヒットしたら二段目検索は呼ばない', async () => {
  const { impl, calls } = recordingFetch([tavilyResponse([{ title: 'T', url: 'https://dmwiki.net/x', content: '本文' }])])
  const r = await webSearch('イラストレーターは？', { apiKey: 'k', fetchImpl: impl as any })
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0]!.body.include_domains, ['dmwiki.net', 'dm.takaratomy.co.jp'])
  assert.ok(r)
})

test('SEARCH_INCLUDE_DOMAINS で信頼ドメインを上書きできる', async () => {
  const prev = process.env['SEARCH_INCLUDE_DOMAINS']
  process.env['SEARCH_INCLUDE_DOMAINS'] = 'foo.example, bar.example'
  try {
    const { impl, calls } = recordingFetch([tavilyResponse([{ title: 'T', url: 'https://foo.example/x', content: '本文' }])])
    await webSearch('イラストレーターは？', { apiKey: 'k', fetchImpl: impl as any })
    assert.deepEqual(calls[0]!.body.include_domains, ['foo.example', 'bar.example'])
  } finally {
    if (prev === undefined) delete process.env['SEARCH_INCLUDE_DOMAINS']
    else process.env['SEARCH_INCLUDE_DOMAINS'] = prev
  }
})
