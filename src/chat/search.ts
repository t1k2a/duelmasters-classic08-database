// src/chat/search.ts
// DBに該当が無かった質問のフォールバック用 Web検索（Tavily）。
// Tavily は検索結果をLLM向けに整形して返すため、スニペットをそのまま context にできる。
// 仕様: https://docs.tavily.com/  無料枠あり（APIキーは TAVILY_API_KEY）。
type FetchLike = (url: string, init?: any) => Promise<Response>

const API_KEY = process.env['TAVILY_API_KEY'] ?? ''
const ENDPOINT = process.env['TAVILY_BASE_URL'] ?? 'https://api.tavily.com/search'
const DEFAULT_MAX = parseInt(process.env['SEARCH_MAX_RESULTS'] ?? '5', 10)

export interface WebSearchResult {
  sources: { title: string; url: string }[]
  context: string
}

// 検索フォールバックが有効か（APIキーが設定されているか）。
export function searchEnabled(apiKey: string = API_KEY): boolean {
  return Boolean(apiKey)
}

// 失敗時・キー未設定時は null を返す（呼び出し側は通常のDB回答にフォールバックする）。
export async function webSearch(
  query: string,
  opts: { apiKey?: string; maxResults?: number; fetchImpl?: FetchLike; signal?: AbortSignal } = {},
): Promise<WebSearchResult | null> {
  const apiKey = opts.apiKey ?? API_KEY
  if (!apiKey) return null
  const f = opts.fetchImpl ?? (globalThis.fetch as FetchLike)
  try {
    const res = await f(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: opts.maxResults ?? DEFAULT_MAX,
        search_depth: 'basic',
        include_answer: true, // 検索結果をLLM向けに要約した文字列。回答精度が上がる。
      }),
      signal: opts.signal,
    })
    if (!res.ok) return null
    const j = await res.json() as { answer?: string; results?: { title?: string; url?: string; content?: string }[] }
    const results = Array.isArray(j.results) ? j.results : []
    const sources = results
      .map(r => ({ title: String(r.title ?? r.url ?? ''), url: String(r.url ?? '') }))
      .filter(s => s.url)
    if (!sources.length) return null
    const snippets = results
      .map((r, i) => `[${i + 1}] ${r.title ?? ''}\n${r.content ?? ''}\n出典: ${r.url ?? ''}`)
      .join('\n\n')
    const answer = typeof j.answer === 'string' ? j.answer.trim() : ''
    // Tavily の要約を先頭に置くと、薄いスニペットでもモデルが要点を拾いやすい。
    const context = (answer ? `検索エンジンによる要約:\n${answer}\n\n---\n` : '') + snippets
    return { sources, context }
  } catch {
    return null
  }
}
