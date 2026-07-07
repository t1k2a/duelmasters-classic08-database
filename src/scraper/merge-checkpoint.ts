// src/scraper/merge-checkpoint.ts
// 実行中/中断中の scrape-recipes.ts チェックポイントから収集済みレシピを
// public/data/recipes.json へ部分マージする（ネットワークアクセスなし）。
// checkpoint はプロセスが進行中でも安全に読める（追記のみ・末尾破損は無視）。
// 同一 URL は既存 recipes.json 側を優先し、二重取り込みしない。
// 何度でも再実行可能（次のマージでは今回取り込んだ分は自動的にスキップされる）。
//
// Usage: CHECKPOINT=/path/to/checkpoint.jsonl npm run recipes:merge-checkpoint
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parseCheckpoint, resumeState } from './checkpoint.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RECIPES_PATH = join(__dirname, '../../public/data/recipes.json')

interface CardEntry { id: string; count: number }
interface Recipe {
  id: string
  cards: CardEntry[]
  validated: boolean
  source: { url: string }
  [key: string]: unknown
}

function total(r: Recipe): number {
  return r.cards.reduce((s, c) => s + c.count, 0)
}

function main() {
  const checkpointPath = process.env['CHECKPOINT']
  if (!checkpointPath) {
    console.error('Usage: CHECKPOINT=/path/to/checkpoint.jsonl npm run recipes:merge-checkpoint')
    process.exit(1)
  }

  const existing: Recipe[] = JSON.parse(readFileSync(RECIPES_PATH, 'utf-8'))
  const seenUrls = new Set(existing.map(r => r.source.url))

  const { recipes: restored } = resumeState<Recipe>(
    parseCheckpoint<Recipe>(readFileSync(checkpointPath, 'utf-8'))
  )

  const fresh = restored.filter(r => !seenUrls.has(r.source.url))

  let rcpIndex = existing.length > 0
    ? Math.max(...existing.map(r => parseInt(r.id.replace('rcp-', ''), 10))) + 1
    : 1
  const renumbered = fresh.map(r => ({ ...r, id: `rcp-${String(rcpIndex++).padStart(4, '0')}` }))

  const output = [...existing, ...renumbered]
  writeFileSync(RECIPES_PATH, JSON.stringify(output, null, 2), 'utf-8')

  const beforeValidated40 = existing.filter(r => r.validated && total(r) === 40).length
  const addedValidated40 = renumbered.filter(r => r.validated && total(r) === 40).length

  console.log('=== Merge summary ===')
  console.log(`Checkpoint            : ${checkpointPath}`)
  console.log(`Checkpoint recipes     : ${restored.length}`)
  console.log(`Already present (skip) : ${restored.length - fresh.length}`)
  console.log(`Newly merged           : ${renumbered.length}`)
  console.log(`  validated & 40-card  : ${addedValidated40}`)
  console.log(`Total recipes (before) : ${existing.length} (validated&40: ${beforeValidated40})`)
  console.log(`Total recipes (after)  : ${output.length} (validated&40: ${beforeValidated40 + addedValidated40})`)
  console.log(`Output: ${RECIPES_PATH}`)
}

main()
