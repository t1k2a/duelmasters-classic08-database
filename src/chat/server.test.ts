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

test('chat: DB未ヒット時はWeb検索にフォールバックし sources を返す', async () => {
  const corpus = await loadCorpus()
  async function* fakeStream() { yield '※このDBの収録範囲外の情報です。' }
  let searched = ''
  const fakeSearch = (async (q: string) => { searched = q; return { sources: [{ title: 'A', url: 'https://e.com/a' }], context: '[1] A\n本文\n出典: https://e.com/a' } }) as any
  const app = createApp({ corpus, chatImpl: (() => fakeStream()) as any, searchImpl: fakeSearch })
  // DBに存在しない（2008年以降の）カード名で retrieval を空にする
  const res = await app.fetch(new Request('http://x/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'ジョリー・ザ・ジョニーXX2020の能力は？' }),
  }))
  const text = await res.text()
  assert.equal(searched, 'ジョリー・ザ・ジョニーXX2020の能力は？')
  assert.match(text, /"sources":\[\{"title":"A","url":"https:\/\/e\.com\/a"\}\]/)
  assert.match(text, /収録範囲外/)
})

test('chat: DBヒット時は検索を呼ばない', async () => {
  const corpus = await loadCorpus()
  async function* fakeStream() { yield 'はい' }
  let called = false
  const fakeSearch = (async () => { called = true; return null }) as any
  const app = createApp({ corpus, chatImpl: (() => fakeStream()) as any, searchImpl: fakeSearch })
  await app.fetch(new Request('http://x/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'バジュラズ・ソウルってどんなカード？' }),
  }))
  assert.equal(called, false)
})

test('chat: DB部分ヒットでも一段目が[[WEB]]なら検索に切り替え二段目を流し sources を返す', async () => {
  const corpus = await loadCorpus()
  // 一段目は [[WEB]] をトークン分割で返す（バッファ結合を検証）、二段目は検索回答を返す
  let calls = 0
  const chatImpl = (() => {
    calls++
    return calls === 1
      ? (async function* () { yield '[['; yield 'WEB]]' })()
      : (async function* () { yield 'Web'; yield 'の回答です' })()
  }) as any
  let searched = ''
  const fakeSearch = (async (q: string) => { searched = q; return { sources: [{ title: 'A', url: 'https://e.com/a' }], context: '[1] A\n本文' } }) as any
  const app = createApp({ corpus, chatImpl, searchImpl: fakeSearch })
  const res = await app.fetch(new Request('http://x/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'ボルメテウス・ホワイト・ドラゴンの能力は？' }),
  }))
  const text = await res.text()
  assert.equal(searched, 'ボルメテウス・ホワイト・ドラゴンの能力は？')
  assert.match(text, /"token":"Web"/)          // 二段目のトークンが流れる
  assert.doesNotMatch(text, /\[\[WEB\]\]/)      // センチネルは漏れない
  assert.match(text, /"sources":\[\{"title":"A","url":"https:\/\/e\.com\/a"\}\]/)
})

test('chat: 一段目が通常回答なら検索を呼ばず素通し（センチネル無し）', async () => {
  const corpus = await loadCorpus()
  const chatImpl = (() => (async function* () { yield 'はい'; yield '、能力は…' })()) as any
  let called = false
  const fakeSearch = (async () => { called = true; return null }) as any
  const app = createApp({ corpus, chatImpl, searchImpl: fakeSearch })
  const res = await app.fetch(new Request('http://x/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'ボルメテウス・ホワイト・ドラゴンの能力は？' }),
  }))
  const text = await res.text()
  assert.equal(called, false)
  assert.match(text, /"token":"はい"/)
})

test('chat: 一段目[[WEB]]だが検索が0件/null なら「このDBには情報がありません」を流す', async () => {
  const corpus = await loadCorpus()
  const chatImpl = (() => (async function* () { yield '[[WEB]]' })()) as any
  const fakeSearch = (async () => null) as any
  const app = createApp({ corpus, chatImpl, searchImpl: fakeSearch })
  const res = await app.fetch(new Request('http://x/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'ボルメテウス・ホワイト・ドラゴンの能力は？' }),
  }))
  const text = await res.text()
  assert.match(text, /このDBには情報がありません/)
  assert.doesNotMatch(text, /\[\[WEB\]\]/)
})

test('chat(edge): [[/WEB/]] の3トークン分割でもセンチネル検知し検索に切替', async () => {
  const corpus = await loadCorpus()
  let calls = 0
  const chatImpl = (() => {
    calls++
    return calls === 1
      ? (async function* () { yield '[['; yield 'WEB'; yield ']]' })()
      : (async function* () { yield '検索'; yield '回答' })()
  }) as any
  let searched = ''
  const fakeSearch = (async (q: string) => { searched = q; return { sources: [{ title: 'A', url: 'https://e.com/a' }], context: '本文' } }) as any
  const app = createApp({ corpus, chatImpl, searchImpl: fakeSearch })
  const res = await app.fetch(new Request('http://x/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'ボルメテウス・ホワイト・ドラゴンの能力は？' }),
  }))
  const text = await res.text()
  assert.equal(searched, 'ボルメテウス・ホワイト・ドラゴンの能力は？')
  assert.match(text, /"token":"検索"/)
  assert.doesNotMatch(text, /\[\[WEB\]\]/)
})

