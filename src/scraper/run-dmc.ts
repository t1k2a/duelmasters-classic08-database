/**
 * DMC/DMS set scraper — ID enumeration approach
 *
 * Enumerates card IDs sequentially (dmc01-001, dmc01-002, ...) until
 * 5 consecutive invalid pages are encountered per set.
 * Cards already in DB by name get a new printing entry only (reprint handling).
 * Idempotent: cached raw HTML is reused on re-runs.
 *
 * Usage:
 *   npm run scrape:dmc                   # all DMC/DMS sets in scope
 *   TEST_SET=DMC-09 npm run scrape:dmc   # single set
 */

import { fetchCardDetail } from './fetch-detail.js'
import { parseCardHtml, isValidCardPage } from './parse-card.js'
import { upsertCard, prisma } from '../ingest/upsert-card.js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function loadSets(lineFilter: string[]): string[] {
  const json = JSON.parse(
    readFileSync(join(__dirname, '../../data/seeds/sets_dmc08.json'), 'utf-8')
  )
  return json.sets
    .filter((s: { line: string }) => lineFilter.includes(s.line))
    .map((s: { set_code: string }) => s.set_code)
}

// "DMC-01" → "dmc01", "DMS-02" → "dms02"
function setCodeToPrefix(setCode: string): string {
  return setCode.replace(/-/g, '').toLowerCase()
}

async function addPrintingIfMissing(cardId: string, existingCardId: number, card: { setCode: string; cardNumber: string; rarity?: string }): Promise<void> {
  const set = await prisma.set.findUnique({ where: { setCode: card.setCode } })
  if (!set || !card.cardNumber) return
  const exists = await prisma.printing.findFirst({
    where: { setId: set.id, cardNumber: card.cardNumber },
  })
  if (!exists) {
    await prisma.printing.create({
      data: { cardId: existingCardId, setId: set.id, cardNumber: card.cardNumber, rarity: card.rarity ?? null },
    })
    console.log(`  ↺ Reprint: [${card.setCode} ${card.cardNumber}] (cardId ${existingCardId})`)
  }
}

async function scrapeSet(setCode: string): Promise<{ scraped: number; reprints: number; failed: number }> {
  const prefix = setCodeToPrefix(setCode)
  let scraped = 0
  let reprints = 0
  let failed = 0
  let consecutive = 0
  const MAX_CONSECUTIVE = 5

  for (let i = 1; i <= 999; i++) {
    const cardId = `${prefix}-${String(i).padStart(3, '0')}`
    const html = await fetchCardDetail(cardId, setCode)

    if (!html || !isValidCardPage(html)) {
      consecutive++
      if (consecutive >= MAX_CONSECUTIVE) break
      continue
    }
    consecutive = 0

    const card = parseCardHtml(html, cardId, setCode)
    if (!card) {
      console.warn(`  ✗ Parse failed: ${cardId}`)
      failed++
      continue
    }

    // Reprint: card already exists by name → only add printing
    const existing = await prisma.card.findUnique({ where: { name: card.name } })
    if (existing) {
      await addPrintingIfMissing(cardId, existing.id, card)
      reprints++
      continue
    }

    try {
      await upsertCard(card)
      console.log(`  ✓ ${card.name} [${card.setCode} ${card.cardNumber}] ${card.rarity ?? ''}`)
      scraped++
    } catch (err) {
      console.error(`  ✗ DB error for ${cardId}:`, err)
      failed++
    }
  }

  return { scraped, reprints, failed }
}

async function main() {
  const testSet = process.env['TEST_SET']
  const sets = testSet ? [testSet] : loadSets(['DMC', 'DMS'])

  console.log(`Processing ${sets.length} sets via ID enumeration`)

  let totalScraped = 0
  let totalReprints = 0
  let totalFailed = 0

  for (const setCode of sets) {
    console.log(`\n=== ${setCode} ===`)
    const { scraped, reprints, failed } = await scrapeSet(setCode)
    console.log(`  → ${scraped} new, ${reprints} reprints, ${failed} failed`)
    totalScraped += scraped
    totalReprints += reprints
    totalFailed += failed
  }

  const cardCount = await prisma.card.count()
  const printingCount = await prisma.printing.count()

  console.log('\n=== Summary ===')
  console.log(`Sets processed : ${sets.length}`)
  console.log(`New cards      : ${totalScraped}`)
  console.log(`Reprint entries: ${totalReprints}`)
  console.log(`Errors         : ${totalFailed}`)
  console.log(`DB cards       : ${cardCount}`)
  console.log(`DB printings   : ${printingCount}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
