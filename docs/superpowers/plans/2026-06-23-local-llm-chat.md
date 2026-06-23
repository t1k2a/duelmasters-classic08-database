# ローカルLLM対話機能 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** デュエマクラシックに関する質問へ、ローカルOllama＋カードDBのRAGで「事実相違ゼロ」の回答を返す対話機能を、公開サイト（GitHub Pages）→ngrok→自宅Ollamaの構成で追加する。

**Architecture:** Postgres非依存の新Honoサーバ（`src/chat/`）が `public/*.json` と `knowledge/*.md` をロードし、質問からRAGで根拠を抽出→厳格プロンプト→Ollama `/api/chat`(NDJSON stream)を中継。カード事実はLLMに生成させずDB実値を構造化返却し、フロント（`public/index.html`）が `fetch`+`ReadableStream` で受信描画する。

**Tech Stack:** TypeScript / tsx / Hono / Node組み込み `node:test`＋`node:assert` / Ollama(qwen2.5:7b) / ngrok / バニラJS（フロント）

## Global Constraints

- ランタイム: Node v20系 / `type: module`（ESM）。実行は `tsx`。インポートは `.js` 拡張子（既存 `src/api` に倣う）。
- 新規ユニット/コントラクトテストは **`node:test` + `node:assert`**（新規依存を足さない）。実行: `npx tsx --test src/chat/<file>.test.ts`。
- チャットサーバは **Prisma/PostgreSQL を一切importしない**（`public/*.json` を直接読む）。
- データ参照元（読み取り専用）: `public/cards.json`・`public/data/recipes.json`・`public/data/meta-decks.json`・`public/data/hall-of-fame.json`・`knowledge/*.md`。
- 厳格モード: 文脈外は「このDBには情報がありません」。カード数値・能力テキストはLLMに生成させない。
- CORS許可オリジン: `https://t1k2a.github.io`（＋ dev `http://localhost:3000`）。
- フロントのAPIアクセスは全リクエストに `ngrok-skip-browser-warning: true` ヘッダを付与。ストリーム受信は `fetch`+`ReadableStream`（EventSource不可）。
- LLM温度: 0.1。モデル名は環境変数 `OLLAMA_MODEL`（既定 `qwen2.5:7b`）。
- 既存ファイルの無関係なリファクタは行わない。

---

## ファイル構成

```
src/chat/
  types.ts        — 共有型（Card, Recipe, RetrievalResult, ChatRequest 等）
  corpus.ts       — public/*.json + knowledge/*.md をロード・索引
  normalize.ts    — かな正規化（既存クライアント検索と同等の正規化）
  retriever.ts    — RAG: カード名一致・フィルタ解釈・レシピ/メタ/知識抽出
  prompt.ts       — 厳格システム＋文脈＋履歴 → messages配列
  ollama.ts       — Ollama /api/chat(stream) 呼び出し、NDJSON逐次パース
  queue.ts        — single-flight直列化＋IPレート制限
  server.ts       — Hono: /api/chat(SSE), /api/health, CORS, タイムアウト
  *.test.ts       — 各ユニット/コントラクトテスト
knowledge/
  terms.md        — 用語（ブロッカー等）
  environments.md — 05/08環境・殿堂の解説
public/index.html — チャットUI追加（modify）
package.json      — scripts に chat/test:chat 追加（modify）
```

---

### Task 1: 共有型 と かな正規化

**Files:**
- Create: `src/chat/types.ts`
- Create: `src/chat/normalize.ts`
- Test: `src/chat/normalize.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `interface CardData { id:string; name:string; cardType:string; cost:number|null; power:number|null; civilizations:string[]; races:string[]; rarity:string|null; text:string|null; printings:{setCode:string;cardNumber:string;rarity?:string}[]; setsContaining?:string[] }`
  - `types.ts`: `interface RecipeData { id:string; name?:string; cards:{id:string;count:number}[]; validated?:boolean; [k:string]:unknown }`
  - `types.ts`: `interface RetrievalResult { cards: CardData[]; recipes: RecipeData[]; meta: string[]; knowledge: string[] }`
  - `types.ts`: `interface ChatTurn { role:'user'|'assistant'; content:string }`
  - `normalize.ts`: `function normalizeKana(s: string): string`（全角カタカナ→ひらがな、長音/中黒/空白除去、小文字化）

- [ ] **Step 1: Write failing test**

```ts
// src/chat/normalize.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeKana } from './normalize.js'