test('chat(edge): 先頭に改行/空白付き [[WEB]] でもセンチネル検知', async () => {
  const corpus = await loadCorpus()
  let calls = 0
  const chatImpl = (() => {
    calls++
    return calls === 1
      ? (async function* () { yield '\n '; yield '[[WEB]]' })()
      : (async function* () { yield '検索'; yield '回答' })()
  }) as any
  const fakeSearch = (async () => ({ sources: [{ title: 'A', url: 'https://e.com/a' }], context: '本文' })) as any
  const app = createApp({ corpus, chatImpl, searchImpl: fakeSearch })
  const res = await app.fetch(new Request('http://x/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'ボルメテウス・ホワイト・ドラゴンの能力は？' }),
  }))
  const text = await res.text()
  assert.match(text, /"token":"検索"/)
  assert.doesNotMatch(text, /\[\[WEB\]\]/)
})

test('chat(edge): [[WEB]] の後に余分なテキストが続いても漏出せず検索に切替', async () => {
  const corpus = await loadCorpus()
  let calls = 0
  const chatImpl = (() => {
    calls++
    return calls === 1
      ? (async function* () { yield '[[WEB]]'; yield ' すみません情報が古いかもしれません' })()
      : (async function* () { yield '検索'; yield '回答' })()
  }) as any
  let searched = ''
  const fakeSearch = (async (q: string) => { searched = q; return { sources: [{ title: 'A', url: 'https://e.com/a' }], context: '本文' } }) as any
  const app = createApp({ corpus, chatImpl, searchImpl: fakeSearch })
  const res = await app.fetch(new Request('http://x/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'ボルメテウス・ホワイト・ドラゴンの能力は？' }),
  }))
  const text = await res.text()
  assert.equal(searched, 'ボルメテウス・ホワイト・ドラゴンの能力は？')
  assert.doesNotMatch(text, /\[\[WEB\]\]/)
})

test('chat(edge): [[ で始まる通常回答は欠落なくそのまま流す', async () => {
  const corpus = await loadCorpus()
  const chatImpl = (() => (async function* () { yield '[['; yield 'カード]]は強力な能力を持ちます' })()) as any
  let called = false
  const fakeSearch = (async () => { called = true; return null }) as any
  const app = createApp({ corpus, chatImpl, searchImpl: fakeSearch })
  const res = await app.fetch(new Request('http://x/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'ボルメテウス・ホワイト・ドラゴンの能力は？' }),
  }))
  const text = await res.text()
  assert.equal(called, false)
  // 先頭の [[ と後続テキストが結合して欠落なく届く
  const tokens = text.split('\n').map(l => l.replace(/^data:\s*/, '')).filter(Boolean)
    .map(l => { try { return JSON.parse(l) } catch { return null } })
    .filter(o => o && typeof o.token === 'string').map(o => o.token).join('')
  assert.equal(tokens, '[[カード]]は強力な能力を持ちます')
})

test('chat: デッキ構築要求では done に deck(40枚)を含める', async () => {
  const corpus = await loadCorpus()
  async function* fakeStream() { yield 'デッキ' }
  const app = createApp({ corpus, chatImpl: (() => fakeStream()) as any })
  const res = await app.fetch(new Request('http://x/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'ボルメテウスのデッキ組んで' }),
  }))
  const text = await res.text()
  const done = text.split('\n').map(l => l.replace(/^data:\s*/, '')).filter(Boolean)
    .map(l => { try { return JSON.parse(l) } catch { return null } }).find(o => o && o.done)
  assert.ok(done?.deck, 'deck が付与される')
  assert.equal(done.deck.cards.reduce((s: number, c: any) => s + c.count, 0), 40)
  assert.ok(done.deck.cards.some((c: any) => c.id))
})

test('chat: 履歴付きリクエストでもデッキ構築要求なら deck(40枚)を付与', async () => {
  const corpus = await loadCorpus()
  async function* fakeStream() { yield 'デッキ' }
  const app = createApp({ corpus, chatImpl: (() => fakeStream()) as any })
  const res = await app.fetch(new Request('http://x/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: 'ボルメテウスのデッキ組んで',
      history: [
        { role: 'user', content: 'こんにちは' },
        { role: 'assistant', content: 'こんにちは。何をお探しですか？' },
      ],
    }),
  }))
  const text = await res.text()
  const done = text.split('\n').map(l => l.replace(/^data:\s*/, '')).filter(Boolean)
    .map(l => { try { return JSON.parse(l) } catch { return null } }).find(o => o && o.done)
  assert.ok(done?.deck, '履歴があっても deck が付与される')
  assert.equal(done.deck.cards.reduce((s: number, c: any) => s + c.count, 0), 40)
})

