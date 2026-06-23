// src/chat/ollama.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { streamChat } from './ollama.js'

function ndjsonResponse(lines: object[]): Response {
  const body = lines.map(o => JSON.stringify(o)).join('\n') + '\n'
  return new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson' } })
}

test('NDJSONストリームからcontentを連結yield', async () => {
  const fake = async () => ndjsonResponse([
    { message: { content: 'ボル' }, done: false },
    { message: { content: 'メテウス' }, done: false },
    { done: true },
  ])
  const out: string[] = []
  for await (const tok of streamChat([{role:'user',content:'x'}], { fetchImpl: fake as any })) out.push(tok)
  assert.equal(out.join(''), 'ボルメテウス')
})
