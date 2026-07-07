// src/chat/gemini.ts
// Google Gemini の OpenAI 互換エンドポイントを使うプロバイダ。
// ./ollama.ts と同じ streamChat / isUp / warmup の I/F を提供し、provider.ts で差し替え可能にする。
// 互換エンドポイント仕様: https://ai.google.dev/gemini-api/docs/openai
type FetchLike = (url: string, init?: any) => Promise<Response>

const DEFAULT_BASE = process.env['GEMINI_BASE_URL'] ?? 'https://generativelanguage.googleapis.com/v1beta/openai'
const DEFAULT_MODEL = process.env['GEMINI_MODEL'] ?? 'gemini-2.0-flash'
// 1リクエストの最大生成トークン数（冗長＝遅い/枠消費を防ぐ上限）。Ollama版の num_predict 相当。
const DEFAULT_MAX_TOKENS = parseInt(process.env['GEMINI_MAX_TOKENS'] ?? '256', 10)
const API_KEY = process.env['GEMINI_API_KEY'] ?? ''

export async function* streamChat(
  messages: { role: string; content: string }[],
  opts: { model?: string; baseUrl?: string; temperature?: number; numPredict?: number; apiKey?: string; fetchImpl?: FetchLike; signal?: AbortSignal } = {},
): AsyncGenerator<string> {
  const apiKey = opts.apiKey ?? API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 未設定')
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
  if (!res.ok || !res.body) throw new Error(`Gemini HTTP ${res.status}`)
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
