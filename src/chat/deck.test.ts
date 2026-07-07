// src/chat/deck.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCorpus } from './corpus.js'
import type { Corpus } from './corpus.js'
import { retrieve } from './retriever.js'
import { detectDeckIntent, selectDeck } from './deck.js'
import type { CardData, RecipeData, RetrievalResult } from './types.js'

// --- 合成コーパスヘルパ（除外/同点決定性を決定的に検証するため） ---
function card(id: string, name: string, cost = 3, civ: string[] = ['光']): CardData {
  return { id, name, cardType: 'クリーチャー', cost, power: 1000, civilizations: civ, races: [], rarity: null, text: null, printings: [] }
}
// c1 を count 枚 + 埋め草で合計 total 枚のレシピを作る
function recipe(id: string, opts: { validated?: boolean; total?: number; name?: string; civ?: string[] }): RecipeData {
  const total = opts.total ?? 40
  const cards = [{ id: 'c1', count: Math.min(total, 4) }]
  let rest = total - Math.min(total, 4)
  let n = 0
  while (rest > 0) { const c = Math.min(rest, 4); cards.push({ id: `f${n++}`, count: c }); rest -= c }
  return { id, name: opts.name ?? id, cards, validated: opts.validated, civilizations: opts.civ ?? ['光'] } as RecipeData
}
function makeCorpus(recipes: RecipeData[]): Corpus {
  const cards = [card('c1', 'ザボルグ')]
  return { cards, recipes, meta: [], knowledge: [], cardById: new Map(cards.map(c => [c.id, c])) }
}
const EMPTY_RETRIEVAL: RetrievalResult = { cards: [], recipes: [], meta: [], knowledge: [] }
const THEME_Q = 'ザボルグのデッキ組んで'

test('detectDeckIntent: デッキ構築系プロンプトを検出する', () => {
  for (const q of [
    'デッキ組んで',
    'デッキを組んで',
    'デッキ作って',
    'デッキ教えて',
    'デッキ構築して',
    'デッキが欲しい',
    'デッキ組みたい',
    'ボルメテウスのデッキ組んで',
    '白単ビートのデッキを考えて',
    '白単ビート組んで',
    'おすすめのデッキ提案して',
  ]) {
    assert.equal(detectDeckIntent(q), true, `should be true: ${q}`)
  }
})

test('detectDeckIntent: 単発カード質問は誤検出しない', () => {
  for (const q of [
    '《ボルメテウス・ホワイト・ドラゴン》のコストは？',
    'ボルメテウスってどんなカード？',
    'ブロッカーって何？',
    '殿堂レギュレーションについて教えて',
    'クラシック08とは？',
  ]) {
    assert.equal(detectDeckIntent(q), false, `should be false: ${q}`)
  }
})

test('detectDeckIntent: 情報系質問（とは/コツ/違い等）は誤検出しない', () => {
  for (const q of [
    '構築済みデッキとは何ですか？',
    'デッキ構築のコツは？',
    'コンボを組み合わせると？',
    'ビートダウンとコントロールの違いは？',
    'デッキ構築の方法について教えて',
  ]) {
    assert.equal(detectDeckIntent(q), false, `should be false: ${q}`)
  }
})

test('selectDeck: ボルメテウス指定で該当カードを含む validated&&40 レシピを返す', async () => {
  const corpus = await loadCorpus()
  const q = 'ボルメテウスのデッキ組んで'
  const sel = selectDeck(corpus, q, retrieve(corpus, q))
  assert.ok(sel, 'デッキが選定されること')
  const r = sel!.recipe
  assert.equal(r.validated, true)
  assert.equal(r.cards.reduce((s, c) => s + (c.count || 0), 0), 40)
  // 選定レシピにボルメテウスを名に含むカードが入っていること
  const names = r.cards.map(rc => corpus.cardById.get(rc.id)?.name ?? '')
  assert.ok(names.some(n => n.includes('ボルメテウス')), 'ボルメテウス系カードを含む')
})

test('selectDeck: 白単ビートで光文明を含む validated&&40 レシピを返す', async () => {
  const corpus = await loadCorpus()
  const q = '白単ビート組んで'
  const sel = selectDeck(corpus, q, retrieve(corpus, q))
  assert.ok(sel, 'デッキが選定されること')
  const r = sel!.recipe
  assert.equal(r.validated, true)
  assert.equal(r.cards.reduce((s, c) => s + (c.count || 0), 0), 40)
  assert.ok((r.civilizations as string[]).includes('光'), '光文明を含む')
})

test('selectDeck: 手がかりのないテーマは null（該当なし）', async () => {
  const corpus = await loadCorpus()
  const q = 'zzzqqqなデッキ組んで'
  const sel = selectDeck(corpus, q, retrieve(corpus, q))
  assert.equal(sel, null)
})

