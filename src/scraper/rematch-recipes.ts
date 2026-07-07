// src/scraper/rematch-recipes.ts
// 既存 public/data/recipes.json を改善済み照合ロジックで再照合する（ネットワークアクセスなし）。
// validationNote に残る未マッチ名を現行 cards.json と再照合し、全解決したものを validated:true に更新する。
// source 情報・id は維持。40枚判定は deck.ts 側の責務なので変更しない。
//
// Usage: npm run recipes:rematch
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildMatchIndex, rematchRecipe, type RematchableRecipe } from './recipe-match.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CARDS_JSON_PATH = join(__dirname, '../../public/cards.json')
const RECIPES_PATH = join(__dirname, '../../public/data/recipes.json')

interface CardJson { id: string; name: string; civilizations: string[] }
type Recipe = RematchableRecipe & { id: string; cards: { id: string; count: number }[] }

function total(r: Recipe): number {
  return r.cards.reduce((s, c) => s + c.count, 0)
}

function main() {
  const cards: CardJson[] = JSON.parse(readFileSync(CARDS_JSON_PATH, 'utf-8'))
  const recipes: Recipe[] = JSON.parse(readFileSync(RECIPES_PATH, 'utf-8'))
  const idx = buildMatchIndex(cards)

  const beforeValidated = recipes.filter(r => r.validated).length
  const before40 = recipes.filter(r => r.validated && total(r) === 40).length

  let newlyValidated = 0
  const updated = recipes.map(r => {
    const out = rematchRecipe(r, idx) as Recipe
    if (!r.validated && out.validated) newlyValidated++
    return out
  })

  const afterValidated = updated.filter(r => r.validated).length
  const after40 = updated.filter(r => r.validated && total(r) === 40).length
  const notForty = updated.filter(r => r.validated && total(r) !== 40)

  writeFileSync(RECIPES_PATH, JSON.stringify(updated, null, 2), 'utf-8')

  console.log('=== Rematch summary ===')
  console.log(`Total recipes        : ${updated.length}`)
  console.log(`Validated (before)   : ${beforeValidated} (40-card: ${before40})`)
  console.log(`Newly validated      : ${newlyValidated}`)
  console.log(`Validated (after)    : ${afterValidated} (40-card: ${after40})`)
  if (notForty.length) {
    console.warn(`WARNING: ${notForty.length} validated recipes are not 40 cards: ${notForty.map(r => `${r.id}(${total(r)})`).join(', ')}`)
  }
  console.log(`Output: ${RECIPES_PATH}`)
}

main()
