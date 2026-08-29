// src/chat/groq.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { streamChat, isUp } from './groq.js'

// Groq の OpenAI互換エンドポイントは OpenAI と同じ SSE 形式を返す。
function sseResponse(chunks: string[]): Response {
  return new Response(chunks.join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}
function deltaLine(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
}

test('OpenAI互換SSEストリームからdelta.contentを連結yield', async () => {
  const fake = async () => sseResponse([deltaLine('ボル'), deltaLine('メテウス'), 'data: [DONE]\n\n'])
  const out: string[] = []
  for await (const tok of streamChat([{ role: 'user', content: 'x' }], { apiKey: 'k', fetchImpl: fake as any })) out.push(tok)
  assert.equal(out.join(''), 'ボルメテウス')
})

test('チャンク境界が行の途中で割れても正しく連結', async () => {
  const full = deltaLine('火文明') + deltaLine('クリーチャー') + 'data: [DONE]\n\n'
  const mid = Math.floor(full.length / 2)
  const fake = async () => sseResponse([full.slice(0, mid), full.slice(mid)])
  const out: string[] = []
  for await (const tok of streamChat([{ role: 'user', content: 'x' }], { apiKey: 'k', fetchImpl: fake as any })) out.push(tok)
  assert.equal(out.join(''), '火文明クリーチャー')
})

test('APIキー未設定なら例外', async () => {
  await assert.rejects(async () => {
    for await (const _ of streamChat([{ role: 'user', content: 'x' }], { apiKey: '' })) { /* noop */ }
  }, /GROQ_API_KEY/)
})

test('モデルが404ならフォールバックモデルを試行して成功', async () => {
  const calls: string[] = []
  const fake = async (url: string, init?: any) => {
    const body = JSON.parse(init.body)
    calls.push(body.model)
    if (body.model === 'invalid-model') {
      return new Response(JSON.stringify({ error: { code: 'model_not_found' } }), { status: 404 })
    }
    return sseResponse([deltaLine('OK'), 'data: [DONE]\n\n'])
  }
  const out: string[] = []
  for await (const tok of streamChat([{ role: 'user', content: 'x' }], {
    apiKey: 'k',
    model: 'invalid-model',
    fallbackModels: ['fallback-1'],
    fetchImpl: fake as any,
  })) {
    out.push(tok)
  }
  assert.equal(out.join(''), 'OK')
  assert.deepEqual(calls, ['invalid-model', 'fallback-1'])
})

test('isUp: モデル一覧に対象モデルが存在しなければup: false', async () => {
  const fake = async () => new Response(JSON.stringify({ data: [{ id: 'other-model' }] }), { status: 200 })
  const res = await isUp({ apiKey: 'k', model: 'target-model', fetchImpl: fake as any })
  assert.equal(res.up, false)
})

test('isUp: モデル一覧に対象モデルが存在すればup: true', async () => {
  const fake = async () => new Response(JSON.stringify({ data: [{ id: 'target-model' }] }), { status: 200 })
  const res = await isUp({ apiKey: 'k', model: 'target-model', fetchImpl: fake as any })
  assert.equal(res.up, true)
})

test('streamChat: 429(レート制限)では候補モデルへ切り替えず即座に例外スロー', async () => {
  const calls: string[] = []
  const fake = async (url: string, init?: any) => {
    const body = JSON.parse(init.body)
    calls.push(body.model)
    return new Response(JSON.stringify({ error: { message: 'rate limit reached' } }), { status: 429 })
  }
  await assert.rejects(async () => {
    for await (const _ of streamChat([{ role: 'user', content: 'x' }], {
      apiKey: 'k',
      model: 'primary-model',
      fallbackModels: ['fallback-model'],
      fetchImpl: fake as any,
    })) { /* noop */ }
  }, /Groq HTTP 429/)
  // 429を受けた時点で即スローし、セカンダリモデルへの追加リクエストは行わない
  assert.deepEqual(calls, ['primary-model'])
})

test('isUp: dataがnullの場合はup: false', async () => {
  const fake = async () => new Response(JSON.stringify({ data: null }), { status: 200 })
  const res = await isUp({ apiKey: 'k', model: 'target-model', fetchImpl: fake as any })
  assert.equal(res.up, false)
})

test('isUp: 空オブジェクトレスポンスの場合はup: false', async () => {
  const fake = async () => new Response(JSON.stringify({}), { status: 200 })
  const res = await isUp({ apiKey: 'k', model: 'target-model', fetchImpl: fake as any })
  assert.equal(res.up, false)
})

test('isUp: JSONパースエラー時はup: false', async () => {
  const fake = async () => new Response('invalid json', { status: 200 })
  const res = await isUp({ apiKey: 'k', model: 'target-model', fetchImpl: fake as any })
  assert.equal(res.up, false)
})