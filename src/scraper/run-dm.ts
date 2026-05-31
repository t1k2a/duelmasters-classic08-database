/**
 * Phase 2 scraper — DM expansion packs (DM-01 to DM-30)
 *
 * Strategy: enumerate card IDs sequentially (dm01-001, dm01-002, ...)
 * until 3 consecutive invalid pages are encountered.
 * Each valid HTML is saved to data/raw/{setCode}/{cardId}.html (idempotent).
 *
 * Usage:
 *   npx tsx src/scraper/run-dm.ts                    # all DM-01..DM-30
 *   TEST_SET=DM-06 npx tsx src/scraper/run-dm.ts     # single set
 */

import { fetchCardDetail } from './fetch-detail.js'
import { parseCardHtml, isValidCardPage } from './parse-card.js'
import { upsertCard, prisma } from '../ingest/upsert-card.js'

// All DM expansion packs in scope (DM-01 to DM-30)
const DM_SETS = Array.from({ length: 30 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0')
  return `DM-${n}`
})

/**
 * Convert set_code to the card ID URL prefix.
 * "DM-01"    → "dm01"
 * "DM-22+1D" → "dm22+1d"
 */
function setCodeToPrefix(setCode: string): string {
  return setCode.replace(/-/g, '').toLowerCase()
}

async function scrapeSet(setCode: string): Promise<{ scraped: number; failed: number }> {
  const prefix = setCodeToPrefix(setCode)
  let scraped = 0
  let failed = 0
  let consecutiveInvalid = 0

  for (let i = 1; i <= 999; i++) {
    const cardId = `${prefix}-${String(i).padStart(3, '0')}`
    const html = await fetchCardDetail(cardId, setCode)

    if (!html || !isValidCardPage(html)) {
      consecutiveInvalid++
      if (consecutiveInvalid >= 3) {
        // End of set reached
        break
      }
      continue
    }

    consecutiveInvalid = 0

    const card = parseCardHtml(html, cardId, setCode)
    if (!card) {
      console.warn(`  Parse failed: ${cardId}`)
      failed++
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

  return { scraped, failed }
}

async function main() {
  const testSet = process.env['TEST_SET']
  const sets = testSet ? [testSet] : DM_SETS

  let totalScraped = 0
  let totalFailed = 0

  for (const setCode of sets) {
    console.log(`\n=== ${setCode} ===`)
    const { scraped, failed } = await scrapeSet(setCode)
    console.log(`  → ${scraped} cards scraped, ${failed} failed`)
    totalScraped += scraped
    totalFailed += failed
  }

  const cardCount = await prisma.card.count()
  const printingCount = await prisma.printing.count()
  const raceCount = await prisma.race.count()

  console.log('\n=== Final Summary ===')
  console.log(`Sets processed : ${sets.length}`)
  console.log(`Cards scraped  : ${totalScraped}`)
  console.log(`Parse/DB errors: ${totalFailed}`)
  console.log(`DB cards       : ${cardCount}`)
  console.log(`DB printings   : ${printingCount}`)
  console.log(`DB races       : ${raceCount}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
