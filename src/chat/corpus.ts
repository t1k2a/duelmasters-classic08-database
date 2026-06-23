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
