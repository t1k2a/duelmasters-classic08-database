// src/chat/server.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCorpus } from './corpus.js'
import { createApp } from './server.js'

test('health: upと depth を返す', async () => {
  const corpus = await loadCorpus()
  const app = createApp({ corpus, upImpl: async () => ({ up: true, model: 'stub' }) })
  const res = await app.fetch(new Request('http://x/api/health'))
  const j = await res.json() as any
  assert.equal(j.up, true); assert.equal(j.model, 'stub')
})

test('chat: SSEでtokenと根拠cardsを流す', async () => {
  const corpus = await loadCorpus()
  async function* fakeStream() { yield 'はい'; yield '。' }
  const app = createApp({ corpus, chatImpl: (() => fakeStream()) as any })
  const res = await app.fetch(new Request('http://x/api/chat', {
    method: 'POST', headers: { 'content-type':'application/json' },
    body: JSON.stringify({ question: 'ボルメテウス・ホワイト・ドラゴンの能力は？' }),
  }))
  const text = await res.text()
  assert.match(text, /"token":"はい"/)
  assert.match(text, /"done":true/)
  assert.match(res.headers.get('access-control-allow-origin') ?? '', /github\.io|\*/)
})

test('chat: レート制限超過で429', async () => {
  const corpus = await loadCorpus()
  async function* fakeStream() { yield 'ok' }
  const app = createApp({ corpus, chatImpl: (() => fakeStream()) as any, ratePerMin: 1 })
  const mk = () => app.fetch(new Request('http://x/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'ブロッカーって何？' }),
  }))
  const r1 = await mk()
  assert.equal(r1.status, 200)
  const r2 = await mk()
  assert.equal(r2.status, 429)
  assert.equal((await r2.json() as any).error, 'RATE_LIMIT')
})

test('chat: 入力過大(>500)で400', async () => {
  const corpus = await loadCorpus()
  const app = createApp({ corpus, chatImpl: (() => (async function*(){ yield 'x' })()) as any })
  const res = await app.fetch(new Request('http://x/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'あ'.repeat(501) }),
  }))
  assert.equal(res.status, 400)
  assert.equal((await res.json() as any).error, 'BAD_INPUT')
})

test('chat: 空入力で400', async () => {
  const corpus = await loadCorpus()
  const app = createApp({ corpus, chatImpl: (() => (async function*(){ yield 'x' })()) as any })
  const res = await app.fetch(new Request('http://x/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: '   ' }),
  }))
  assert.equal(res.status, 400)
  assert.equal((await res.json() as any).error, 'BAD_INPUT')
})

test('OPTIONSプリフライトは204', async () => {
  const corpus = await loadCorpus()
  const app = createApp({ corpus, upImpl: async () => ({ up: true, model: 'stub' }) })
  const res = await app.fetch(new Request('http://x/api/chat', { method: 'OPTIONS' }))
  assert.equal(res.status, 204)
  assert.match(res.headers.get('access-control-allow-methods') ?? '', /POST/)
})

test('health: ollama down時は up=false', async () => {
  const corpus = await loadCorpus()
  const app = createApp({ corpus, upImpl: async () => ({ up: false, model: '' }) })
  const res = await app.fetch(new Request('http://x/api/health'))
  const j = await res.json() as any
  assert.equal(j.status, 'ok')
  assert.equal(j.up, false)
})
