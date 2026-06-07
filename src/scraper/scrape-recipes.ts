/**
 * DM Vault Recipe Scraper
 *
 * Collects deck recipes from DM Vault via Wayback Machine (2007-2010 archives).
 * EUC-JP → UTF-8 conversion is applied before HTML parsing.
 *
 * Flow:
 *   1. CDX API → archived deck URL list
 *   2. Fetch each deck page via Wayback Machine
 *   3. EUC-JP decode → Cheerio parse → extract cards / meta
 *   4. Match card names against public/cards.json
 *   5. Write results to public/data/recipes.json
 *
 * Usage:
 *   npm run scrape:recipes              # full run (up to CDX limit)
 *   npm run scrape:recipes:sample       # LIMIT=30 sample run
 */

import * as cheerio from 'cheerio'
import iconv from 'iconv-lite'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CardEntry {
  id: string
  count: number
}

interface RecipeSource {
  type: 'scraped'
  url: string
  collectedAt: string
}

interface Recipe {
  id: string
  name: string
  cards: CardEntry[]
  civilizations: string[]
  archetype?: string
  author?: string
  source: RecipeSource
  tags: string[]
  createdAt?: string
  validated: boolean
  validationNote: string
}

interface CardJson {
  id: string
  name: string
  civilizations: string[]
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CDX_URL =
  'http://web.archive.org/cdx/search/cdx' +
  '?url=dmvault.ath.cx/deck' +
  '&matchType=prefix' +
  '&collapse=urlkey' +
  '&output=json' +
  '&from=2007' +
  '&to=2010' +
  '&limit=500'

const RATE_LIMIT_MS = 2500

const CARDS_JSON_PATH = join(__dirname, '../../public/cards.json')
const OUTPUT_PATH = join(__dirname, '../../public/data/recipes.json')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function buildWaybackUrl(timestamp: string, originalUrl: string): string {
  return `https://web.archive.org/web/${timestamp}/${originalUrl}`
}

/** Fetch raw bytes (Buffer) from a URL. Returns null on failure. */
async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`  HTTP ${res.status}: ${url}`)
      return null
    }
    const ab = await res.arrayBuffer()
    return Buffer.from(ab)
  } catch (err) {
    console.warn(`  Fetch error for ${url}:`, (err as Error).message)
    return null
  }
}

/** Fetch CDX JSON and return [timestamp, original_url][] pairs. */
async function fetchCdxEntries(): Promise<Array<[string, string]>> {
  console.log('Fetching CDX index...')
  const bytes = await fetchBytes(CDX_URL)
  if (!bytes) throw new Error('Failed to fetch CDX index')

  const text = bytes.toString('utf-8')
  const rows: string[][] = JSON.parse(text)

  // First row is header; skip it
  // Columns: [urlkey, timestamp, original, mimetype, statuscode, digest, length]
  const TIMESTAMP_IDX = 1
  const ORIGINAL_IDX = 2

  return rows
    .slice(1)
    .filter(row => row[ORIGINAL_IDX] && row[TIMESTAMP_IDX])
    .map(row => [row[TIMESTAMP_IDX], row[ORIGINAL_IDX]] as [string, string])
}

/**
 * Normalize card name for fuzzy matching.
 * Handles DM Vault notation variants vs cards.json notation:
 *   - Full-width brackets （） → half-width ()
 *   - Trim surrounding whitespace
 */
function normalizeCardName(name: string): string {
  return name
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .trim()
}

/** Load cards.json and build a name → id map (normalized + original). */
function buildCardNameMap(cards: CardJson[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const card of cards) {
    // Register both original and normalized forms
    map.set(card.name, card.id)
    map.set(normalizeCardName(card.name), card.id)
  }
  return map
}

/** Build a card id → civilizations map for deriving deck civilizations. */
function buildCivMap(cards: CardJson[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const card of cards) {
    map.set(card.id, card.civilizations)
  }
  return map
}

// ---------------------------------------------------------------------------
// HTML Parsing
// ---------------------------------------------------------------------------

interface ParsedDeck {
  name: string
  author?: string
  archetype?: string
  rawCards: Array<{ name: string; count: number }>
}

/**
 * Extract deck data from EUC-JP encoded HTML buffer.
 *
 * DM Vault deck page structure (confirmed from archived HTML):
 *   <table id="recipetable2" class="sortable">
 *     <thead><tr><th>コスト</th><th>種類</th><th>文明</th><th>カード名</th><th>数</th><th>コメント</th></tr></thead>
 *     <tbody>
 *       <tr class="zz_table_*">
 *         <td>4</td>          <!-- cost    [0] -->
 *         <td>クリ</td>       <!-- type    [1] -->
 *         <td>光　</td>       <!-- civ     [2] -->
 *         <td><a href="...">カード名</a></td>  <!-- name [3] -->
 *         <td>2</td>          <!-- count   [4] -->
 *         <td>コメント</td>   <!-- comment [5] -->
 *       </tr>
 *     </tbody>
 *   </table>
 *
 * Author / pattern info is in a <p> element inside #titledescription:
 *   デッキ作者：<a href="..."><b>USERNAME</b></a>　デッキパターン...：PATTERN
 */
