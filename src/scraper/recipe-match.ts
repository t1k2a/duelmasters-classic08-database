// src/scraper/recipe-match.ts
// レシピのカード名を cards.json に照合する純関数群（副作用なし）。
// scrape-recipes.ts（収集時）と rematch-recipes.ts（既存データ再照合）で共用する。
//
// 表記ゆれの主因は DM Vault 側の「漢字（読み仮名）」括弧付き表記。cards.json は弾ごとに
// 括弧の有無が不統一なため、両側から括弧を除去し normalizeKana で正規化したキーで照合する。
import { normalizeKana } from '../chat/normalize.js'

export interface CardLike {
  id: string
  name: string
  civilizations?: string[]
}

export interface MatchIndex {
  exact: Map<string, string>
  canon: Map<string, string>
  civById: Map<string, string[]>
}

// 読み仮名の括弧（全角/半角）とその中身を除去する。ネストは想定しない（[^（）]で内側だけ削る）。
export function stripReadingBracket(name: string): string {
  return name
    .replace(/（[^（）]*）/g, '')
    .replace(/\([^()]*\)/g, '')
    .trim()
}

// 表記ゆれ吸収用の照合キー: 括弧除去 → かな正規化（NFKC・カタカナ→ひらがな・中黒/長音/空白除去・小文字化）。
export function canonicalCardName(name: string): string {
  return normalizeKana(stripReadingBracket(name))
}

// cards.json から厳密名・正規化キー・文明マップを構築する。
export function buildMatchIndex(cards: CardLike[]): MatchIndex {
  const exact = new Map<string, string>()
  const canon = new Map<string, string>()
  const civById = new Map<string, string[]>()
  for (const c of cards) {
    exact.set(c.name, c.id)
    const key = canonicalCardName(c.name)
    // 括弧有無の重複は同一カード。先勝ちでキーを安定させる。
    if (!canon.has(key)) canon.set(key, c.id)
    civById.set(c.id, c.civilizations ?? [])
  }
  return { exact, canon, civById }
}

// 厳密一致 → 正規化キー一致 の順で id を返す。見つからなければ null。
export function matchCardName(name: string, idx: MatchIndex): string | null {
  return idx.exact.get(name) ?? idx.canon.get(canonicalCardName(name)) ?? null
}

// validationNote "Unmatched cards: 名前(3), 名前2(2)" を [{name,count}] に分解する。
// 名前自体に括弧を含みうるため、各項目の末尾 (数字) だけを枚数として切り出す。
export function parseUnmatchedNote(note: string): { name: string; count: number }[] {
  const body = note.replace(/^Unmatched cards:\s*/, '')
  if (!body.trim()) return []
  return body.split(', ').map(item => {
    const m = item.match(/^(.*)\((\d+)\)$/)
    return m ? { name: m[1]!, count: Number(m[2]) } : { name: item, count: 1 }
  })
}

export interface RematchableRecipe {
  cards: { id: string; count: number }[]
  civilizations: string[]
  validated: boolean
  validationNote: string
}

// 未マッチ名（validationNote由来）を再照合し、全て解決したら validated:true にして返す（純関数）。
// 1枚でも未解決なら元のレシピをそのまま返す（ネットワーク不要・非破壊）。
export function rematchRecipe<T extends RematchableRecipe>(recipe: T, idx: MatchIndex): T {
  if (recipe.validated) return recipe
  const unmatched = parseUnmatchedNote(recipe.validationNote)
  if (!unmatched.length) return recipe

  const resolved: { id: string; count: number }[] = []
  for (const { name, count } of unmatched) {
    const id = matchCardName(name, idx)
    if (!id) return recipe // 未解決が残る → 変更しない
    resolved.push({ id, count })
  }

  // 既存マッチ済み cards と新規解決分を id で統合（枚数合算・合計40枚を保持）。
  const merged = new Map<string, number>()
  for (const c of [...recipe.cards, ...resolved]) merged.set(c.id, (merged.get(c.id) ?? 0) + c.count)
  const cards = [...merged].map(([id, count]) => ({ id, count }))

  const civSet = new Set<string>()
  for (const { id } of cards) for (const civ of idx.civById.get(id) ?? []) civSet.add(civ)

  return { ...recipe, cards, civilizations: [...civSet].sort(), validated: true, validationNote: '' }
}