test('カタカナ→ひらがな・記号除去で同一化', () => {
  assert.equal(normalizeKana('ボルメテウス'), normalizeKana('ぼるめてうす'))
  assert.equal(normalizeKana('ヘブンズ・ゲート'), normalizeKana('へぶんずげーと'))
  assert.equal(normalizeKana('Ｓ・トリガー'), normalizeKana('sとりがー'))
})
```

- [ ] **Step 2: Run test, verify fails**

Run: `npx tsx --test src/chat/normalize.test.ts`
Expected: FAIL（`Cannot find module './normalize.js'`）

- [ ] **Step 3: Implement types.ts と normalize.ts**

```ts
// src/chat/types.ts
export interface CardData {
  id: string; name: string; cardType: string;
  cost: number | null; power: number | null;
  civilizations: string[]; races: string[];
  rarity: string | null; text: string | null;
  printings: { setCode: string; cardNumber: string; rarity?: string }[];
  setsContaining?: string[];
}
export interface RecipeData { id: string; name?: string; cards: { id: string; count: number }[]; validated?: boolean; [k: string]: unknown }
export interface RetrievalResult { cards: CardData[]; recipes: RecipeData[]; meta: string[]; knowledge: string[] }
export interface ChatTurn { role: 'user' | 'assistant'; content: string }
```

```ts
// src/chat/normalize.ts
export function normalizeKana(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60)) // カタカナ→ひらがな
    .replace(/[・･\sー\-—–]/g, '') // 中黒・長音・空白・ハイフン除去
    .toLowerCase()
}
```

- [ ] **Step 4: Run test, verify passes**

Run: `npx tsx --test src/chat/normalize.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/chat/types.ts src/chat/normalize.ts src/chat/normalize.test.ts
git commit -m "feat(chat): 共有型とかな正規化ユーティリティ"
```

---

### Task 2: corpus ローダ

**Files:**
- Create: `src/chat/corpus.ts`
- Create: `knowledge/terms.md`, `knowledge/environments.md`
- Test: `src/chat/corpus.test.ts`

**Interfaces:**
- Consumes: `types.ts`（CardData, RecipeData）
- Produces: `corpus.ts`:
  - `interface Corpus { cards: CardData[]; recipes: RecipeData[]; meta: string[]; knowledge: { title:string; body:string }[]; cardById: Map<string,CardData> }`
  - `async function loadCorpus(rootDir?: string): Promise<Corpus>`（既定rootは process.cwd()）

- [ ] **Step 1: 初期 knowledge ファイルを作成**

`knowledge/terms.md`（最小例。Markdownの`##`見出し単位で1ナレッジ）:

```markdown
## ブロッカー
相手クリーチャーが攻撃するとき、このクリーチャーをタップしてその攻撃を阻止できる能力。阻止後はそのクリーチャーとバトルする。

## シールド・トリガー
シールドをブレイクされて手札に加わる際、そのカードを即座に使用できる能力。

## 殿堂レギュレーション
強力カードの使用枚数を制限する制度。殿堂🏅=各1枚まで。プレミアム殿堂🚫=使用禁止。
```

`knowledge/environments.md`:

```markdown
## クラシック05とクラシック08の違い
クラシック05は初版が2005年末まで（拡張パックDM-01〜DM-16）のカードが使用可能なファンフォーマット。クラシック08はDM-30（2008-12）までを範囲とする。08の方がカードプールが広い。
```

- [ ] **Step 2: Write failing test**

```ts
// src/chat/corpus.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCorpus } from './corpus.js'

test('corpusがカード・知識をロードする', async () => {
  const c = await loadCorpus()
  assert.ok(c.cards.length > 2000, 'カードが2000枚超')
  assert.ok(c.cardById.get('dm01-001'), 'idで引ける')
  assert.ok(c.knowledge.some(k => k.title.includes('ブロッカー')), '知識ロード')
})
```

- [ ] **Step 3: Run test, verify fails**

Run: `npx tsx --test src/chat/corpus.test.ts`
Expected: FAIL（モジュール無し）

- [ ] **Step 4: Implement corpus.ts**

