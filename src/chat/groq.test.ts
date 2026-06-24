// src/chat/groq.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { streamChat } from './groq.js'

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
