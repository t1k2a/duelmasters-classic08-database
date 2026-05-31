/**
 * One-shot fix: re-fetch and upsert the 3 cards that were
 * missed due to transient network errors during the main scrape.
 */
import { fetchCardDetail } from './fetch-detail.js'
import { parseCardHtml } from './parse-card.js'
import { upsertCard, prisma } from '../ingest/upsert-card.js'
import { rm } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { RAW_DIR } from './fetch-detail.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const MISSING = [
  { cardId: 'dm10-067', setCode: 'DM-10' },
  { cardId: 'dm14-078', setCode: 'DM-14' },
  { cardId: 'dm28-062', setCode: 'DM-28' },
]

async function main() {
  for (const { cardId, setCode } of MISSING) {
    // Remove any stale (empty) cached file so fetchCardDetail re-fetches
    const filePath = join(RAW_DIR, setCode, `${cardId}.html`)
    await rm(filePath, { force: true })

    const html = await fetchCardDetail(cardId, setCode)
    if (!html) { console.error(`Failed to fetch ${cardId}`); continue }

    const card = parseCardHtml(html, cardId, setCode)
    if (!card) { console.error(`Failed to parse ${cardId}`); continue }

    await upsertCard(card)
    console.log(`✓ ${card.name} [${card.setCode} ${card.cardNumber}] ${card.rarity ?? ''}`)
  }

  console.log(`\nDB cards: ${await prisma.card.count()}`)
  console.log(`DB printings: ${await prisma.printing.count()}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
