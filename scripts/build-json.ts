/**
 * Build script: parse all raw HTML files → public/cards.json
 *
 * Reads data/raw/{SET}/*.html, deduplicates by card name,
 * collects all printings, and writes public/cards.json.
 *
 * Usage: npm run build
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { parseCardHtml, isValidCardPage } from '../src/scraper/parse-card.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = join(__dirname, '../data/raw')
const OUT_DIR = join(__dirname, '../public')
const OUT_FILE = join(OUT_DIR, 'cards.json')

interface Printing {
  setCode: string
  cardNumber: string
  rarity: string | null
}

interface CardJson {
  id: string
  name: string
  cardType: string
  cost: number | null
  power: number | null
  civilizations: string[]
  races: string[]
  rarity: string | null
  text: string | null
  printings: Printing[]
  setsContaining: string[]
}

/** Validate only; never normalize or rewrite the committed catalog. */
export function validateReusableCards(value: unknown): asserts value is CardJson[] {
  const record = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
  const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
  const nullableText = (v: unknown) => v === null || typeof v === 'string'
  const nullableNumber = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v))
  const strings = (v: unknown) => Array.isArray(v) && v.every(text)
  if (!Array.isArray(value) || value.length === 0) throw new Error('Reusable cards.json must be a non-empty array')
  const ids = new Set<string>()
  for (const [index, card] of value.entries()) {
    if (!record(card) || !text(card.id) || !/^[a-z0-9][a-z0-9+_-]*$/.test(card.id) ||
      !text(card.name) || !text(card.cardType) || !nullableNumber(card.cost) ||
      !nullableNumber(card.power) || !strings(card.civilizations) || !strings(card.races) ||
      !nullableText(card.rarity) || !nullableText(card.text) || !strings(card.setsContaining) ||
      !Array.isArray(card.printings) || card.printings.length === 0 ||
      !card.printings.every(p => record(p) && text(p.setCode) && text(p.cardNumber) && nullableText(p.rarity))) {
      throw new Error(`Invalid reusable cards.json entry at index ${index}`)
    }
    if (ids.has(card.id)) throw new Error(`Duplicate reusable cards.json ID at index ${index}`)
    ids.add(card.id)
  }
}

export async function buildCards(options: { rawDir: string; outFile: string; reuse: boolean }): Promise<void> {
  if (options.reuse) {
    const existing: unknown = JSON.parse(await readFile(options.outFile, 'utf-8'))
    validateReusableCards(existing)
    console.warn(`BUILD_REUSE_CARDS_JSON=true: validated and reused ${existing.length} cards without rewriting cards.json. Raw HTML was not read; this does not verify raw-data ingestion or completeness.`)
    return
  }
  const setDirs = (await readdir(options.rawDir)).sort()

  const cards = new Map<string, CardJson>()
  let total = 0
  let parsed = 0
  let skipped = 0

  for (const setCode of setDirs) {
    const setDir = join(options.rawDir, setCode)
    let files: string[]
    try {
      files = (await readdir(setDir)).filter(f => f.endsWith('.html')).sort()
    } catch {
      continue
    }

    for (const file of files) {
      total++
      const cardId = file.replace('.html', '')
      const html = await readFile(join(setDir, file), 'utf-8')

      if (!isValidCardPage(html)) {
        skipped++
        continue
      }

      const card = parseCardHtml(html, cardId, setCode)
      if (!card) {
        skipped++
        continue
      }

      parsed++
      const printing: Printing = {
        setCode: card.setCode,
        cardNumber: card.cardNumber,
        rarity: card.rarity ?? null,
      }

      if (cards.has(card.name)) {
        // Duplicate name = reprint in another DM set: add printing only
        const existing = cards.get(card.name)!
        const alreadyHas = existing.printings.some(
          p => p.setCode === printing.setCode && p.cardNumber === printing.cardNumber
        )
        if (!alreadyHas) existing.printings.push(printing)
        for (const s of card.additionalSetNames) {
          if (!existing.setsContaining.includes(s)) {
            existing.setsContaining.push(s)
          }
        }
      } else {
        cards.set(card.name, {
          id: cardId,
          name: card.name,
          cardType: card.cardType,
          cost: card.cost ?? null,
          power: card.power ?? null,
          civilizations: card.civilizations,
          races: card.races,
          rarity: card.rarity ?? null,
          text: card.text ?? null,
          printings: [printing],
          setsContaining: card.additionalSetNames,
        })
      }
    }
  }

  const result: CardJson[] = Array.from(cards.values())

  await mkdir(dirname(options.outFile), { recursive: true })
  await writeFile(options.outFile, JSON.stringify(result, null, 2))

  const sizeKB = Math.round(JSON.stringify(result).length / 1024)
  console.log(`HTML files  : ${total}`)
  console.log(`Parsed      : ${parsed}`)
  console.log(`Skipped     : ${skipped}`)
  console.log(`Unique cards: ${result.length}`)
  console.log(`Output      : ${options.outFile} (${sizeKB} KB)`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildCards({ rawDir: RAW_DIR, outFile: OUT_FILE, reuse: process.env.BUILD_REUSE_CARDS_JSON === 'true' })
    .catch(e => { console.error(e); process.exit(1) })
}
