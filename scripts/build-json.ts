/**
 * Build script: parse all raw HTML files → public/cards.json
 *
 * Reads data/raw/{SET}/*.html, deduplicates by card name,
 * collects all printings, and writes public/cards.json.
 *
 * Usage: npm run build
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
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

async function main() {
  const setDirs = (await readdir(RAW_DIR)).sort()

  const cards = new Map<string, CardJson>()
  let total = 0
  let parsed = 0
  let skipped = 0

  for (const setCode of setDirs) {
    const setDir = join(RAW_DIR, setCode)
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

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT_FILE, JSON.stringify(result))

  const sizeKB = Math.round(JSON.stringify(result).length / 1024)
  console.log(`HTML files  : ${total}`)
  console.log(`Parsed      : ${parsed}`)
  console.log(`Skipped     : ${skipped}`)
  console.log(`Unique cards: ${result.length}`)
  console.log(`Output      : ${OUT_FILE} (${sizeKB} KB)`)
}

main().catch(e => { console.error(e); process.exit(1) })
