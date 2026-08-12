// src/chat/search.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { webSearch, searchEnabled, isOutOfEraResult, DEFAULT_INCLUDE_DOMAINS } from './search.js'

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
  assert.equal(calls[0]!.body.query, 'デュエル・マスターズ イラストレーターは？ クラシック 2008年以前')
})

test('DM関連語を含む質問は先頭に「デュエル・マスターズ」を付けず、時代限定語のみ末尾に付与', async () => {
  const { impl, calls } = recordingFetch([tavilyResponse([{ title: 'T', url: 'https://dmwiki.net/x', content: '本文' }])])
  await webSearch('デュエマの殿堂は？', { apiKey: 'k', fetchImpl: impl as any })
  assert.equal(calls[0]!.body.query, 'デュエマの殿堂は？ クラシック 2008年以前')
})

test('信頼ドメイン検索が0件なら include_domains なしで再検索し結果を返す', async () => {
  const { impl, calls } = recordingFetch([
    tavilyResponse([]), // 一段目（信頼ドメイン絞り込み）ヒットなし
    tavilyResponse([{ title: 'T', url: 'https://example.com/a', content: '本文' }]), // 二段目
  ])
  const r = await webSearch('イラストレーターは？', { apiKey: 'k', fetchImpl: impl as any })
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0]!.body.include_domains, DEFAULT_INCLUDE_DOMAINS)
  assert.ok(DEFAULT_INCLUDE_DOMAINS.includes('ja.wikipedia.org'))
  assert.equal('include_domains' in calls[1]!.body, false)
  assert.ok(r)
  assert.equal(r!.sources[0]!.url, 'https://example.com/a')
})

test('信頼ドメインでヒットしたら二段目検索は呼ばない', async () => {
  const { impl, calls } = recordingFetch([tavilyResponse([{ title: 'T', url: 'https://dmwiki.net/x', content: '本文' }])])
  const r = await webSearch('イラストレーターは？', { apiKey: 'k', fetchImpl: impl as any })
  assert.equal(calls.length, 1)
  assert.ok(r)
})

test('isOutOfEraResult: 2024年を含む結果は対象期間外', () => {
  assert.equal(isOutOfEraResult({ title: '新弾情報', content: '2024年5月に発売された新弾' }), true)
})

test('isOutOfEraResult: 2026年を含む結果は対象期間外', () => {
  assert.equal(isOutOfEraResult({ title: '2026年4月の新弾' }), true)
})

test('isOutOfEraResult: 2008年・2005年を含む結果は対象期間内なので除外しない', () => {
  assert.equal(isOutOfEraResult({ content: '2008年に発売されたDM-30' }), false)
  assert.equal(isOutOfEraResult({ content: '2005年発売のカード' }), false)
})

test('isOutOfEraResult: 境界値 — 2002年・2008年は対象期間内、2001年・2009年は対象期間外', () => {
  assert.equal(isOutOfEraResult({ content: '2002年発売のカード' }), false)
  assert.equal(isOutOfEraResult({ content: '2008年発売のカード' }), false)
  assert.equal(isOutOfEraResult({ content: '2001年発売のカード' }), true)
  assert.equal(isOutOfEraResult({ content: '2009年発売のカード' }), true)
})

test('isOutOfEraResult: 1999年のような2000年以前の西暦も対象期間外', () => {
  assert.equal(isOutOfEraResult({ content: '1999年に発売されたTCG' }), true)
})

test('isOutOfEraResult: dm24rp4のような新型番URLは対象期間外', () => {
  assert.equal(isOutOfEraResult({ url: 'https://dm.takaratomy.co.jp/card/dm24rp4/001' }), true)
})

test('isOutOfEraResult: dm-31-001のような旧形式のまま続いたDM-31以降の型番も対象期間外', () => {
  assert.equal(isOutOfEraResult({ url: 'https://dm.takaratomy.co.jp/card/dm-31-001' }), true)
})

test('isOutOfEraResult: dm-01-001のような旧型番URLは除外しない', () => {
  assert.equal(isOutOfEraResult({ url: 'https://dm.takaratomy.co.jp/card/dm-01-001' }), false)
})

test('isOutOfEraResult: dm-30-001のような対象期間内の最終セットは除外しない', () => {
  assert.equal(isOutOfEraResult({ url: 'https://dm.takaratomy.co.jp/card/dm-30-001' }), false)
})

test('isOutOfEraResult: 年代表記も新型番も無いページは除外しない', () => {
  assert.equal(isOutOfEraResult({ title: 'ボルバルザーク・ドラゴン', url: 'https://dmwiki.net/ボルバルザーク', content: 'カードの能力説明' }), false)
})

test('isOutOfEraResult: 実際のTavilyレスポンス例（2024年5月27日に発売）は対象期間外', () => {
  assert.equal(isOutOfEraResult({
    title: 'デュエル・マスターズ 新弾情報',
    url: 'https://dm.takaratomy.co.jp/card/dm24rp4/',
    content: '最新弾は2024年5月27日に発売されました。',
  }), true)
})

test('webSearch: answerが対象期間外の情報を要約している場合、answerはcontextに含めない', async () => {
  const fake = async () => tavilyResponse(
    [{ title: 'ジョリー・ザ・ジョニー', url: 'https://dmwiki.net/jolly', content: 'DM-01のカード' }],
    'デュエル・マスターズの2024年新弾は2024年5月27日に発売されました。',
  )
  const r = await webSearch('ジョリー・ザ・ジョニー', { apiKey: 'k', fetchImpl: fake as any })
  assert.ok(r)
  assert.doesNotMatch(r!.context, /検索エンジンによる要約/)
  assert.doesNotMatch(r!.context, /2024年/)
  assert.match(r!.context, /DM-01のカード/)
})

test('webSearch: 対象期間外の結果はフィルタされ、期間内の結果のみ返す', async () => {
  const fake = async () => tavilyResponse([
    { title: '新弾情報', url: 'https://dmwiki.net/new', content: '2024年5月に発売された新弾' },
    { title: 'ジョリー・ザ・ジョニー', url: 'https://dmwiki.net/jolly', content: 'DM-01のカード' },
  ])
  const r = await webSearch('ジョリー・ザ・ジョニー', { apiKey: 'k', fetchImpl: fake as any })
  assert.ok(r)
  assert.equal(r!.sources.length, 1)
  assert.equal(r!.sources[0]!.url, 'https://dmwiki.net/jolly')
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