function parseDeckHtml(buf: Buffer): ParsedDeck | null {
  // EUC-JP → UTF-8
  const html = iconv.decode(buf, 'EUC-JP')

  if (!html.includes('recipetable2') && !html.includes('デッキ')) {
    return null
  }

  const $ = cheerio.load(html)

  // --- Deck name ---
  // Primary: h1 inside #titledescription
  let name = $('#titledescription h1').first().text().trim()

  // Fallback: <title> tag (strip "デッキ " prefix and " - DM vault" suffix)
  if (!name) {
    name = $('title').text()
      .replace(/^デッキ\s*/u, '')
      .replace(/\s*-\s*DM\s*vault\s*$/i, '')
      .trim()
  }
  if (!name) name = 'Unknown Deck'

  // --- Author ---
  // Pattern: デッキ作者：<a ...><b>NAME</b></a>
  let author: string | undefined
  const authorMatch = html.match(/デッキ作者[：:][^<]*<[^>]+><b>([^<]+)<\/b>/)
  if (authorMatch) {
    author = authorMatch[1].trim() || undefined
  }

  // --- Archetype (デッキパターン) ---
  // HTML structure: デッキパターン<span class="fontSS">（<a href="...">？</a>）</span>：PATTERN<br/>
  // Extract the text node immediately after the closing </span> and before <br
  let archetype: string | undefined
  const patternMatch = html.match(/デッキパターン<span[^>]*>.*?<\/span>[：:]([^<\n]{1,40})/s)
  if (patternMatch) {
    const raw = patternMatch[1].trim()
    // Exclude empty strings, URLs, or Wayback junk
    if (raw && !raw.includes('http') && !raw.includes('/')) {
      archetype = raw || undefined
    }
  }

  // --- Card rows ---
  // Use #recipetable2 tbody tr for precise extraction.
  // Columns: [0]=cost, [1]=type, [2]=civ, [3]=card name (with <a>), [4]=count, [5]=comment
  const rawCards: Array<{ name: string; count: number }> = []

  // Primary: structured table
  $('#recipetable2 tbody tr').each((_i, el) => {
    const cells = $(el).find('td')
    if (cells.length < 5) return

    // Card name is in the <a> inside 4th cell (index 3)
    const cardName = $(cells[3]).find('a').text().trim() || $(cells[3]).text().trim()

    // Count is in 5th cell (index 4) — plain number
    const countText = $(cells[4]).text().trim()
    const count = parseInt(countText, 10)

    if (cardName && !isNaN(count) && count >= 1 && count <= 4) {
      rawCards.push({ name: cardName, count })
    }
  })

  // Fallback: if recipetable2 not found, try generic table heuristic
  if (rawCards.length === 0) {
    $('table tr').each((_i, el) => {
      const cells = $(el).find('td')
      if (cells.length < 5) return

      const cellTexts = cells.toArray().map(c => $(c).text().trim())

      // Skip header rows
      if (cellTexts.some(t => /カード名|枚数|コスト/.test(t))) return

      // Try td[3] = name, td[4] = count (same column order as DM Vault)
      const cardNameCell = cellTexts[3] ?? ''
      const countCell = cellTexts[4] ?? ''

      // Also check for <a> link in name cell
      const linkedName = $(cells[3]).find('a').text().trim()
      const cardName = linkedName || (cardNameCell.length > 1 && /[぀-鿿ぁ-んァ-ン]/.test(cardNameCell) ? cardNameCell : '')

      const countMatch = countCell.match(/^(\d+)$/)
      const count = countMatch ? parseInt(countMatch[1], 10) : 0

      if (cardName && count >= 1 && count <= 4) {
        rawCards.push({ name: cardName, count })
      }
    })
  }

  // Deduplicate by name (sum counts if same name appears multiple times)
  const cardMap = new Map<string, number>()
  for (const { name: cn, count } of rawCards) {
    cardMap.set(cn, (cardMap.get(cn) ?? 0) + count)
  }
  const dedupedCards = Array.from(cardMap.entries()).map(([n, c]) => ({ name: n, count: c }))

  if (dedupedCards.length === 0) {
    return null
  }

  return { name, author, archetype, rawCards: dedupedCards }
}

// ---------------------------------------------------------------------------
// Card matching
// ---------------------------------------------------------------------------

interface MatchResult {
  cards: CardEntry[]
  civilizations: string[]
  validated: boolean
  validationNote: string
}

