/**
 * public/data/recipes.json の各レシピに poolStatus / poolNote を付与する（ビルド経路）。
 *
 * 判定ロジックは src/verify/pool-scope.ts の純関数を再利用する（二重実装しない）。
 *
 * 方針:
 *   - **レシピは削除しない。** 判定ロジックは今後改善されるため、削除は取り返しがつかない。
 *     公開側で絞り込みたい場合は poolStatus === 'in' でフィルタする（別対応）。
 *   - OUT-strong / OUT-weak はどちらも poolStatus:'out'。根拠の違いは poolNote に残す。
 *   - 分類の合計が件数と一致しない場合は書き込まずに異常終了する（サイレントな部分書き込みを作らない）。
 *
 * Usage: npm run build:recipe-pool
 */

import { readFile, writeFile } from 'fs/promises'
import {
  classifyAll,
  loadScopeContext,
  poolNoteOf,
  RECIPES_PATH,
  type PoolScopeRecipe,
  type PoolStatus,
} from '../src/verify/pool-scope.js'

interface AnnotatedRecipe extends PoolScopeRecipe {
  poolStatus?: PoolStatus
  poolNote?: string
  [key: string]: unknown
}

async function main() {
  const recipes = JSON.parse(await readFile(RECIPES_PATH, 'utf-8')) as AnnotatedRecipe[]
  if (!recipes.length) throw new Error(`${RECIPES_PATH} が空です`)

  const ctx = await loadScopeContext()
  const { results, counts, unknownYearIds } = classifyAll(recipes, ctx)

  const total = counts.IN + counts.OUT_STRONG + counts.OUT_WEAK + counts.UNDECIDED
  if (results.length !== recipes.length || total !== recipes.length) {
    throw new Error(`分類の取りこぼし: results=${results.length} total=${total} recipes=${recipes.length}`)
  }
  if (unknownYearIds.length) {
    // 日付論法が効いていないレシピがあるまま黙って書き込まない
    throw new Error(`アーカイブ年を取り出せない source.url が ${unknownYearIds.length} 件あります: ${unknownYearIds.slice(0, 5).join(', ')}`)
  }

  const annotated = recipes.map((recipe, i) => {
    const c = results[i]!
    if (c.id !== recipe.id) throw new Error(`判定結果の並びがずれています: ${c.id} != ${recipe.id}`)
    return { ...recipe, poolStatus: c.poolStatus, poolNote: poolNoteOf(c) }
  })

  await writeFile(RECIPES_PATH, JSON.stringify(annotated, null, 2), 'utf-8')

  const byStatus = { in: 0, out: 0, undecided: 0 }
  for (const r of annotated) byStatus[r.poolStatus!]++
  console.log(`✓ poolStatus を付与しました: ${RECIPES_PATH}`)
  console.log(`   in=${byStatus.in} out=${byStatus.out} (strong=${counts.OUT_STRONG}, weak=${counts.OUT_WEAK}) undecided=${byStatus.undecided} / total=${annotated.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
