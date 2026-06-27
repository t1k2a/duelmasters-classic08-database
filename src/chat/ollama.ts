// src/chat/ollama.ts
type FetchLike = (url: string, init?: any) => Promise<Response>
const DEFAULT_BASE = process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434'
const DEFAULT_MODEL = process.env['OLLAMA_MODEL'] ?? 'qwen2.5:7b'
// 1リクエストの最大生成トークン数（応答が冗長＝遅くなり過ぎるのを防ぐ上限）
const DEFAULT_NUM_PREDICT = parseInt(process.env['OLLAMA_NUM_PREDICT'] ?? '256', 10)
// モデルをVRAMに保持する時間（コールドロード再発を防ぐ）。'-1' で常駐
const DEFAULT_KEEP_ALIVE = process.env['OLLAMA_KEEP_ALIVE'] ?? '30m'

export async function* streamChat(
  messages: { role: string; content: string }[],
  opts: { model?: string; baseUrl?: string; temperature?: number; numPredict?: number; keepAlive?: string; fetchImpl?: FetchLike; signal?: AbortSignal } = {},
): AsyncGenerator<string> {
  const f = opts.fetchImpl ?? (globalThis.fetch as FetchLike)
  const res = await f(`${opts.baseUrl ?? DEFAULT_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      messages,
      stream: true,
      keep_alive: opts.keepAlive ?? DEFAULT_KEEP_ALIVE,
      options: { temperature: opts.temperature ?? 0.1, num_predict: opts.numPredict ?? DEFAULT_NUM_PREDICT },
    }),
    signal: opts.signal,
  })
  if (!res.ok || !res.body) throw new Error(`Ollama HTTP ${res.status}`)
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
      if (!line) continue
      try { const o = JSON.parse(line); if (o?.message?.content) yield o.message.content as string } catch { /* skip */ }
    }
  }
}

export async function isOllamaUp(opts: { baseUrl?: string; model?: string; fetchImpl?: FetchLike } = {}): Promise<{ up: boolean; model: string }> {
  const f = opts.fetchImpl ?? (globalThis.fetch as FetchLike)
  const model = opts.model ?? DEFAULT_MODEL
  try {
    const res = await f(`${opts.baseUrl ?? DEFAULT_BASE}/api/tags`)
    return { up: res.ok, model }
  } catch { return { up: false, model } }
}

// サーバ起動時にモデルをVRAMへプリロードし、初回ユーザーのコールドスタートを解消する。
// 失敗（Ollama未起動・モデル未取得）は致命的でないため握りつぶしてログのみ。
export async function warmup(opts: { baseUrl?: string; model?: string; keepAlive?: string } = {}): Promise<boolean> {
  const model = opts.model ?? DEFAULT_MODEL
  try {
    const res = await fetch(`${opts.baseUrl ?? DEFAULT_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt: 'hi', stream: false, keep_alive: opts.keepAlive ?? DEFAULT_KEEP_ALIVE, options: { num_predict: 1 } }),
    })
    return res.ok
  } catch { return false }
}
