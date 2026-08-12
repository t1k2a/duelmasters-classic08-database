// src/chat/search.ts
// DBに該当が無かった質問のフォールバック用 Web検索（Tavily）。
// Tavily は検索結果をLLM向けに整形して返すため、スニペットをそのまま context にできる。
// 仕様: https://docs.tavily.com/  無料枠あり（APIキーは TAVILY_API_KEY）。
type FetchLike = (url: string, init?: any) => Promise<Response>

const API_KEY = process.env['TAVILY_API_KEY'] ?? ''
const ENDPOINT = process.env['TAVILY_BASE_URL'] ?? 'https://api.tavily.com/search'
const DEFAULT_MAX = parseInt(process.env['SEARCH_MAX_RESULTS'] ?? '5', 10)

// 検索対象をデュエル・マスターズ関連に限定するための信頼ドメイン。
// SEARCH_INCLUDE_DOMAINS（カンマ区切り）で上書き可能。
export const DEFAULT_INCLUDE_DOMAINS = ['dmwiki.net', 'dm.takaratomy.co.jp', 'ja.wikipedia.org']
// クエリにこのいずれも含まれなければ「デュエル・マスターズ」を付与し、無関係サイトの混入を防ぐ。
const DM_KEYWORDS = ['デュエル・マスターズ', 'デュエルマスターズ', 'デュエマ']
// クエリの末尾に付与する時代限定語。現行環境の新カード・ルールがヒットしないよう、
// クラシック08/05（DM-01〜DM-30、2002〜2008年）の対象期間に検索を絞り込む。
const ERA_SCOPE = 'クラシック 2008年以前'

export interface WebSearchResult {
  sources: { title: string; url: string }[]
  context: string
}

interface TavilyResultLike {
  title?: string
  url?: string
  content?: string
}

// クラシック08/05の対象期間（2002〜2008年、DM-01〜DM-30）。
const ERA_MIN_YEAR = 2002
const ERA_MAX_YEAR = 2008
// title/content 中の西暦表記（例: 「2024年」）。
const YEAR_PATTERN = /20\d{2}(?=年)/g
// DM-31以降（2009年以降）で使われ始めた2桁年プレフィックス型番（例: dm24rp4, dm26ex1）。
// DM-01〜DM-30時代の単純な dm-?\d{2}(-\d+)? 型番とは異なる命名規則。
const NEW_CARD_NUMBER_PATTERN = /dm\d{2}(rp|ex|sd|bd|gp|cs)\d*/i

// Tavily検索結果が「対象期間外（2009年以降 or 2001年以前の話題）」と判定できるかを機械的にチェックする。
// 判定材料が無い場合は対象期間外と断定しない（過剰フィルタでdmwiki.net等の正当な情報が消えるのを避ける）。
export function isOutOfEraResult(result: TavilyResultLike): boolean {
  const text = `${result.title ?? ''}\n${result.content ?? ''}`
  const years = text.match(YEAR_PATTERN)
  if (years) {
    const hasOutOfEraYear = years.some(y => {
      const year = parseInt(y, 10)
      return year < ERA_MIN_YEAR || year > ERA_MAX_YEAR
    })
    if (hasOutOfEraYear) return true
  }
  if (result.url && NEW_CARD_NUMBER_PATTERN.test(result.url)) return true
  return false
}

// 対象期間外と判定された結果を除外する。
function filterEraResults<T extends TavilyResultLike>(results: T[]): T[] {
  return results.filter(r => !isOutOfEraResult(r))
}

// 検索フォールバックが有効か（APIキーが設定されているか）。
export function searchEnabled(apiKey: string = API_KEY): boolean {
  return Boolean(apiKey)
}

// 環境変数 SEARCH_INCLUDE_DOMAINS があればそれを、無ければ既定の信頼ドメインを返す（呼び出しごとに評価）。
function includeDomains(): string[] {
  const env = process.env['SEARCH_INCLUDE_DOMAINS']
  if (env != null && env.trim() !== '') return env.split(',').map(s => s.trim()).filter(Boolean)
  return DEFAULT_INCLUDE_DOMAINS
}

// DM関連語を含まない質問はクエリ先頭に「デュエル・マスターズ」を付ける。
// さらに、時代を絞る語（ERA_SCOPE）を末尾に付与し、現行環境の情報がヒットしにくいクエリにする。
function augmentQuery(query: string): string {
  const withDm = DM_KEYWORDS.some(k => query.includes(k)) ? query : `デュエル・マスターズ ${query}`
  return `${withDm} ${ERA_SCOPE}`
}

// Tavily を1回叩いて結果を整形する。エラー・0件は null（呼び出し側で再検索/フォールバック判断）。
async function runSearch(
  f: FetchLike,
  apiKey: string,
  query: string,
  opts: { maxResults?: number; signal?: AbortSignal },
  domains: string[],
): Promise<WebSearchResult | null> {
  try {
    const body: Record<string, unknown> = {
      api_key: apiKey,
      query,
      max_results: opts.maxResults ?? DEFAULT_MAX,
      search_depth: 'basic',
      include_answer: true, // 検索結果をLLM向けに要約した文字列。回答精度が上がる。
    }
    if (domains.length) body['include_domains'] = domains
    const res = await f(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    })
    if (!res.ok) return null
    const j = await res.json() as { answer?: string; results?: { title?: string; url?: string; content?: string }[] }
    const rawResults = Array.isArray(j.results) ? j.results : []
    const results = filterEraResults(rawResults)
    const sources = results
      .map(r => ({ title: String(r.title ?? r.url ?? ''), url: String(r.url ?? '') }))
      .filter(s => s.url)
    if (!sources.length) return null
    const snippets = results
      .map((r, i) => `[${i + 1}] ${r.title ?? ''}\n${r.content ?? ''}\n出典: ${r.url ?? ''}`)
      .join('\n\n')
    const rawAnswer = typeof j.answer === 'string' ? j.answer.trim() : ''
    // Tavily の要約（answer）は個別 results とは別に横断生成されるため、results側のフィルタが
    // 効かない独立した混入経路になる。同じ年代判定をかけて対象期間外なら使わない。
    const answer = rawAnswer && !isOutOfEraResult({ content: rawAnswer }) ? rawAnswer : ''
    // Tavily の要約を先頭に置くと、薄いスニペットでもモデルが要点を拾いやすい。
    const context = (answer ? `検索エンジンによる要約:\n${answer}\n\n---\n` : '') + snippets
    return { sources, context }
  } catch {
    return null
  }
}

// 失敗時・キー未設定時は null を返す（呼び出し側は通常のDB回答にフォールバックする）。
// クエリをDM関連に増強し、まず信頼ドメインで検索、0件なら制限なしで再検索する。
export async function webSearch(
  query: string,
  opts: { apiKey?: string; maxResults?: number; fetchImpl?: FetchLike; signal?: AbortSignal } = {},
): Promise<WebSearchResult | null> {
  const apiKey = opts.apiKey ?? API_KEY
  if (!apiKey) return null
  const f = opts.fetchImpl ?? (globalThis.fetch as FetchLike)
  const q = augmentQuery(query)
  const domains = includeDomains()
  const first = await runSearch(f, apiKey, q, opts, domains)
  if (first) return first
  // 信頼ドメインで拾えなかった場合のみ、ドメイン制限を外して再検索（クエリ増強は維持）。
  if (domains.length) return runSearch(f, apiKey, q, opts, [])
  return null
}