```ts
// src/chat/corpus.ts
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { CardData, RecipeData } from './types.js'

export interface Corpus {
  cards: CardData[]; recipes: RecipeData[]; meta: string[];
  knowledge: { title: string; body: string }[];
  cardById: Map<string, CardData>;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, 'utf-8')) as T } catch { return fallback }
}

function splitMarkdown(md: string): { title: string; body: string }[] {
  const out: { title: string; body: string }[] = []
  for (const block of md.split(/^##\s+/m).slice(1)) {
    const nl = block.indexOf('\n')
    out.push({ title: block.slice(0, nl).trim(), body: block.slice(nl + 1).trim() })
  }
  return out
}

export async function loadCorpus(rootDir: string = process.cwd()): Promise<Corpus> {
  const cards = await readJson<CardData[]>(join(rootDir, 'public/cards.json'), [])
  const recipes = await readJson<RecipeData[]>(join(rootDir, 'public/data/recipes.json'), [])
  const metaRaw = await readJson<unknown[]>(join(rootDir, 'public/data/meta-decks.json'), [])
  const meta = metaRaw.map(m => JSON.stringify(m))
  let knowledge: { title: string; body: string }[] = []
  try {
    const dir = join(rootDir, 'knowledge')
    for (const f of await readdir(dir)) {
      if (f.endsWith('.md')) knowledge = knowledge.concat(splitMarkdown(await readFile(join(dir, f), 'utf-8')))
    }
  } catch { /* knowledge無しでも動作 */ }
  const cardById = new Map(cards.map(c => [c.id, c]))
  return { cards, recipes, meta, knowledge, cardById }
}
```

- [ ] **Step 5: Run test, verify passes; Commit**

Run: `npx tsx --test src/chat/corpus.test.ts` → PASS

```bash
git add src/chat/corpus.ts src/chat/corpus.test.ts knowledge/
git commit -m "feat(chat): corpusローダと初期knowledge"
```

---

### Task 3: retriever（RAG第1段＝語彙/構造化）

**Files:**
- Create: `src/chat/retriever.ts`
- Test: `src/chat/retriever.test.ts`

**Interfaces:**
- Consumes: `corpus.ts`（Corpus）, `normalize.ts`（normalizeKana）, `types.ts`
- Produces: `retriever.ts`:
  - `function retrieve(corpus: Corpus, question: string): RetrievalResult`
  - 規則: (a) 質問内に出現するカード名（normalizeKana部分一致, 2文字以上）を最大8件抽出。(b) 文明語（光/水/闇/火/自然）＋「ブロッカー」等の語が含まれればそのフィルタに合うカードを補助的に最大8件。(c) カード名/メタ名がヒットしたら関連レシピ（そのカードidを含むvalidated優先）最大3件。(d) knowledgeはタイトルのnormalizeKana部分一致で最大3件。

- [ ] **Step 1: Write failing test**

```ts
// src/chat/retriever.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCorpus } from './corpus.js'
import { retrieve } from './retriever.js'

test('カード名を含む質問でそのカードを抽出', async () => {
  const c = await loadCorpus()
  const r = retrieve(c, 'ボルメテウス・ホワイト・ドラゴンの能力は？')
  assert.ok(r.cards.some(x => x.name.includes('ボルメテウス')), '該当カード抽出')
})

test('用語質問でknowledgeを抽出', async () => {
  const c = await loadCorpus()
  const r = retrieve(c, 'ブロッカーって何？')
  assert.ok(r.knowledge.some(k => k.includes('ブロッカー')), '知識抽出')
})

test('DB外の語では空に近い結果', async () => {
  const c = await loadCorpus()
  const r = retrieve(c, '令和の最新カードについて')
  assert.equal(r.cards.length, 0)
})
```

- [ ] **Step 2: Run test, verify fails**

Run: `npx tsx --test src/chat/retriever.test.ts` → FAIL

- [ ] **Step 3: Implement retriever.ts**