function matchCards(
  rawCards: Array<{ name: string; count: number }>,
  nameMap: Map<string, string>,
  civMap: Map<string, string[]>
): MatchResult {
  const cards: CardEntry[] = []
  const unmatched: string[] = []
  const civSet = new Set<string>()

  for (const { name, count } of rawCards) {
    // Try original name first, then normalized form
    const id = nameMap.get(name) ?? nameMap.get(normalizeCardName(name))
    if (id) {
      cards.push({ id, count })
      const civs = civMap.get(id) ?? []
      for (const civ of civs) civSet.add(civ)
    } else {
      unmatched.push(`${name}(${count})`)
    }
  }

  const validated = unmatched.length === 0
  const validationNote = validated
    ? ''
    : `Unmatched cards: ${unmatched.join(', ')}`

  return {
    cards,
    civilizations: Array.from(civSet).sort(),
    validated,
    validationNote,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const limitEnv = process.env['LIMIT']
  const urlLimit = limitEnv ? parseInt(limitEnv, 10) : Infinity

  // Load card data
  console.log('Loading cards.json...')
  const cards: CardJson[] = JSON.parse(readFileSync(CARDS_JSON_PATH, 'utf-8'))
  const nameMap = buildCardNameMap(cards)
  const civMap = buildCivMap(cards)
  console.log(`  Loaded ${cards.length} cards`)

  // Fetch CDX entries
  const cdxEntries = await fetchCdxEntries()
  console.log(`  CDX entries: ${cdxEntries.length}`)

  // Apply LIMIT
  const entries = cdxEntries.slice(0, urlLimit === Infinity ? undefined : urlLimit)
  console.log(`  Processing: ${entries.length} entries`)

  // Ensure output directory exists
  mkdirSync(join(__dirname, '../../public/data'), { recursive: true })

  // Load existing recipes for idempotent / deduplication support
  let recipes: Recipe[] = []
  if (existsSync(OUTPUT_PATH)) {
    try {
      recipes = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'))
      console.log(`  Loaded ${recipes.length} existing recipes from output file`)
    } catch {
      console.warn('  Could not parse existing recipes.json; starting fresh')
    }
  }

  // Build set of already-seen Wayback URLs for deduplication
  const seenUrls = new Set<string>(recipes.map(r => r.source.url))

  // Next recipe ID index (continue from existing max)
  let rcpIndex = recipes.length > 0
    ? Math.max(...recipes.map(r => parseInt(r.id.replace('rcp-', ''), 10))) + 1
    : 1

  for (let i = 0; i < entries.length; i++) {
    const [timestamp, originalUrl] = entries[i]
    const waybackUrl = buildWaybackUrl(timestamp, originalUrl)

    console.log(`\n[${i + 1}/${entries.length}] ${originalUrl}`)

    // Skip already-processed URLs (idempotent re-runs)
    if (seenUrls.has(waybackUrl)) {
      console.log('  Already processed; skipping')
      continue
    }

    // Rate limit (skip before first request too to be polite)
    if (i > 0) await sleep(RATE_LIMIT_MS)

    const buf = await fetchBytes(waybackUrl)
    if (!buf) {
      console.warn('  Skipping (fetch failed)')
      continue
    }

    const parsed = parseDeckHtml(buf)
    if (!parsed) {
      console.warn('  Skipping (no card rows found)')
      continue
    }

    console.log(`  Deck: "${parsed.name}" — ${parsed.rawCards.length} distinct cards`)

    const matchResult = matchCards(parsed.rawCards, nameMap, civMap)

    const recipeId = `rcp-${String(rcpIndex).padStart(4, '0')}`
    rcpIndex++

    const recipe: Recipe = {
      id: recipeId,
      name: parsed.name,
      cards: matchResult.cards,
      civilizations: matchResult.civilizations,
      ...(parsed.archetype ? { archetype: parsed.archetype } : {}),
      ...(parsed.author ? { author: parsed.author } : {}),
      source: {
        type: 'scraped',
        url: waybackUrl,
        collectedAt: new Date().toISOString(),
      },
      tags: [],
      validated: matchResult.validated,
      validationNote: matchResult.validationNote,
    }

    recipes.push(recipe)
    seenUrls.add(waybackUrl)

    const status = matchResult.validated ? 'validated' : `unmatched: ${matchResult.validationNote.slice(0, 60)}`
    console.log(`  ${recipeId} ${status}`)
  }

  // Write output
  writeFileSync(OUTPUT_PATH, JSON.stringify(recipes, null, 2), 'utf-8')

  const validated = recipes.filter(r => r.validated).length
  console.log('\n=== Summary ===')
  console.log(`Total recipes collected : ${recipes.length}`)
  console.log(`Validated (Classic08)   : ${validated}`)
  console.log(`Not validated           : ${recipes.length - validated}`)
  console.log(`Output: ${OUTPUT_PATH}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
