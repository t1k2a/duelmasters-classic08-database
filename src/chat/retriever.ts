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
  // (d) knowledge: タイトルのnormalizeKana部分一致で最大3件
  const knowledge = corpus.knowledge
    .filter(k => qn.includes(normalizeKana(k.title)))
    .slice(0, 3)
    .map(k => `${k.title}: ${k.body}`)
  // (meta) アーキタイプ名がそのまま質問に含まれるもの
  const meta = corpus.meta.filter(m => {
    try { const o = JSON.parse(m); return o?.name && question.includes(o.name) } catch { return false }
  }).slice(0, 2)
  return { cards, recipes, meta, knowledge }
}