test('selectDeck: 情報系質問はレシピを選ばず null', async () => {
  const corpus = await loadCorpus()
  for (const q of ['構築済みデッキとは何ですか？', 'コンボを組み合わせると？']) {
    const sel = selectDeck(corpus, q, retrieve(corpus, q))
    assert.equal(sel, null, `should be null: ${q}`)
  }
})

test('selectDeck: 返すレシピは常に validated かつ合計40枚', async () => {
  const corpus = await loadCorpus()
  for (const q of ['火文明のデッキ組んで', 'コントロールデッキ教えて', 'ヴァルディのデッキ作って']) {
    const sel = selectDeck(corpus, q, retrieve(corpus, q))
    if (!sel) continue
    assert.equal(sel.recipe.validated, true, `${q}: validated`)
    assert.equal(sel.recipe.cards.reduce((s, c) => s + (c.count || 0), 0), 40, `${q}: 40枚`)
  }
})

test('selectDeck: validated:false のレシピはテーマ一致でも除外する', () => {
  // テーマに完全一致するが validated:false のみ → 選定しない
  const corpus = makeCorpus([recipe('bad', { validated: false, total: 40 })])
  assert.equal(selectDeck(corpus, THEME_Q, EMPTY_RETRIEVAL), null)
  // validated 未定義(=trueでない)も除外
  const corpus2 = makeCorpus([recipe('undef', { total: 40 }) as any])
  ;(corpus2.recipes[0] as any).validated = undefined
  assert.equal(selectDeck(corpus2, THEME_Q, EMPTY_RETRIEVAL), null)
})

test('selectDeck: 合計40枚でない validated レシピは除外する', () => {
  for (const total of [39, 41, 20]) {
    const corpus = makeCorpus([recipe(`r${total}`, { validated: true, total })])
    assert.equal(selectDeck(corpus, THEME_Q, EMPTY_RETRIEVAL), null, `total=${total} は除外`)
  }
})

test('selectDeck: validated&&40 が混在しても40枚以外は選ばれない', () => {
  const corpus = makeCorpus([
    recipe('short', { validated: true, total: 39 }),
    recipe('ok', { validated: true, total: 40 }),
    recipe('long', { validated: true, total: 41 }),
  ])
  const sel = selectDeck(corpus, THEME_Q, EMPTY_RETRIEVAL)
  assert.ok(sel)
  assert.equal(sel!.recipe.id, 'ok')
  assert.equal(sel!.recipe.cards.reduce((s, c) => s + (c.count || 0), 0), 40)
})

test('selectDeck: 同点スコアは決定的（配列先頭のレシピが安定して選ばれる）', () => {
  const corpus = makeCorpus([
    recipe('first', { validated: true, total: 40 }),
    recipe('second', { validated: true, total: 40 }),
  ])
  // 複数回実行しても同じ結果（決定性）
  for (let i = 0; i < 5; i++) {
    const sel = selectDeck(corpus, THEME_Q, EMPTY_RETRIEVAL)
    assert.ok(sel)
    assert.equal(sel!.recipe.id, 'first', '同点時は先頭が選ばれる')
  }
})

test('selectDeck: 手がかりゼロ（スコア0）は null', () => {
  const corpus = makeCorpus([recipe('r', { validated: true, total: 40 })])
  assert.equal(selectDeck(corpus, 'zzzqqqのデッキ組んで', EMPTY_RETRIEVAL), null)
})