```ts
// src/chat/retriever.ts
import type { Corpus } from './corpus.js'
import type { RetrievalResult, CardData } from './types.js'
import { normalizeKana } from './normalize.js'

const CIVS = ['光', '水', '闇', '火', '自然']

export function retrieve(corpus: Corpus, question: string): RetrievalResult {
  const qn = normalizeKana(question)
  // (a) カード名一致
  const named: CardData[] = []
  for (const card of corpus.cards) {
    const nn = normalizeKana(card.name)
    if (nn.length >= 2 && qn.includes(nn)) { named.push(card); if (named.length >= 8) break }
  }
  // (b) 文明＋キーワード補助
  const civHit = CIVS.filter(c => question.includes(c))
  const kwBlocker = question.includes('ブロッカー')
  const aux: CardData[] = []
  if ((civHit.length || kwBlocker) && named.length < 8) {
    for (const card of corpus.cards) {
      if (named.includes(card)) continue
      const civOk = civHit.length ? civHit.some(c => card.civilizations.includes(c)) : true
      const kwOk = kwBlocker ? (card.text ?? '').includes('ブロッカー') : true
      if (civHit.length && !civOk) continue
      if (kwBlocker && !kwOk) continue
      if (!civHit.length && !kwBlocker) continue
      aux.push(card); if (named.length + aux.length >= 8) break
    }
  }
  const cards = [...named, ...aux]
  // (c) 関連レシピ
  const idSet = new Set(cards.map(c => c.id))
  const recipes = corpus.recipes
    .filter(r => Array.isArray(r.cards) && r.cards.some(rc => idSet.has(rc.id)))
    .sort((a, b) => Number(b.validated) - Number(a.validated))
    .slice(0, 3)
  // (d) knowledge
  const knowledge = corpus.knowledge
    .filter(k => qn.includes(normalizeKana(k.title)) || normalizeKana(k.title).split('').length === 0)
    .filter(k => qn.includes(normalizeKana(k.title)))
    .slice(0, 3)
    .map(k => `${k.title}: ${k.body}`)
  // (meta) アーキタイプ名がそのまま質問に含まれるもの
  const meta = corpus.meta.filter(m => {
    try { const o = JSON.parse(m); return o?.name && question.includes(o.name) } catch { return false }
  }).slice(0, 2)
  return { cards, recipes, meta, knowledge }
}
```

- [ ] **Step 4: Run test, verify passes; Commit**

Run: `npx tsx --test src/chat/retriever.test.ts` → PASS

```bash
git add src/chat/retriever.ts src/chat/retriever.test.ts
git commit -m "feat(chat): RAG retriever（語彙/構造化抽出）"
```

---

### Task 4: prompt ビルダー（厳格グラウンディング）

**Files:**
- Create: `src/chat/prompt.ts`
- Test: `src/chat/prompt.test.ts`

**Interfaces:**
- Consumes: `types.ts`（RetrievalResult, ChatTurn）
- Produces: `prompt.ts`:
  - `function buildMessages(input: { question: string; retrieval: RetrievalResult; history: ChatTurn[] }): { role:string; content:string }[]`
  - 先頭が厳格system、続いて直近履歴(最大3往復=6メッセージ)、最後にcontext+質問のuser。

- [ ] **Step 1: Write failing test**

```ts
// src/chat/prompt.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMessages } from './prompt.js'

test('systemに厳格指示・contextにカード名が入る', () => {
  const msgs = buildMessages({
    question: 'ボルメテウスは？',
    retrieval: { cards: [{ id:'x', name:'ボルメテウス・ホワイト・ドラゴン', cardType:'クリーチャー', cost:6, power:5000, civilizations:['火','水'], races:['アーマード・ドラゴン'], rarity:'VR', text:'…', printings:[] }], recipes: [], meta: [], knowledge: [] },
    history: [],
  })
  assert.equal(msgs[0].role, 'system')
  assert.match(msgs[0].content, /情報がありません|創作しない|文脈/)
  assert.match(msgs[msgs.length-1].content, /ボルメテウス/)
})

test('履歴は直近3往復に制限', () => {
  const history = Array.from({length: 10}, (_,i) => ({ role: (i%2?'assistant':'user') as const, content: `m${i}` }))
  const msgs = buildMessages({ question:'q', retrieval:{cards:[],recipes:[],meta:[],knowledge:[]}, history })
  // system + 6(履歴) + 1(質問) = 8
  assert.equal(msgs.length, 8)
})
```

- [ ] **Step 2: Run test, verify fails** → `npx tsx --test src/chat/prompt.test.ts` → FAIL

- [ ] **Step 3: Implement prompt.ts**

