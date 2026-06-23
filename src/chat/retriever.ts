// src/chat/retriever.ts
import type { Corpus } from './corpus.js'
import type { RetrievalResult, CardData } from './types.js'
import { normalizeKana } from './normalize.js'

const CIVS = ['光', '水', '闇', '火', '自然']

// 「天門（ヘブンズ・ゲートコントロール）」→「天門」のように、括弧前の主要語を取り出す。
function headTerm(s: string): string {
  return s.split(/[（(]/)[0]?.trim() ?? s
}

// 2語のいずれかが他方を（正規化後に）含むなら一致とみなす。短すぎる語の誤爆を避け min 文字以上で判定。
function mutualIncludes(an: string, bn: string, min = 2): boolean {
  if (an.length < min || bn.length < min) return false
  return an.includes(bn) || bn.includes(an)
}

// 文字バイグラム集合
function bigrams(s: string): Set<string> {
  const set = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
  return set
}

// タイトルのバイグラムのうち質問に含まれる割合（略記・語順揺れに強い）。
// 例: タイトル「クラシック05とクラシック08の違い」と質問「クラシック05と08の違いは？」でも高スコア。
function bigramCoverage(qn: string, tn: string): number {
  if (qn.length < 2 || tn.length < 3) return 0
  const qb = bigrams(qn), tb = bigrams(tn)
  let inter = 0
  for (const g of tb) if (qb.has(g)) inter++
  return inter / tb.size
}

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
  // (meta) アーキタイプ名・タグ・主要語と質問の相互部分一致（normalizeKana経由）
  const metaHits: { json: string; cardRefs: { id: string }[] }[] = []
  for (const m of corpus.meta) {
    try {
      const o = JSON.parse(m)
      if (!o?.name) continue
      const candidates = [o.name, headTerm(o.name), ...(Array.isArray(o.tags) ? o.tags : [])]
      const matched = candidates.some(t => mutualIncludes(qn, normalizeKana(String(t))))
      if (matched) metaHits.push({ json: m, cardRefs: Array.isArray(o.cards) ? o.cards : [] })
    } catch { /* 不正JSONは無視 */ }
  }
  const meta = metaHits.slice(0, 2).map(h => h.json)

  // (S1) ヒットしたmetaのキーカードを cards に昇格（重複除去・上限8）
  const cards = [...named, ...aux]
  const seen = new Set(cards.map(c => c.id))
  for (const h of metaHits) {
    for (const ref of h.cardRefs) {
      if (cards.length >= 8) break
      if (!ref?.id || seen.has(ref.id)) continue
      const cd = corpus.cardById.get(ref.id)
      if (cd) { cards.push(cd); seen.add(cd.id) }
    }
    if (cards.length >= 8) break
  }

  // (c) 関連レシピ
  const idSet = new Set(cards.map(c => c.id))
  const recipes = corpus.recipes
    .filter(r => Array.isArray(r.cards) && r.cards.some(rc => idSet.has(rc.id)))
    .sort((a, b) => Number(b.validated) - Number(a.validated))
    .slice(0, 3)
  // (d) knowledge: タイトル全体／タイトル先頭の主要語と質問の相互部分一致（2文字以上）
  // 「殿堂レギュレーション」に対し「殿堂って何？」のように主要語のみの質問も拾う。
  const knowledge = corpus.knowledge
    .filter(k => {
      const tn = normalizeKana(k.title)
      if (mutualIncludes(qn, tn)) return true
      // タイトル先頭の連続漢字を主要語として抽出し質問に含まれるか判定
      const head = k.title.match(/^[一-龠々]{2,}/)?.[0]
      if (head && qn.includes(normalizeKana(head))) return true
      // 略記・語順揺れ対策: タイトルのバイグラムの過半が質問に出現すれば一致
      return bigramCoverage(qn, tn) >= 0.5
    })
    .slice(0, 3)
    .map(k => `${k.title}: ${k.body}`)
  return { cards, recipes, meta, knowledge }
}
