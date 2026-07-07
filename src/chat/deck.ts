// src/chat/deck.ts
import type { Corpus } from './corpus.js'
import type { RetrievalResult, RecipeData } from './types.js'
import { normalizeKana } from './normalize.js'
import { mutualIncludes } from './retriever.js'

// 「デッキを組んで/教えて」等の構築系プロンプトを示す語。「構築済み（＝既製品）」は構築要求ではないので除外。
const BUILD_VERBS = /(組ん|組み|組む|組め|組も|作っ|作り|作る|作れ|作ろ|教えて|教え|欲しい|欲し|ほしい|ほし|構築(?!済)|提案|考え|ちょうだい|頂戴|くれ|ください|下さい)/
// 「組む/構築」は DM 文脈ではほぼ「デッキを組む」を意味するため、デッキ語が無くても構築要求とみなす。
// ただし「組み合わせ（る）」「構築済み（＝既製品を指す名詞）」は構築要求ではないので否定先読みで除外する。
const STRONG_BUILD = /(組[んみむめも](?!合わせ|合せ|合わ)|構築(?!済))/
// 「〜とは/コツ/違い/方法/について」を含む情報系質問は、構築語を含んでいても構築要求ではない。
const INFO_QUESTION = /とは|コツ|違い|方法|について/
// 強さ指向語。テーマ語が無くスコア0のデッキ依頼でも、これを含むなら環境実績のあるメタデッキへフォールバックする。
const STRENGTH_WORDS = /実用|強い|最強|ガチ|優勝|大会|環境|おすすめ|オススメ|勝てる/

// 文明の俗称→正式文明名（白=光, 青=水, 黒=闇, 赤=火, 緑=自然）。
const CIV_ALIASES: Record<string, string> = {
  '光': '光', '白': '光',
  '水': '水', '青': '水',
  '闇': '闇', '黒': '闇',
  '火': '火', '赤': '火',
  '自然': '自然', '緑': '自然',
}

// 質問文が「デッキを組んで/教えて」等の構築要求かどうか。
// 情報系質問（とは/コツ/違い等）は先に除外し、「組む/構築」は単独でも構築要求とみなす。
// それ以外の動詞は「デッキ」語との共起を要求し、単発カード質問（デッキ語も構築語も含まない）を除外する。
export function detectDeckIntent(question: string): boolean {
  if (INFO_QUESTION.test(question)) return false
  if (STRONG_BUILD.test(question)) return true
  return /デッキ|でっき/.test(question) && BUILD_VERBS.test(question)
}

export interface SelectedDeck { recipe: RecipeData; matchedCards: string[] }

// BUILD_VERBS の全置換用（.test 用の元定義は lastIndex を汚さないよう別インスタンスにする）。
const BUILD_VERBS_G = new RegExp(BUILD_VERBS.source, 'g')

// 質問文から意図語・助詞・記号を取り除き、テーマ語（カード名/アーキタイプ候補）を抽出する。
function queryKeywords(question: string): string[] {
  let q = question.replace(/デッキ|でっき/g, ' ')
  q = q.replace(BUILD_VERBS_G, ' ')
  // 丁寧語・疑問語・情報系語を除去し、断片（例:「すか」）がテーマ語として残らないようにする。
  q = q.replace(/(おすすめ|オススメ|でしょうか|ですか|ますか|とは|について|コツ|違い|方法|何|なに|して|する|お願い|おねがい|ください|下さい|please)/gi, ' ')
  // 強さ指向語はテーマ（カード名/アーキタイプ）ではなく意図の合図なので除去する。
  // 残すと「実用性」「勝てる」等の3文字以上がレシピ名へ誤ヒットしうる（2文字語は後段の3文字ガードが弾く）。
  q = q.replace(/実用性|実用|最強|強い|ガチ|優勝|大会|環境|勝てる/g, ' ')
  q = q.replace(/[のをがはでとにへや、。！？!?　\s「」『』（）()《》]+/g, ' ')
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of q.split(/\s+/)) {
    const w = t.trim()
    if (w.length >= 2 && !seen.has(w)) { seen.add(w); out.push(w) }
  }
  return out
}

function toStr(v: unknown): string { return typeof v === 'string' ? v : '' }

