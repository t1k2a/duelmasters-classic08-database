// src/chat/server.ts
import './env.js' // 他importより前に .env を読み込む（プロバイダ選択・APIキー解決のため）
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { streamSSE } from 'hono/streaming'
import type { Corpus } from './corpus.js'
import { loadCorpus } from './corpus.js'
import { retrieve } from './retriever.js'
import { detectDeckIntent, selectDeck } from './deck.js'
import { buildMessages, buildSearchMessages } from './prompt.js'
import type { DeckContext } from './prompt.js'
import { webSearch, searchEnabled } from './search.js'
import { streamChat, isUp as isProviderUp, warmup, providerName } from './provider.js'
import { SingleFlightQueue, RateLimiter } from './queue.js'
import type { ChatTurn, DeckPayload } from './types.js'

const ALLOW = new Set(['https://t1k2a.github.io', 'http://localhost:3000'])
const TIMEOUT_MS = 60_000
// Tavily検索のタイムアウト。SSEストリーム開始前のブロックを抑え、体感応答時間を5秒以内に収める狙い。
const SEARCH_TIMEOUT_MS = parseInt(process.env['SEARCH_TIMEOUT_MS'] ?? '3000', 10)

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
    // デッキ構築要求なら既存レシピ（validated&&40枚）から1件選定。
    // 選定できたら、そのレシピをLLM contextの参考レシピ先頭に昇格し、done で deck を返す。
    let deck: DeckPayload | undefined
    let deckContext: DeckContext | undefined
    if (detectDeckIntent(question)) {
      const sel = selectDeck(deps.corpus, question, retrieval)
      if (sel) {
        const r = sel.recipe
        deck = { id: r.id, name: r.name, archetype: typeof r.archetype === 'string' ? r.archetype : undefined, cards: r.cards }
        retrieval.recipes = [r, ...retrieval.recipes.filter(x => x.id !== r.id)].slice(0, 3)
        // LLM contextに40枚全カードを渡せるよう、名前・コストを解決した提示デッキを組み立てる。
        deckContext = {
          name: r.name ?? r.id,
          archetype: typeof r.archetype === 'string' ? r.archetype : undefined,
          cards: r.cards.map(rc => {
            const cd = deps.corpus.cardById.get(rc.id)
            return { name: cd?.name ?? rc.id, cost: cd?.cost ?? null, count: rc.count }
          }),
        }
      }
    }
    // DB(クラシック08)に該当が無く、検索が有効なら Web検索へフォールバック。
    const empty = !retrieval.cards.length && !retrieval.recipes.length && !retrieval.meta.length && !retrieval.knowledge.length
    let sources: { title: string; url: string }[] = []
    // retrieval にヒットがあるが答えが無い場合に備え、通常パスでは [[WEB]] センチネルを許可する。
    // retrieval 完全空のときは従来どおり先に直接検索する（センチネル待ちのバッファリング不要）。
    let searchAvailable = false
    let messages
    if (empty && canSearch) {
      const sr = await search(question, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) }).catch(() => null)
      if (sr && sr.sources.length) {
        messages = buildSearchMessages({ question, search: sr, history })
        sources = sr.sources
      } else {
        messages = buildMessages({ question, retrieval, history, deck: deckContext })
      }
    } else {
      searchAvailable = canSearch && !empty
      messages = buildMessages({ question, retrieval, history, deck: deckContext, searchAvailable })
    }

    return streamSSE(c, async (stream) => {
      try {
        await queue.run(async () => {
          const ac = new AbortController()
          const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
          const send = (token: string) => stream.writeSSE({ data: JSON.stringify({ token }) })
          try {
            if (!searchAvailable) {
              for await (const tok of chat(messages, { signal: ac.signal })) {
                await send(tok)
              }
            } else {
              // 一段目: 先頭が [[WEB]] センチネルになり得る間はバッファし、クライアントへ流さない。
              const SENTINEL = '[[WEB]]'
              let buffer = ''
              let passthrough = false
              let isSentinel = false
              for await (const tok of chat(messages, { signal: ac.signal })) {
                if (passthrough) { await send(tok); continue }
                buffer += tok
                const t = buffer.trim()
                // センチネル一致（後続に余分テキストが続く場合含む）→ sticky に保持し残りは破棄。
                if (t.startsWith(SENTINEL)) { isSentinel = true; continue }
                if (SENTINEL.startsWith(t)) { isSentinel = false; continue }
                // センチネルと分岐 → 溜めたバッファを flush して以降は素通し（通常回答）。
                passthrough = true
                isSentinel = false
                await send(buffer)
                buffer = ''
              }
              if (isSentinel) {
                // 二段目: Web検索して検索用プロンプトで回答を生成する。
                const sr = await search(question, { signal: ac.signal }).catch(() => null)
                if (sr && sr.sources.length) {
                  sources = sr.sources
                  const searchMessages = buildSearchMessages({ question, search: sr, history })
                  for await (const tok of chat(searchMessages, { signal: ac.signal })) {
                    await send(tok)
                  }
                } else {
                  await send('このDBには情報がありません')
                }
              } else if (!passthrough && buffer) {
                // センチネル未確定のまま終了（バッファがセンチネルの接頭辞のみ）→ そのまま吐き出す。
                await send(buffer)
              }
            }
          } finally { clearTimeout(timer) }
        })
        await stream.writeSSE({ data: JSON.stringify({ done: true, cards: retrieval.cards, recipes: retrieval.recipes.map(r => ({ id: r.id, name: r.name })), deck, sources }) })
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
