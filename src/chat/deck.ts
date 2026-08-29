// src/chat/deck.ts
// ユーザーが「デッキ組んで」「〇〇デッキ教えて」等の構築要求をした際、
// 収録レシピ群から質問意図に最も合う40枚レシピを1件選定して提示するモジュール。
//
// 設計方針:
// - 対象は validated:true かつ合計40枚のレシピのみ。
// - 質問の意図（デッキ構築要求か）を明示的に判定する。単発カード解説やルール質問では
//   デッキ提示を行わず、通常のカード解説に留める（過剰介入を避ける）。
// - スコアリングは決定論的（同入力なら常に同一レシピ）。
// - 該当なし（低スコア）の場合は無理に提示せず null を返し、AI側の自然文解説に委ねる。

import type { Corpus } from './corpus.js'
import type { RecipeData, RetrievalResult, ChatTurn } from './types.js'
import { normalizeKana } from './normalize.js'
import { mutualIncludes, ALIAS_MAP } from './retriever.js'

// 「デッキを組んで/教えて」等の構築動詞パターン
const BUILD_VERBS = /組[んでめみ]|作[ってりる]|教え[てろ]|提案|見せ[てろ]|紹介|レシピ|おすすめ|オススメ|テンプレ|構築|リスト|診断|改造|欲し[いい]|考え[てろ]|知りた[いい]|知りたい|共有|送って|出し[てろ]/

// 「〜デッキ」「〜でっき」の形を持たないが、単独で強い構築要求を示す表現。
// 例: 「ボルメテウス組んで」「天門教えて」「赤緑速攻作って」「ボルコンのテンプレ」
const STRONG_BUILD = /((?:組[んでめ]|作[って]|提案|テンプレ|レシピ|構築|リスト)(?:して|ほしい|頂戴|ちょうだい|ください|お願い|おねがい)?|[何なに]がいい)/

// デッキという単語を含んでいても、構築要求ではなく情報・仕様を尋ねる質問は除外する。
// 例: 「ボルメテウスデッキとは？」「天門デッキの回し方のコツ」「速攻デッキとコントロールの違い」
const INFO_QUESTION = /(?:とは|について|って何|ってなに|のコツ|の違い|の弱点|の対策|の歴史|相性|回し方|回しかた|使い方|つかいかた)/

// 強さ指向（環境/ガチ/大会/最強等）の合図。テーマ語が無い場合のフォールバック発動判定に使う。
const STRENGTH_WORDS = /(?:実用性|実用|最強|強い|ガチ|優勝|大会|環境|勝てる|おすすめ|オススメ|テンプレ)/

// 単色文明俗称
const CIV_ALIASES: Record<string, string> = {
  '光': '光', '白': '光',
  '水': '水', '青': '水',
  '闇': '闇', '黒': '闇',
  '火': '火', '赤': '火',
  '自然': '自然', '緑': '自然',
}

// 3色カラー俗称
const TRI_COLOR_ALIASES: Record<string, string[]> = {
  'ドロマー': ['光', '水', '闇'],
  'クローシス': ['水', '闇', '火'],
  'ネクラ': ['光', '闇', '自然'],
  'デアリ': ['闇', '火', '自然'],
  'リース': ['光', '火', '自然'],
  'アナカラー': ['水', '闇', '自然'],
  'トリーヴァ': ['光', '水', '自然'],
}

// 質問文が「デッキを組んで/教えて」等の構築要求かどうか。
export function detectDeckIntent(question: string, history: ChatTurn[] = []): boolean {
  if (INFO_QUESTION.test(question)) return false
  if (STRONG_BUILD.test(question)) return true
  if (/デッキ|でっき|構築|レシピ|リスト/.test(question) && BUILD_VERBS.test(question)) return true

  // 会話履歴があり、今回の質問が文脈依存のレシピ・リスト要求（「レシピを共有して」「リスト見せて」等）の場合
  if (history.length > 0 && /(?:レシピ|リスト|共有|送って|教えて)/.test(question)) {
    const lastUser = [...history].reverse().find(h => h.role === 'user')?.content ?? ''
    if (/デッキ|でっき|構築/.test(lastUser) || detectDeckIntent(lastUser)) return true
  }

  return false
}

export interface SelectedDeck { recipe: RecipeData; matchedCards: string[] }

const BUILD_VERBS_G = new RegExp(BUILD_VERBS.source, 'g')

