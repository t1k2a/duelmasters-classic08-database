// src/chat/ollama.ts
type FetchLike = (url: string, init?: any) => Promise<Response>
const DEFAULT_BASE = process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434'
const DEFAULT_MODEL = process.env['OLLAMA_MODEL'] ?? 'qwen2.5:7b'

export async function* streamChat(
  messages: { role: string; content: string }[],
  opts: { model?: string; baseUrl?: string; temperature?: number; fetchImpl?: FetchLike; signal?: AbortSignal } = {},
): AsyncGenerator<string> {
  const f = opts.fetchImpl ?? (globalThis.fetch as FetchLike)
  const res = await f(`${opts.baseUrl ?? DEFAULT_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: opts.model ?? DEFAULT_MODEL, messages, stream: true, options: { temperature: opts.temperature ?? 0.1 } }),
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