test('chat: デッキ構築時 LLM に渡る messages に40枚リストが入る', async () => {
  const corpus = await loadCorpus()
  let captured: any[] = []
  async function* fakeStream() { yield 'デッキ' }
  const chatImpl = ((msgs: any[]) => { captured = msgs; return fakeStream() }) as any
  const app = createApp({ corpus, chatImpl })
  await app.fetch(new Request('http://x/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'ボルメテウスのデッキ組んで' }),
  }))
  const user = captured[captured.length - 1]?.content ?? ''
  assert.match(user, /## 提示デッキ（合計40枚）/)
  // 40枚ぶんの《...》×n 行が入っている（ユニーク種で最低でも複数行）
  const lines = (user.match(/《[^》]+》×\d+/g) ?? [])
  const sum = lines.reduce((s: number, l: string) => s + Number(l.match(/×(\d+)/)![1]), 0)
  assert.equal(sum, 40)
})

test('chat: デッキ意図でない質問には deck を付けない', async () => {
  const corpus = await loadCorpus()
  async function* fakeStream() { yield 'はい' }
  const app = createApp({ corpus, chatImpl: (() => fakeStream()) as any })
  const res = await app.fetch(new Request('http://x/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'ボルメテウス・ホワイト・ドラゴンの能力は？' }),
  }))
  const text = await res.text()
  const done = text.split('\n').map(l => l.replace(/^data:\s*/, '')).filter(Boolean)
    .map(l => { try { return JSON.parse(l) } catch { return null } }).find(o => o && o.done)
  assert.equal(done?.deck, undefined)
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

// console.log/error を一時捕捉して構造化ログ行(JSON)を集める
async function captureLogs(run: () => Promise<void>): Promise<{ out: any[]; err: any[] }> {
  const origLog = console.log, origErr = console.error
  const out: any[] = [], err: any[] = []
  const parse = (bucket: any[]) => (...args: any[]) => {
    try { bucket.push(JSON.parse(args[0])) } catch { /* JSON以外は無視 */ }
  }
  console.log = parse(out); console.error = parse(err)
  try { await run() } finally { console.log = origLog; console.error = origErr }
  return { out, err }
}

test('log: chat通過時に1行JSON(ev=chat, ip/qlen/q)を出す', async () => {
  const corpus = await loadCorpus()
  const app = createApp({ corpus, chatImpl: (() => (async function*(){ yield 'はい' })()) as any })
  const { out } = await captureLogs(async () => {
    await app.fetch(new Request('http://x/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.5' },
      body: JSON.stringify({ question: 'ブロッカーって何？' }),
    }))
  })
  const rec = out.find(o => o.ev === 'chat')
  assert.ok(rec, 'ev=chat のログ行がある')
  assert.equal(rec.ip, '203.0.113.5')
  assert.equal(rec.q, 'ブロッカーって何？')
  assert.equal(rec.qlen, 'ブロッカーって何？'.length)
  assert.match(rec.t, /^\d{4}-\d{2}-\d{2}T.*Z$/)
})

test('log: /api/health はログしない', async () => {
  const corpus = await loadCorpus()
  const app = createApp({ corpus, upImpl: async () => ({ up: true, model: 'stub' }) })
  const { out } = await captureLogs(async () => {
    await app.fetch(new Request('http://x/api/health'))
  })
  assert.equal(out.length, 0)
})

test('log: レート制限拒否は ev=rate_limited で ip のみ(q無し)', async () => {
  const corpus = await loadCorpus()
  const app = createApp({ corpus, chatImpl: (() => (async function*(){ yield 'ok' })()) as any, ratePerMin: 1 })
  const mk = () => app.fetch(new Request('http://x/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.9' },
    body: JSON.stringify({ question: 'ブロッカーって何？' }),
  }))
  const { out } = await captureLogs(async () => { await mk(); await mk() })
  const rec = out.find(o => o.ev === 'rate_limited')
  assert.ok(rec, 'ev=rate_limited のログ行がある')
  assert.equal(rec.ip, '198.51.100.9')
  assert.equal(rec.q, undefined)
})

test('log: chat中の例外は ev=chat_error でmsgを出す', async () => {
  const corpus = await loadCorpus()
  const chatImpl = (() => (async function*(){ throw new Error('boom') })()) as any
  const app = createApp({ corpus, chatImpl })
  const { err } = await captureLogs(async () => {
    await app.fetch(new Request('http://x/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'ブロッカーって何？' }),
    }))
  })
  const rec = err.find(o => o.ev === 'chat_error')
  assert.ok(rec, 'ev=chat_error のログ行がある')
  assert.equal(rec.msg, 'boom')
})

test('health: ollama down時は up=false', async () => {
  const corpus = await loadCorpus()
  const app = createApp({ corpus, upImpl: async () => ({ up: false, model: '' }) })
  const res = await app.fetch(new Request('http://x/api/health'))
  const j = await res.json() as any
  assert.equal(j.status, 'ok')
  assert.equal(j.up, false)
})