// 質問文および履歴からテーマ語（カード名/アーキタイプ候補）を抽出する。
function queryKeywords(question: string, history: ChatTurn[] = []): string[] {
  let q = question.replace(/デッキ|でっき/g, ' ')
  q = q.replace(BUILD_VERBS_G, ' ')
  q = q.replace(/(おすすめ|オススメ|でしょうか|ですか|ますか|とは|について|コツ|違い|方法|何|なに|して|する|お願い|おねがい|ください|下さい|please|テンプレ|改造|診断|共有)/gi, ' ')
  q = q.replace(/実用性|実用|最強|強い|ガチ|優勝|大会|環境|勝てる/g, ' ')
  q = q.replace(/[のをがはでとにへや、。！？!?\s「」『』（）()《》]+/g, ' ')
  
  // 質問文が短くテーマ語が取れない場合は履歴も参照
  if (q.trim().length < 2 && history.length > 0) {
    const past = history.slice(-4).map(h => h.content).join(' ')
    q += ' ' + past.replace(/[のをがはでとにへや、。！？!?\s「」『』（）()《》]+/g, ' ')
  }

  const seen = new Set<string>()
  const out: string[] = []
  for (const t of q.split(/\s+/)) {
    const w = t.trim()
    if (w.length >= 2 && !seen.has(w)) {
      seen.add(w)
      out.push(w)
      // ALIAS_MAP に一致する略称があれば展開先もキーワードに追加
      const normW = normalizeKana(w)
      for (const [alias, targets] of Object.entries(ALIAS_MAP)) {
        if (normW.includes(normalizeKana(alias)) || normalizeKana(alias).includes(normW)) {
          for (const target of targets) {
            const normT = normalizeKana(target)
            if (normT.length >= 2 && !seen.has(normT)) {
              seen.add(normT)
              out.push(normT)
            }
          }
        }
      }
    }
  }
  return out
}

function toStr(v: unknown): string { return typeof v === 'string' ? v : '' }

function headTerm(s: string): string {
  return s.split(/[（(]/)[0]?.trim() ?? s
}

// meta-decks（環境実績のあるアーキタイプ、並び順=優先度）に対応する候補レシピを決定的に1件返す。
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

function isFortyCards(r: RecipeData): boolean {
  return Array.isArray(r.cards) && r.cards.reduce((s, c) => s + (c.count || 0), 0) === 40
}

// validated:true かつ合計40枚のレシピから、質問意図に最も合う1件を選定する。
export function selectDeck(
  corpus: Corpus,
  question: string,
  retrieval: RetrievalResult,
  history: ChatTurn[] = []
): SelectedDeck | null {
  if (!detectDeckIntent(question, history)) return null

  // 質問単体または履歴を合成したテキスト
  const combinedQ = history.length > 0 ? `${question} ${history.slice(-2).map(h => h.content).join(' ')}` : question
  const qn = normalizeKana(combinedQ)
  const retrievalIds = new Set(retrieval.cards.map(c => c.id))
  const keywords = queryKeywords(question, history).map(k => ({ raw: k, n: normalizeKana(k) })).filter(k => k.n.length >= 2)

  // 質問中の文明（単色俗称 & 3色カラー名）
  const civHit = new Set<string>()
  for (const alias of Object.keys(CIV_ALIASES)) {
    if (combinedQ.includes(alias)) civHit.add(CIV_ALIASES[alias]!)
  }
  let triColorRequired: string[] | null = null
  for (const [triName, triCivs] of Object.entries(TRI_COLOR_ALIASES)) {
    if (combinedQ.includes(triName)) {
      triColorRequired = triCivs
      for (const c of triCivs) civHit.add(c)
    }
  }

  const wantsMono = /単/.test(combinedQ)
  const candidates = corpus.recipes.filter(r => r.validated === true && isFortyCards(r))

  // もし retrieval.recipes にすでに検証済み40枚レシピがあれば優先スコア加算用
  const topRetrievalRecipeIds = new Set(retrieval.recipes.filter(r => r.validated && isFortyCards(r)).map(r => r.id))

  let best: SelectedDeck | null = null
  let bestScore = 0
  for (const r of candidates) {
    let score = 0
    const matched = new Set<string>()

    // (0) retriever で既に上位に上がっているレシピなら大加点
    if (topRetrievalRecipeIds.has(r.id)) {
      score += 15
    }

    // (a) retriever が拾った質問関連カードを含む
    for (const rc of r.cards) {
      if (retrievalIds.has(rc.id)) { score += 5; matched.add(rc.id) }
    }

    // (b) テーマ語一致: レシピ名/アーキタイプ/タグ、または収録カード名に含まれるか
    const meta = [toStr(r.name), toStr(r.archetype), ...(Array.isArray(r.tags) ? r.tags.map(toStr) : [])]
      .filter(Boolean).map(normalizeKana)
    const cardNames = r.cards.map(rc => ({ id: rc.id, n: normalizeKana(corpus.cardById.get(rc.id)?.name ?? '') }))
    
    if (meta.some(m => mutualIncludes(qn, m))) score += 8
    
    for (const kw of keywords) {
      if (kw.n.length < 3) continue
      if (meta.some(m => m.includes(kw.n))) { score += 6; continue }
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

      // (e) 3色カラー指定（例: ドロマー、ネクラ）との一致
      if (triColorRequired) {
        const matchesAllTri = triColorRequired.every(c => civs.includes(c))
        if (matchesAllTri) score += 6
      }
    }

    if (score > bestScore) { bestScore = score; best = { recipe: r, matchedCards: [...matched] } }
  }

  if (bestScore > 0) return best
  if (STRENGTH_WORDS.test(combinedQ)) return fallbackMetaDeck(corpus, candidates)
  return null
}