```ts
// src/chat/prompt.ts
import type { RetrievalResult, ChatTurn } from './types.js'

const SYSTEM = `あなたはデュエル・マスターズ「クラシック08環境」の対話アシスタントです。
厳守事項:
- 回答は「以下の参考情報(context)」に書かれていることだけを根拠にする。
- contextに無い事実・カードの数値・能力テキストは創作しない。分からなければ「このDBには情報がありません」と答える。
- カードのコストやパワーなどの数値は、あなたが書かず「《カード名》」で参照するに留める（数値は別途表示される）。
- 一般知識や2008年以降の新カードは扱わない。
- 日本語で簡潔に。デッキ相談では参考レシピを踏まえて助言する。`

function renderContext(r: RetrievalResult): string {
  const parts: string[] = []
  if (r.cards.length) parts.push('## カード\n' + r.cards.map(c =>
    `- 《${c.name}》 ${c.cardType} / 文明:${c.civilizations.join('')} / コスト:${c.cost ?? '—'} / パワー:${c.power ?? '—'} / 種族:${c.races.join('・') || '—'}\n  ${c.text ?? ''}`).join('\n'))
  if (r.meta.length) parts.push('## メタデッキ\n' + r.meta.join('\n'))
  if (r.recipes.length) parts.push('## 参考レシピ\n' + r.recipes.map(x => `- ${x.name ?? x.id}（${x.cards?.length ?? 0}種）`).join('\n'))
  if (r.knowledge.length) parts.push('## 用語/ルール\n' + r.knowledge.join('\n'))
  if (!parts.length) return '(参考情報なし)'
  return parts.join('\n\n')
}

export function buildMessages(input: { question: string; retrieval: RetrievalResult; history: ChatTurn[] }) {
  const recent = input.history.slice(-6)
  return [
    { role: 'system', content: SYSTEM },
    ...recent.map(t => ({ role: t.role, content: t.content })),
    { role: 'user', content: `参考情報:\n${renderContext(input.retrieval)}\n\n質問: ${input.question}` },
  ]
}
```

- [ ] **Step 4: Run test, verify passes; Commit**

Run: `npx tsx --test src/chat/prompt.test.ts` → PASS

```bash
git add src/chat/prompt.ts src/chat/prompt.test.ts
git commit -m "feat(chat): 厳格グラウンディングのprompt builder"
```

---

### Task 5: ollama クライアント（ストリーム＋スタブ可能）

**Files:**
- Create: `src/chat/ollama.ts`
- Test: `src/chat/ollama.test.ts`

**Interfaces:**
- Produces: `ollama.ts`:
  - `type FetchLike = (url: string, init?: any) => Promise<Response>`
  - `async function* streamChat(messages: {role:string;content:string}[], opts?: { model?:string; baseUrl?:string; temperature?:number; fetchImpl?: FetchLike; signal?: AbortSignal }): AsyncGenerator<string>`
  - Ollama `/api/chat`(stream:true) のNDJSONを行ごとにパースし `message.content` を yield。`fetchImpl` 注入でテスト可能。
  - `async function isOllamaUp(opts?:{baseUrl?:string;model?:string;fetchImpl?:FetchLike}): Promise<{up:boolean; model:string}>`

- [ ] **Step 1: Write failing test（fetchをスタブ）**

```ts
// src/chat/ollama.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { streamChat } from './ollama.js'

function ndjsonResponse(lines: object[]): Response {
  const body = lines.map(o => JSON.stringify(o)).join('\n') + '\n'
  return new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson' } })
}

test('NDJSONストリームからcontentを連結yield', async () => {
  const fake = async () => ndjsonResponse([
    { message: { content: 'ボル' }, done: false },
    { message: { content: 'メテウス' }, done: false },
    { done: true },
  ])
  const out: string[] = []
  for await (const tok of streamChat([{role:'user',content:'x'}], { fetchImpl: fake as any })) out.push(tok)
  assert.equal(out.join(''), 'ボルメテウス')
})
```

- [ ] **Step 2: Run test, verify fails** → `npx tsx --test src/chat/ollama.test.ts` → FAIL

- [ ] **Step 3: Implement ollama.ts**

```ts
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
```

- [ ] **Step 4: Run test, verify passes; Commit**

Run: `npx tsx --test src/chat/ollama.test.ts` → PASS