// 「天門（ヘブンズ・ゲートコントロール）」→「天門」のように括弧前の主要語を取り出す。
function headTerm(s: string): string {
  return s.split(/[（(]/)[0]?.trim() ?? s
}

// meta-decks（環境実績のあるアーキタイプ、並び順=優先度）に対応する候補レシピを決定的に1件返す。
// 対応付けはアーキタイプ名（と括弧前主要語）とレシピの name/archetype/tags の相互部分一致。
// タグ同士の照合は「コントロール」等の汎用語で誤対応しやすいためアーキタイプ名側のみを使う。
function fallbackMetaDeck(corpus: Corpus, candidates: RecipeData[]): SelectedDeck | null {
  for (const m of corpus.meta) {
    let o: { name?: unknown; cards?: { id?: string }[] }
    try { o = JSON.parse(m) } catch { continue }
    const name = toStr(o?.name)
    if (!name) continue
    const terms = [...new Set([name, headTerm(name)])].map(normalizeKana)
    for (const r of candidates) {
      const fields = [toStr(r.name), toStr(r.archetype), ...(Array.isArray(r.tags) ? r.tags.map(toStr) : [])]
        .filter(Boolean).map(normalizeKana)
      if (!terms.some(t => fields.some(f => mutualIncludes(t, f)))) continue
      const metaIds = new Set((Array.isArray(o.cards) ? o.cards : []).map(c => c?.id).filter(Boolean))
      const matched = r.cards.filter(rc => metaIds.has(rc.id)).map(rc => rc.id)
      return { recipe: r, matchedCards: matched }
    }
  }
  return null
}

// 合計40枚（枚数合計）かどうか。
function isFortyCards(r: RecipeData): boolean {
  return Array.isArray(r.cards) && r.cards.reduce((s, c) => s + (c.count || 0), 0) === 40
}

// validated:true かつ合計40枚のレシピから、質問意図に最も合う1件を選定する。
// スコア: (a) retrieval一致カード, (b) 名前/アーキタイプ/タグ/収録カード名とテーマ語の一致,
// (c) 文明一致（俗称含む）, (d) 単色指定と単色レシピの一致。該当が無ければ null。
export function selectDeck(corpus: Corpus, question: string, retrieval: RetrievalResult): SelectedDeck | null {
  // レシピ名は実データ（現在12,600件超）由来の自由記述なので、"コンボ"のような一般語が
  // 偶然どこかのレシピ名に含まれ得る。detectDeckIntent の文脈判定（例:「組み合わせる」は構築要求でない）
  // を経ないキーワード単体一致だけで誤選定しないよう、まず意図そのものをここでも確認する。
  if (!detectDeckIntent(question)) return null
  const qn = normalizeKana(question)
  const retrievalIds = new Set(retrieval.cards.map(c => c.id))
  const keywords = queryKeywords(question).map(k => ({ raw: k, n: normalizeKana(k) })).filter(k => k.n.length >= 2)

  // 質問中の文明（俗称込み）。ただし単色判定用に「単」の有無も見る。
  const civHit = new Set<string>()
  for (const alias of Object.keys(CIV_ALIASES)) {
    if (question.includes(alias)) civHit.add(CIV_ALIASES[alias]!)
  }
  const wantsMono = /単/.test(question)

  const candidates = corpus.recipes.filter(r => r.validated === true && isFortyCards(r))

  let best: SelectedDeck | null = null
  let bestScore = 0
  for (const r of candidates) {
    let score = 0
    const matched = new Set<string>()

    // (a) retriever が拾った質問関連カードを含む
    for (const rc of r.cards) {
      if (retrievalIds.has(rc.id)) { score += 5; matched.add(rc.id) }
    }

    // (b) テーマ語一致: レシピ名/アーキタイプ/タグ、または収録カード名に含まれるか
    const meta = [toStr(r.name), toStr(r.archetype), ...(Array.isArray(r.tags) ? r.tags.map(toStr) : [])]
      .filter(Boolean).map(normalizeKana)
    const cardNames = r.cards.map(rc => ({ id: rc.id, n: normalizeKana(corpus.cardById.get(rc.id)?.name ?? '') }))
    // アーキタイプ/名前/タグと質問全体の相互部分一致は質問ごとに1回だけ加点（キーワード数で乗算しない）。
    if (meta.some(m => mutualIncludes(qn, m))) score += 4
    // キーワード単位: レシピ名等への部分包含、または収録カード名への部分包含。
    // いずれも2文字断片の誤爆を避けキーワード3文字以上を要求する。
    for (const kw of keywords) {
      if (kw.n.length < 3) continue
      if (meta.some(m => m.includes(kw.n))) { score += 4; continue }
      const hit = cardNames.find(c => c.n.length >= 3 && c.n.includes(kw.n))
      if (hit) { score += 3; matched.add(hit.id) }
    }

    // (c) 文明一致
    const civs = Array.isArray(r.civilizations) ? (r.civilizations as unknown[]).map(toStr) : []
    if (civHit.size && civs.length) {
      let civMatch = 0
      for (const c of civHit) if (civs.includes(c)) civMatch++
      score += civMatch * 2
      // (d) 単色指定（例: 白単）と単色レシピの一致
      if (wantsMono && civHit.size === 1 && civs.length === 1 && civMatch === 1) score += 4
    }

    if (score > bestScore) { bestScore = score; best = { recipe: r, matchedCards: [...matched] } }
  }

  if (bestScore > 0) return best
  // テーマ語での一致がゼロでも、デッキ構築意図があり強さ指向（実用性/強い/ガチ等）の依頼なら
  // 環境実績のあるメタデッキを提示する。デッキ意図の無い単なる強さ質問（「強いカードは？」）は対象外。
  if (STRENGTH_WORDS.test(question)) return fallbackMetaDeck(corpus, candidates)
  return null
}
