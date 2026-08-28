// src/chat/groq.ts
// Groq の OpenAI 互換エンドポイントを使うプロバイダ。
// ./ollama.ts / ./gemini.ts と同じ streamChat / isUp / warmup の I/F を提供する。
// 互換エンドポイント仕様: https://console.groq.com/docs/openai
// Groq 無料枠は課金設定不要（console.groq.com で APIキー発行）。
type FetchLike = (url: string, init?: any) => Promise<Response>

const DEFAULT_BASE = process.env['GROQ_BASE_URL'] ?? 'https://api.groq.com/openai/v1'
// 日本語性能・TCGカード検索との適合性を優先し qwen/qwen3.8-27b を既定に。
export const DEFAULT_MODEL = process.env['GROQ_MODEL'] ?? 'qwen/qwen3.8-27b'
export const DEFAULT_FALLBACK_MODELS = [
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.6-27b',
]
const DEFAULT_MAX_TOKENS = parseInt(process.env['GROQ_MAX_TOKENS'] ?? '256', 10)
const API_KEY = process.env['GROQ_API_KEY'] ?? ''

export async function* streamChat(
  messages: { role: string; content: string }[],
  opts: {
    model?: string
    fallbackModels?: string[]
    baseUrl?: string
    temperature?: number
    numPredict?: number
    apiKey?: string
    fetchImpl?: FetchLike
    signal?: AbortSignal
  } = {},
): AsyncGenerator<string> {
  const apiKey = opts.apiKey ?? (process.env['GROQ_API_KEY'] ?? API_KEY)
  if (!apiKey) throw new Error('GROQ_API_KEY 未設定')
  const f = opts.fetchImpl ?? (globalThis.fetch as FetchLike)

  // 試行するモデル候補リスト（指定モデルまたはデフォルトを先頭にし、フォールバックモデルを順次試行）
  const initialModel = opts.model ?? (process.env['GROQ_MODEL'] ?? DEFAULT_MODEL)
  const candidateModels = [initialModel]
  const fallbacks = opts.fallbackModels ?? DEFAULT_FALLBACK_MODELS
  for (const fb of fallbacks) {
    if (!candidateModels.includes(fb)) candidateModels.push(fb)
  }

  let lastError: Error | null = null
  let res: Response | null = null
  let selectedModel = initialModel

  for (const model of candidateModels) {
    selectedModel = model
    try {
      res = await f(`${opts.baseUrl ?? DEFAULT_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          temperature: opts.temperature ?? 0.1,
          max_tokens: opts.numPredict ?? DEFAULT_MAX_TOKENS,
        }),
        signal: opts.signal,
      })

      // 404 (model_not_found) の場合は次の候補モデルを試行
      if (res.status === 404) {
        lastError = new Error(`Groq HTTP 404 (model: ${model})`)
        continue
      }

      if (!res.ok || !res.body) {
        throw new Error(`Groq HTTP ${res.status}`)
      }

      // 成功したらループを抜ける
      break
    } catch (e: any) {
      lastError = e
      // AbortSignal による中断ならリトライせず即再スロー
      if (opts.signal?.aborted) throw e
      // 最後の候補でなければフォールバックを試みる
      continue
    }
  }

  if (!res || !res.ok || !res.body) {
    throw lastError ?? new Error('Groq all candidate models failed')
  }

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

// OpenAI互換の models 一覧で疎通および指定モデルの存在確認。
export async function isUp(opts: { baseUrl?: string; model?: string; apiKey?: string; fetchImpl?: FetchLike } = {}): Promise<{ up: boolean; model: string }> {
  const model = opts.model ?? (process.env['GROQ_MODEL'] ?? DEFAULT_MODEL)
  const apiKey = opts.apiKey ?? (process.env['GROQ_API_KEY'] ?? API_KEY)
  if (!apiKey) return { up: false, model }
  const f = opts.fetchImpl ?? (globalThis.fetch as FetchLike)
  try {
    const res = await f(`${opts.baseUrl ?? DEFAULT_BASE}/models`, { headers: { authorization: `Bearer ${apiKey}` } })
    if (!res.ok) return { up: false, model }
    const data: any = await res.json().catch(() => null)
    // モデル一覧に対象モデルが含まれているか検証（存在しない場合は up: false）
    const modelExists = Array.isArray(data?.data) ? data.data.some((m: any) => m.id === model) : true
    return { up: modelExists, model }
  } catch { return { up: false, model } }
}

// API はウォームアップ不要。I/F 互換のため no-op。
export async function warmup(): Promise<boolean> { return true }