// --- 強さ指向のフォールバック（テーマ指定なし＋強さ語 → メタ系レシピを返す） ---
// 実コーパス(meta-decks.json)に対応するレシピを決定的に選ぶ挙動を検証する。
const norm = (s: string) => s.normalize('NFKC').replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60)).replace(/[・･\sー\-—–]/g, '').toLowerCase()
function matchesSomeMeta(corpus: Corpus, r: RecipeData): boolean {
  const rt = [r.name, (r as any).archetype, ...(Array.isArray((r as any).tags) ? (r as any).tags : [])].filter(Boolean).map((x: any) => norm(String(x)))
  return corpus.meta.some(mj => {
    let mo: any; try { mo = JSON.parse(mj) } catch { return false }
    if (!mo?.name) return false
    const head = String(mo.name).split(/[（(]/)[0] ?? mo.name
    const mt = [norm(String(mo.name)), norm(head)].filter(x => x.length >= 2)
    return mt.some(x => rt.some((y: string) => (x.length >= 2 && y.length >= 2) && (x.includes(y) || y.includes(x))))
  })
}

test('selectDeck: 強さ指向の抽象依頼はメタ系レシピをフォールバックで返す', async () => {
  const corpus = await loadCorpus()
  for (const q of ['実用性の高いデッキを考案してほしい', '強いデッキを考えて', 'ガチで大会向けのデッキ組んで']) {
    const sel = selectDeck(corpus, q, retrieve(corpus, q))
    assert.ok(sel, `フォールバックで選定される: ${q}`)
    assert.equal(sel!.recipe.validated, true, `${q}: validated`)
    assert.equal(sel!.recipe.cards.reduce((s, c) => s + (c.count || 0), 0), 40, `${q}: 40枚`)
    assert.ok(matchesSomeMeta(corpus, sel!.recipe), `${q}: メタ系アーキタイプに対応`)
  }
})

test('selectDeck: 強さ指向フォールバックは決定的（同入力→同結果）', async () => {
  const corpus = await loadCorpus()
  const q = '強いデッキを考えて'
  const a = selectDeck(corpus, q, retrieve(corpus, q))
  const b = selectDeck(corpus, q, retrieve(corpus, q))
  assert.ok(a && b)
  assert.equal(a!.recipe.id, b!.recipe.id)
})

test('selectDeck: デッキ意図の無い強さ質問（強いカードは？）は null（誤爆しない）', async () => {
  const corpus = await loadCorpus()
  for (const q of ['強いカードは？', '環境で強いのは？']) {
    assert.equal(selectDeck(corpus, q, retrieve(corpus, q)), null, `should be null: ${q}`)
  }
})

test('selectDeck: テーマ指定があれば強さ語混在でもテーマ優先（フォールバックしない）', async () => {
  const corpus = await loadCorpus()
  const q = 'ボルメテウスホワイトドラゴンをメインにした強いデッキを作ってみて'
  const sel = selectDeck(corpus, q, retrieve(corpus, q))
  assert.ok(sel)
  const names = sel!.recipe.cards.map(rc => corpus.cardById.get(rc.id)?.name ?? '')
  assert.ok(names.some(n => n.includes('ボルメテウス')), 'ボルメテウス系カードを含む')
})

test('selectDeck: 強さ指向の曖昧依頼はメタ実績レシピへフォールバックする', async () => {
  const corpus = await loadCorpus()
  for (const q of ['実用性の高いデッキを考案してほしい', '強いデッキを考えて']) {
    assert.equal(detectDeckIntent(q), true, `intent: ${q}`)
    const sel = selectDeck(corpus, q, retrieve(corpus, q))
    assert.ok(sel, `フォールバック選定されること: ${q}`)
    assert.equal(sel!.recipe.validated, true, `${q}: validated`)
    assert.equal(sel!.recipe.cards.reduce((s, c) => s + (c.count || 0), 0), 40, `${q}: 40枚`)
  }
})

test('selectDeck: 強さ指向フォールバックは決定的（複数回同一）', async () => {
  const corpus = await loadCorpus()
  const q = '実用性の高いデッキを考案してほしい'
  const first = selectDeck(corpus, q, retrieve(corpus, q))
  assert.ok(first)
  for (let i = 0; i < 3; i++) {
    const sel = selectDeck(corpus, q, retrieve(corpus, q))
    assert.equal(sel!.recipe.id, first!.recipe.id)
  }
})

test('selectDeck: 強さ指向フォールバックは meta の並び順を優先する', () => {
  const corpus = makeCorpus([
    recipe('alpha', { validated: true, total: 40, name: 'アルファビート' }),
    recipe('beta', { validated: true, total: 40, name: 'ベータコン' }),
  ])
  corpus.meta = [JSON.stringify({ name: 'ベータコン', cards: [] }), JSON.stringify({ name: 'アルファビート', cards: [] })]
  for (let i = 0; i < 3; i++) {
    const sel = selectDeck(corpus, '強いデッキ組んで', EMPTY_RETRIEVAL)
    assert.ok(sel)
    assert.equal(sel!.recipe.id, 'beta', 'meta先頭のアーキタイプに対応するレシピが選ばれる')
  }
})

test('selectDeck: 強さ指向でも meta 対応レシピが無ければ null', () => {
  const corpus = makeCorpus([recipe('r', { validated: true, total: 40 })]) // meta は空
  assert.equal(selectDeck(corpus, '強いデッキを組んで', EMPTY_RETRIEVAL), null)
})

test('detectDeckIntent: 強さ指向語だけのカード質問は誤検出しない', () => {
  for (const q of ['強いカードは？', '環境で強いのは？', '実用性の高いカードを教えて']) {
    assert.equal(detectDeckIntent(q), false, `should be false: ${q}`)
  }
})