```bash
git add src/chat/ollama.ts src/chat/ollama.test.ts
git commit -m "feat(chat): Ollama /api/chat ストリームクライアント（fetch注入可）"
```

---

### Task 6: queue（直列化＋レート制限）

**Files:**
- Create: `src/chat/queue.ts`
- Test: `src/chat/queue.test.ts`

**Interfaces:**
- Produces: `queue.ts`:
  - `class SingleFlightQueue { constructor(maxWaiting:number); get depth():number; run<T>(fn:()=>Promise<T>):Promise<T> }`（同時1件、待ち上限超過は `throw new Error('BUSY')`）
  - `class RateLimiter { constructor(perMin:number); allow(ip:string, now?:number):boolean }`

- [ ] **Step 1: Write failing test**

```ts
// src/chat/queue.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SingleFlightQueue, RateLimiter } from './queue.js'

test('直列化: 同時実行は1件、超過待ちはBUSY', async () => {
  const q = new SingleFlightQueue(1)
  let release: () => void
  const p1 = q.run(() => new Promise<void>(r => { release = r }))
  const p2 = q.run(async () => {}) // 待ち1
  await assert.rejects(q.run(async () => {}), /BUSY/) // 待ち上限超過
  release!(); await p1; await p2
})

test('レート制限: perMin超でfalse', () => {
  const rl = new RateLimiter(2)
  assert.equal(rl.allow('a', 0), true)
  assert.equal(rl.allow('a', 0), true)
  assert.equal(rl.allow('a', 0), false)
})
```

- [ ] **Step 2: Run test, verify fails** → FAIL

- [ ] **Step 3: Implement queue.ts**

```ts
// src/chat/queue.ts
export class SingleFlightQueue {
  private running = false
  private waiting: { fn: () => Promise<unknown>; resolve: (v:any)=>void; reject:(e:any)=>void }[] = []
  constructor(private maxWaiting = 5) {}
  get depth() { return this.waiting.length + (this.running ? 1 : 0) }
  run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running && this.waiting.length >= this.maxWaiting) return Promise.reject(new Error('BUSY'))
    return new Promise<T>((resolve, reject) => { this.waiting.push({ fn, resolve, reject }); this.pump() })
  }
  private async pump() {
    if (this.running) return
    const next = this.waiting.shift(); if (!next) return
    this.running = true
    try { next.resolve(await next.fn()) } catch (e) { next.reject(e) }
    finally { this.running = false; this.pump() }
  }
}

export class RateLimiter {
  private hits = new Map<string, number[]>()
  constructor(private perMin = 10) {}
  allow(ip: string, now = Date.now()): boolean {
    const win = now - 60_000
    const arr = (this.hits.get(ip) ?? []).filter(t => t > win)
    if (arr.length >= this.perMin) { this.hits.set(ip, arr); return false }
    arr.push(now); this.hits.set(ip, arr); return true
  }
}
```

- [ ] **Step 4: Run test, verify passes; Commit**

Run: `npx tsx --test src/chat/queue.test.ts` → PASS

```bash
git add src/chat/queue.ts src/chat/queue.test.ts
git commit -m "feat(chat): 直列化キューとIPレート制限"
```

---

### Task 7: Hono サーバ（/api/health, /api/chat, CORS）＋ スクリプト登録

**Files:**
- Create: `src/chat/server.ts`
- Modify: `package.json`（scripts に追加）
- Test: `src/chat/server.test.ts`

**Interfaces:**
- Consumes: corpus, retriever, prompt, ollama(streamChat,isOllamaUp), queue
- Produces: `server.ts`:
  - `function createApp(deps: { corpus: Corpus; chatImpl?: typeof streamChat; upImpl?: typeof isOllamaUp }): Hono`（テスト用に注入可能。`app.fetch` で直接叩ける）
  - ルート: `GET /api/health` → `{ status, model, up, depth }`。`POST /api/chat` body `{ question:string; history?:ChatTurn[] }` → `text/event-stream`（`data: {"token":"..."}` 行、最後に `data: {"cards":[...],"recipes":[...],"done":true}`）。CORS/OPTIONS対応。

- [ ] **Step 1: Write failing test（streamChatをスタブ）**

```ts
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
```

- [ ] **Step 2: Run test, verify fails** → FAIL

