// src/chat/groq.ts
// Groq の OpenAI 互換エンドポイントを使うプロバイダ。
// ./ollama.ts / ./gemini.ts と同じ streamChat / isUp / warmup の I/F を提供する。
// 互換エンドポイント仕様: https://console.groq.com/docs/openai
// Groq 無料枠は課金設定不要（console.groq.com で APIキー発行）。
type FetchLike = (url: string, init?: any) => Promise<Response>

const DEFAULT_BASE = process.env['GROQ_BASE_URL'] ?? 'https://api.groq.com/openai/v1'
// 日本語品質を優先し 70B 系を既定に。速度優先なら llama-3.1-8b-instant 等に変更可。
const DEFAULT_MODEL = process.env['GROQ_MODEL'] ?? 'llama-3.3-70b-versatile'
const DEFAULT_MAX_TOKENS = parseInt(process.env['GROQ_MAX_TOKENS'] ?? '512', 10)
const API_KEY = process.env['GROQ_API_KEY'] ?? ''

export async function* streamChat(
  messages: { role: string; content: string }[],
  opts: { model?: string; baseUrl?: string; temperature?: number; numPredict?: number; apiKey?: string; fetchImpl?: FetchLike; signal?: AbortSignal } = {},
): AsyncGenerator<string> {
  const apiKey = opts.apiKey ?? API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY 未設定')
  const f = opts.fetchImpl ?? (globalThis.fetch as FetchLike)
  const res = await f(`${opts.baseUrl ?? DEFAULT_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      messages,
      stream: true,
      temperature: opts.temperature ?? 0.1,
      max_tokens: opts.numPredict ?? DEFAULT_MAX_TOKENS,
    }),
    signal: opts.signal,
  })
  if (!res.ok || !res.body) throw new Error(`Groq HTTP ${res.status}`)
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
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        const o = JSON.parse(payload)
        const tok = o?.choices?.[0]?.delta?.content
        if (tok) yield tok as string
      } catch { /* 不完全/非JSON行はスキップ */ }
    }
  }
}

// OpenAI互換の models 一覧で疎通確認（生成は走らず枠を消費しない）。
export async function isUp(opts: { baseUrl?: string; model?: string; apiKey?: string; fetchImpl?: FetchLike } = {}): Promise<{ up: boolean; model: string }> {
  const model = opts.model ?? DEFAULT_MODEL
  const apiKey = opts.apiKey ?? API_KEY
  if (!apiKey) return { up: false, model }
  const f = opts.fetchImpl ?? (globalThis.fetch as FetchLike)
  try {
    const res = await f(`${opts.baseUrl ?? DEFAULT_BASE}/models`, { headers: { authorization: `Bearer ${apiKey}` } })
    return { up: res.ok, model }
  } catch { return { up: false, model } }
}

// API はウォームアップ不要。I/F 互換のため no-op。
export async function warmup(): Promise<boolean> { return true }
