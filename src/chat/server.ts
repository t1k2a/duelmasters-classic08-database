// src/chat/server.ts
import './env.js' // 他importより前に .env を読み込む（プロバイダ選択・APIキー解決のため）
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { streamSSE } from 'hono/streaming'
import type { Corpus } from './corpus.js'
import { loadCorpus } from './corpus.js'
import { retrieve } from './retriever.js'
import { buildMessages, buildSearchMessages } from './prompt.js'
import { webSearch, searchEnabled } from './search.js'
import { streamChat, isUp as isProviderUp, warmup, providerName } from './provider.js'
import { SingleFlightQueue, RateLimiter } from './queue.js'
import type { ChatTurn } from './types.js'

const ALLOW = new Set(['https://t1k2a.github.io', 'http://localhost:3000'])
const TIMEOUT_MS = 60_000

export function createApp(deps: { corpus: Corpus; chatImpl?: typeof streamChat; upImpl?: typeof isProviderUp; searchImpl?: typeof webSearch; ratePerMin?: number; maxWaiting?: number }): Hono {
  const app = new Hono()
  const chat = deps.chatImpl ?? streamChat
  const up = deps.upImpl ?? isProviderUp
  const search = deps.searchImpl ?? webSearch
  // 検索フォールバックの有効判定。テスト等で searchImpl 注入時は有効扱い。
  const canSearch = Boolean(deps.searchImpl) || searchEnabled()
  const queue = new SingleFlightQueue(deps.maxWaiting ?? 5)
  const rl = new RateLimiter(deps.ratePerMin ?? 10)

  app.use('*', async (c, next) => {
    const origin = c.req.header('origin') ?? ''
    const allow = ALLOW.has(origin) ? origin : 'https://t1k2a.github.io'
    c.header('access-control-allow-origin', allow)
    c.header('access-control-allow-headers', 'content-type, ngrok-skip-browser-warning')
    c.header('access-control-allow-methods', 'GET, POST, OPTIONS')
    if (c.req.method === 'OPTIONS') return c.body(null, 204)
    await next()
  })

  app.get('/api/health', async (c) => {
    const s = await up()
    return c.json({ status: 'ok', provider: providerName, up: s.up, model: s.model, depth: queue.depth })
  })

  app.post('/api/chat', async (c) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
    if (!rl.allow(ip)) return c.json({ error: 'RATE_LIMIT' }, 429)
    let body: { question?: string; history?: ChatTurn[] }
    try { body = await c.req.json() } catch { return c.json({ error: 'BAD_INPUT' }, 400) }
    const question = (body.question ?? '').trim()
    if (!question || question.length > 500) return c.json({ error: 'BAD_INPUT' }, 400)
    const history = body.history ?? []
    const retrieval = retrieve(deps.corpus, question)
    // DB(クラシック08)に該当が無く、検索が有効なら Web検索へフォールバック。
    const empty = !retrieval.cards.length && !retrieval.recipes.length && !retrieval.meta.length && !retrieval.knowledge.length
    let messages = buildMessages({ question, retrieval, history })
    let sources: { title: string; url: string }[] = []
    if (empty && canSearch) {
      const sr = await search(question).catch(() => null)
      if (sr && sr.sources.length) {
        messages = buildSearchMessages({ question, search: sr, history })
        sources = sr.sources
      }
    }

    return streamSSE(c, async (stream) => {
      try {
        await queue.run(async () => {
          const ac = new AbortController()
          const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
          try {
            for await (const tok of chat(messages, { signal: ac.signal })) {
              await stream.writeSSE({ data: JSON.stringify({ token: tok }) })
            }
          } finally { clearTimeout(timer) }
        })
        await stream.writeSSE({ data: JSON.stringify({ done: true, cards: retrieval.cards, recipes: retrieval.recipes.map(r => ({ id: r.id, name: r.name })), sources }) })
      } catch (e: any) {
        const code = e?.message === 'BUSY' ? 'BUSY' : 'ERROR'
        await stream.writeSSE({ data: JSON.stringify({ error: code, done: true }) })
      }
    })
  })

  return app
}

// 直接起動
if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  const corpus = await loadCorpus()
  const app = createApp({ corpus })
  // Render など PaaS は PORT を注入する。なければ CHAT_PORT、最後にローカル既定 8788。
  const port = parseInt(process.env['PORT'] ?? process.env['CHAT_PORT'] ?? '8788')
  console.log(`Chat server on :${port} (provider=${providerName})`)
  serve({ fetch: app.fetch, port })
  // モデルのプリロード（Ollama のコールドスタート解消用。Gemini では no-op）。失敗は無視。
  console.log('Warming up model...')
  warmup().then(ok => console.log(ok ? 'Model warm.' : 'Warmup skipped.'))
}