- [ ] **Step 3: Implement server.ts**

```ts
// src/chat/server.ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { streamSSE } from 'hono/streaming'
import type { Corpus } from './corpus.js'
import { loadCorpus } from './corpus.js'
import { retrieve } from './retriever.js'
import { buildMessages } from './prompt.js'
import { streamChat, isOllamaUp } from './ollama.js'
import { SingleFlightQueue, RateLimiter } from './queue.js'
import type { ChatTurn } from './types.js'

const ALLOW = new Set(['https://t1k2a.github.io', 'http://localhost:3000'])
const TIMEOUT_MS = 60_000

export function createApp(deps: { corpus: Corpus; chatImpl?: typeof streamChat; upImpl?: typeof isOllamaUp }): Hono {
  const app = new Hono()
  const chat = deps.chatImpl ?? streamChat
  const up = deps.upImpl ?? isOllamaUp
  const queue = new SingleFlightQueue(5)
  const rl = new RateLimiter(10)

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
    return c.json({ status: 'ok', up: s.up, model: s.model, depth: queue.depth })
  })

  app.post('/api/chat', async (c) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
    if (!rl.allow(ip)) return c.json({ error: 'RATE_LIMIT' }, 429)
    let body: { question?: string; history?: ChatTurn[] }
    try { body = await c.req.json() } catch { return c.json({ error: 'BAD_INPUT' }, 400) }
    const question = (body.question ?? '').trim()
    if (!question || question.length > 500) return c.json({ error: 'BAD_INPUT' }, 400)
    const retrieval = retrieve(deps.corpus, question)
    const messages = buildMessages({ question, retrieval, history: body.history ?? [] })

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
        await stream.writeSSE({ data: JSON.stringify({ done: true, cards: retrieval.cards, recipes: retrieval.recipes.map(r => ({ id: r.id, name: r.name })) }) })
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
  const port = parseInt(process.env['CHAT_PORT'] ?? '8788')
  console.log(`Chat server on http://localhost:${port}`)
  serve({ fetch: app.fetch, port })
}
```

- [ ] **Step 4: package.json に scripts 追加**

`"scripts"` に:
```json
"chat": "tsx src/chat/server.ts",
"test:chat": "tsx --test src/chat/*.test.ts"
```

- [ ] **Step 5: Run test, verify passes; Commit**

Run: `npx tsx --test src/chat/server.test.ts` → PASS（全体は `npm run test:chat`）

```bash
git add src/chat/server.ts src/chat/server.test.ts package.json
git commit -m "feat(chat): Honoチャットサーバ（health/chat SSE/CORS/queue）"
```

---

### Task 8: フロント チャットUI（public/index.html）

**Files:**
- Modify: `public/index.html`（チャットFAB＋ボトムシート＋JS）
- Test: `scripts/e2e-chat.mjs`（Playwright、health/chatをモック）

**Interfaces:**
- Consumes: `/api/health`・`/api/chat`（SSE）
- Produces（フロント内部）: `CHAT_API_BASE` 定数、`chatAsk(question)`、`renderCardCard(card)`、`pollChatHealth()`。

- [ ] **Step 1: index.html に定数とUI追加**

`<head>` 付近のスクリプト先頭に:
```js
const CHAT_API_BASE = 'https://YOUR-DOMAIN.ngrok-free.app'; // ← ngrok固定ドメインに差し替え
const CHAT_HEADERS = { 'ngrok-skip-browser-warning': 'true' };
```

デッキFAB付近に「💬 AIに聞く」ボタン（既定 hidden）、`#chatSheet` ボトムシート（メッセージ一覧 `#chatLog`、入力 `#chatInput`、送信、リセット、入力例チップ）を、既存 `#deckPanel` のスタイルに合わせて追加する。

- [ ] **Step 2: health 生死判定**

```js
async function pollChatHealth() {
  try {
    const r = await fetch(CHAT_API_BASE + '/api/health', { headers: CHAT_HEADERS });
    const j = await r.json();
    document.getElementById('chatFab').classList.toggle('hidden', !j.up);
  } catch { document.getElementById('chatFab').classList.add('hidden'); }
}
window.addEventListener('load', pollChatHealth);
```

- [ ] **Step 3: chatAsk（fetch+ReadableStreamでSSE受信）**

