/**
 * Phase 2b scraper — DMC/DMS/variant/promo sets using Playwright listing page.
 *
 * For each target set, fetches the listing page to get card IDs, then
 * fetches each card's detail page (SSR, no headless needed for detail).
 * Skips cards already in the DB (idempotent).
 *
 * Usage:
 *   npx tsx src/scraper/run-dmc.ts                  # all DMC/DMS sets
 *   TEST_SET=DMC-09 npx tsx src/scraper/run-dmc.ts  # single set
 */

import { listCardIdsByPlaywright } from './list-ids-playwright.js'
import { fetchCardDetail } from './fetch-detail.js'
import { parseCardHtml, isValidCardPage } from './parse-card.js'
import { upsertCard, prisma } from '../ingest/upsert-card.js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load set list from seeds
function loadSets(lineFilter: string[]): string[] {
  const json = JSON.parse(
    readFileSync(join(__dirname, '../../data/seeds/sets_dmc08.json'), 'utf-8')
  )
  return json.sets
    .filter((s: { line: string }) => lineFilter.includes(s.line))
    .map((s: { set_code: string }) => s.set_code)
}

async function scrapeSetViaPlaywright(setCode: string): Promise<{ scraped: number; failed: number; skipped: number }> {
  let scraped = 0
  let failed = 0
  let skipped = 0

  // Get card IDs from listing page
  const cardIds = await listCardIdsByPlaywright(setCode)
  console.log(`  Found ${cardIds.length} card IDs for ${setCode}`)

  if (cardIds.length === 0) {
    console.log(`  ⚠ No cards found for ${setCode} — may not have dedicated card pages`)
    return { scraped: 0, failed: 0, skipped: 0 }
  }

  for (const cardId of cardIds) {
    const html = await fetchCardDetail(cardId, setCode)
    if (!html || !isValidCardPage(html)) {
      console.warn(`  ✗ Invalid page: ${cardId}`)
      failed++
      continue
    }

    const card = parseCardHtml(html, cardId, setCode)
    if (!card) {
      console.warn(`  ✗ Parse failed: ${cardId}`)
      failed++
      continue
    }

    // Check if card already exists (by name) — if so, just add printing
    const existing = await prisma.card.findUnique({ where: { name: card.name } })
    if (existing) {
      skipped++
      // Still add the printing for this set if it doesn't exist
      const set = await prisma.set.findUnique({ where: { setCode: card.setCode } })
      if (set && card.cardNumber) {
        const printingExists = await prisma.printing.findFirst({
          where: { setId: set.id, cardNumber: card.cardNumber },
        })
        if (!printingExists) {
          await prisma.printing.create({
            data: { cardId: existing.id, setId: set.id, cardNumber: card.cardNumber, rarity: card.rarity ?? null },
          })
          console.log(`  ↺ Added printing: ${card.name} [${card.setCode} ${card.cardNumber}]`)
        }
      }
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

  return { scraped, failed, skipped }
}

async function main() {
  const testSet = process.env['TEST_SET']

  let sets: string[]
  if (testSet) {
    sets = [testSet]
  } else {
    // DMC + DMS + variant sets
    sets = loadSets(['DMC', 'DMS', 'DM']).filter(code =>
      code.includes('+') || // variant sets like DM-22+1D
      code.startsWith('DMC-') ||
      code.startsWith('DMS-')
    )
  }

  console.log(`Processing ${sets.length} sets via Playwright listing`)

  let totalScraped = 0
  let totalFailed = 0
  let totalSkipped = 0

  for (const setCode of sets) {
    console.log(`\n=== ${setCode} ===`)
    const { scraped, failed, skipped } = await scrapeSetViaPlaywright(setCode)
    console.log(`  → ${scraped} new, ${skipped} reprints added, ${failed} failed`)
    totalScraped += scraped
    totalFailed += failed
    totalSkipped += skipped
  }

  const cardCount = await prisma.card.count()
  const printingCount = await prisma.printing.count()

  console.log('\n=== Summary ===')
  console.log(`Sets processed : ${sets.length}`)
  console.log(`New cards      : ${totalScraped}`)
  console.log(`Reprint entries: ${totalSkipped}`)
  console.log(`Errors         : ${totalFailed}`)
  console.log(`DB cards       : ${cardCount}`)
  console.log(`DB printings   : ${printingCount}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