```js
async function chatAsk(question, history) {
  const res = await fetch(CHAT_API_BASE + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...CHAT_HEADERS },
    body: JSON.stringify({ question, history }),
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', assistant = '', final = null;
  const bubble = appendAssistantBubble();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const ev = JSON.parse(line.slice(5).trim());
      if (ev.token) { assistant += ev.token; bubble.textContent = assistant; }
      if (ev.done) final = ev;
    }
  }
  if (final?.cards?.length) renderCardCards(bubble, final.cards);
  if (final?.error) bubble.textContent = chatErrorMessage(final.error);
  return assistant;
}
```

`chatErrorMessage(code)` は BUSY→「混んでいます。少し待って…」/ RATE_LIMIT→「少し待ってから…」/ それ以外→「今は使えません」。

- [ ] **Step 4: Playwright E2E（health/chatをモック）**

`scripts/e2e-chat.mjs`: `page.route(CHAT_API_BASE + '/api/health', ...)` で `{up:true}` を返し、`/api/chat` で擬似SSE本文を返す。検証: FAB表示、シート開閉、token逐次描画、カードカード描画、health down時にFAB非表示。

- [ ] **Step 5: 実行・コミット**

Run: `node scripts/e2e-chat.mjs`（PLAYWRIGHT_BROWSERS_PATH を既存e2eに合わせる）
Expected: 全ケースPass

```bash
git add public/index.html scripts/e2e-chat.mjs
git commit -m "feat(chat): フロント チャットUI（health/ストリーミング/カードカード）"
```

---

### Task 9: 起動手順ドキュメント＋精度スモーク

**Files:**
- Modify: `README.md`（チャット機能の起動手順）
- Create: `scripts/chat-smoke.mjs`（実Ollama必須・手動）

**Interfaces:** —

- [ ] **Step 1: README に「AIアシスタント（ローカルLLM）」節を追記**

3手順（`ollama serve` ＋ `ollama pull qwen2.5:7b` / `npm run chat` / `ngrok http --url=<固定> 8788`）、`CHAT_API_BASE` の差し替え、無料枠制限・マシン停止＝自動オフラインの注記。

- [ ] **Step 2: 精度スモーク（手動・実Ollama）**

`scripts/chat-smoke.mjs`: ゴールデン質問配列（例「ボルメテウス・ホワイト・ドラゴンの能力は？」「ブロッカーって何？」「08に無い令和カードある？」）を実サーバへ投げ、(a)カード事実応答に含まれる根拠cardsがDB値と一致、(b)DB外質問で「情報がありません」系、を目視＋簡易assert。CIには含めない（実LLM依存）。

- [ ] **Step 3: Commit**

```bash
git add README.md scripts/chat-smoke.mjs
git commit -m "docs(chat): 起動手順と精度スモーク"
```

---

## Self-Review（spec照合）

- §2 構成: Task2(corpus)/3(retriever)/4(prompt)/5(ollama)/7(server) で被覆。Postgres非依存=corpusがfs読みのみ ✓
- §3 相違ゼロ3本柱: ①カード事実はserverが`retrieval.cards`を構造化返却・フロントがカードカード描画(Task7/8)、②厳格system(Task4)、③根拠cards/recipes返却(Task7) ✓
- §4 knowledge新設: Task2 ✓ / RAG第1段: Task3 ✓（第2段=YAGNIで非スコープ）
- §6 UX: FAB/シート/health/ストリーミング/カードカード=Task8、軽いマルチターン(直近3往復)=Task4 ✓
- §7 安全: 直列化/レート/タイムアウト/CORS/ngrokヘッダ=Task6/7/8 ✓
- §8 エラー: BUSY/RATE_LIMIT/タイムアウト/health down=Task7/8 ✓
- §9 テスト: ユニット(1-6)/コントラクト(7)/Playwright(8)/精度スモーク(9) ✓
- 型整合: CardData/RetrievalResult/ChatTurn は Task1 定義を 3/4/7 で一貫使用 ✓

**実Ollama/ngrok依存でユーザー対応が必要な箇所**: Task8の`CHAT_API_BASE`差し替え、Task9のpull/ngrok起動と精度スモーク実行。それ以外（Task1-7のユニット/コントラクト、Task8のロジック/モックE2E）はローカルで検証可能。
