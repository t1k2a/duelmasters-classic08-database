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
import { buildMatchIndex, matchCardName, type MatchIndex } from './recipe-match.js'
import { parseCheckpoint, resumeState, appendRecord, shouldSafeStop, type CheckpointRecord } from './checkpoint.js'

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

// CDX の年範囲・件数は環境変数で上書き可能（既定は従来の 2007-2010 / 500 件）。
// サンプリング用途: SCRAPE_FROM=2009 SCRAPE_TO=2009 SCRAPE_CDX_LIMIT=800 など。
const CDX_FROM = process.env['SCRAPE_FROM'] ?? '2007'
const CDX_TO = process.env['SCRAPE_TO'] ?? '2010'
const CDX_LIMIT = process.env['SCRAPE_CDX_LIMIT'] ?? '500'

function buildCdxUrl(): string {
  return 'http://web.archive.org/cdx/search/cdx' +
    '?url=dmvault.ath.cx/deck' +
    '&matchType=prefix' +
    '&collapse=urlkey' +
    '&output=json' +
    `&from=${CDX_FROM}` +
    `&to=${CDX_TO}` +
    `&limit=${CDX_LIMIT}`
}

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

/**
 * Fetch with a single exponential-backoff retry. archive.org は一過性の 5xx を返すため、
 * 1回だけ待って再試行する（過度に複雑にしない）。両方失敗したら null。
 */
async function fetchBytesRetry(url: string, retries = 1, baseDelayMs = 5000): Promise<Buffer | null> {
  let delay = baseDelayMs
  for (let attempt = 0; attempt <= retries; attempt++) {
    const buf = await fetchBytes(url)
    if (buf) return buf
    if (attempt < retries) {
      console.warn(`  retry in ${delay}ms...`)
      await sleep(delay)
      delay *= 2
    }
  }
  return null
}

/** Fetch CDX JSON and return [timestamp, original_url][] pairs. */
async function fetchCdxEntries(): Promise<Array<[string, string]>> {
  console.log('Fetching CDX index...')
  const bytes = await fetchBytes(buildCdxUrl())
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

// Card name normalization / matching lives in recipe-match.ts (shared with rematch-recipes.ts).
// It strips reading-kana brackets and applies normalizeKana so DM Vault notation matches cards.json.

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
  idx: MatchIndex
): MatchResult {
  const cards: CardEntry[] = []
  const unmatched: string[] = []
  const civSet = new Set<string>()

  for (const { name, count } of rawCards) {
    const id = matchCardName(name, idx)
    if (id) {
      cards.push({ id, count })
      const civs = idx.civById.get(id) ?? []
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
// Resume 反映
// ---------------------------------------------------------------------------

/**
 * resume 復元済みレシピを出力の初期状態へ反映する。
 * - sample モード（SCRAPE_OUT）: 新規配列を基点にする（recipes.json は触らない）。
 * - default モード（recipes.json 直書き）: 既存レシピを基点にする。
 * どちらのモードでも復元済みレシピを連結して取りこぼさない
 * （旧実装は sampleMode 限定で push しており、default モードで復元分が消失していた）。
 * 返り値は新しい配列で、渡した existing は破壊しない。
 */
export function seedResumedOutput<T>(sampleMode: boolean, existing: T[], restored: T[]): T[] {
  const base = sampleMode ? [] : [...existing]
  return [...base, ...restored]
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const limitEnv = process.env['LIMIT']
  const urlLimit = limitEnv ? parseInt(limitEnv, 10) : Infinity

  // Sampling mode: when SCRAPE_OUT is set, collect into a separate file (never touch recipes.json),
  // deduped against the existing 462, and stop after SCRAPE_LIMIT newly-collected recipes.
  const sampleOut = process.env['SCRAPE_OUT']
  const sampleMode = Boolean(sampleOut)
  const targetNew = process.env['SCRAPE_LIMIT'] ? parseInt(process.env['SCRAPE_LIMIT'], 10) : Infinity

  // Load card data
  console.log('Loading cards.json...')
  const cards: CardJson[] = JSON.parse(readFileSync(CARDS_JSON_PATH, 'utf-8'))
  const idx = buildMatchIndex(cards)
  console.log(`  Loaded ${cards.length} cards`)

  // Fetch CDX entries
  const cdxEntries = await fetchCdxEntries()
  console.log(`  CDX entries: ${cdxEntries.length}`)

  // Apply LIMIT (caps how many CDX rows we iterate over)
  const entries = cdxEntries.slice(0, urlLimit === Infinity ? undefined : urlLimit)
  console.log(`  Processing: ${entries.length} entries (mode=${sampleMode ? 'sample' : 'default'})`)

  // Ensure output directory exists (default output only)
  mkdirSync(join(__dirname, '../../public/data'), { recursive: true })

  // Load existing recipes for idempotent / deduplication support
  let existing: Recipe[] = []
  if (existsSync(OUTPUT_PATH)) {
    try {
      existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'))
      console.log(`  Loaded ${existing.length} existing recipes for dedup`)
    } catch {
      console.warn('  Could not parse existing recipes.json; starting fresh')
    }
  }

  // Build set of already-seen Wayback URLs for deduplication (always vs existing 462)
  const seenUrls = new Set<string>(existing.map(r => r.source.url))

  // --- Checkpoint resume ---
  // SCRAPE_CHECKPOINT が指定されファイルがあれば、処理済み URL と収集済みレシピを復元して続きから。
  // fetch 失敗（'failed'）は processed に含まれないため、再開時に自動で再取得される。
  const checkpointPath = process.env['SCRAPE_CHECKPOINT']
  let restored: Recipe[] = []
  if (checkpointPath && existsSync(checkpointPath)) {
    const { processed, recipes } = resumeState<Recipe>(parseCheckpoint<Recipe>(readFileSync(checkpointPath, 'utf-8')))
    for (const u of processed) seenUrls.add(u)
    restored = recipes
    console.log(`  Resumed from checkpoint: ${processed.size} processed URLs, ${restored.length} recipes restored`)
  }

  // 出力の初期状態。sample モードは新規配列、default モードは既存(recipes.json)を基点に、
  // どちらも復元済みレシピを反映する（default モードでの復元漏れを防ぐ）。
  const output: Recipe[] = seedResumedOutput(sampleMode, existing, restored)
  const writeCheckpoint = (rec: CheckpointRecord<Recipe>): void => {
    if (checkpointPath) appendRecord(checkpointPath, rec)
  }

  // Next recipe ID index (continue from max of existing + restored)
  const allForId = [...existing, ...restored]
  let rcpIndex = allForId.length > 0
    ? Math.max(...allForId.map(r => parseInt(r.id.replace('rcp-', ''), 10))) + 1
    : 1

  // Sampling stats（collected は targetNew 判定用に復元分を含める。今セッション新規は collected - restored.length）
  let fetchAttempts = 0, fetchOk = 0, parseOk = 0
  let collected = restored.length
  const restoredCount = restored.length
  let firstFetch = true

  // 連続 fetch 失敗が閾値に達したら安全停止（途中経過はチェックポイント/出力に保持済み）。
  let consecutiveFailures = 0
  const MAX_CONSECUTIVE_FAILURES = 20
  let stoppedEarly = false

  for (let i = 0; i < entries.length; i++) {
    if (sampleMode && collected >= targetNew) break

    const [timestamp, originalUrl] = entries[i]
    const waybackUrl = buildWaybackUrl(timestamp, originalUrl)

    console.log(`\n[${i + 1}/${entries.length}] ${originalUrl}`)

    // Skip already-processed URLs (idempotent re-runs / dedup vs existing 462)
    if (seenUrls.has(waybackUrl)) {
      console.log('  Already processed; skipping')
      continue
    }

    // Rate limit before every actual network fetch (never faster than 2.5s/req)
    if (!firstFetch) await sleep(RATE_LIMIT_MS)
    firstFetch = false

    fetchAttempts++
    const buf = await fetchBytesRetry(waybackUrl)
    if (!buf) {
      consecutiveFailures++
      // 一過性失敗として記録（processed には入らず、再開時に再取得される）。
      writeCheckpoint({ url: waybackUrl, status: 'failed' })
      console.warn(`  Skipping (fetch failed) — consecutive failures: ${consecutiveFailures}`)
      if (shouldSafeStop(consecutiveFailures, MAX_CONSECUTIVE_FAILURES)) {
        console.error(`\n!! ${MAX_CONSECUTIVE_FAILURES} consecutive fetch failures — stopping safely. Progress is preserved in the checkpoint; re-run with the same SCRAPE_CHECKPOINT to resume.`)
        stoppedEarly = true
        break
      }
      continue
    }
    consecutiveFailures = 0
    fetchOk++

    const parsed = parseDeckHtml(buf)
    if (!parsed) {
      console.warn('  Skipping (no card rows found)')
      // 決定論的失敗（デッキ非該当）は processed として記録し、再開時に再取得しない。
      seenUrls.add(waybackUrl)
      writeCheckpoint({ url: waybackUrl, status: 'empty' })
      continue
    }
    parseOk++

    console.log(`  Deck: "${parsed.name}" — ${parsed.rawCards.length} distinct cards`)

    const matchResult = matchCards(parsed.rawCards, idx)

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

    output.push(recipe)
    seenUrls.add(waybackUrl)
    collected++
    writeCheckpoint({ url: waybackUrl, status: 'collected', recipe })

    const status = matchResult.validated ? 'validated' : `unmatched: ${matchResult.validationNote.slice(0, 60)}`
    console.log(`  ${recipeId} ${status}`)
  }

  // Write output (sample mode → SCRAPE_OUT, default → recipes.json)
  const outPath = sampleMode ? sampleOut! : OUTPUT_PATH
  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8')

  if (sampleMode) {
    // Stats over the freshly-collected sample only.
    const isForty = (r: Recipe) => r.cards.reduce((s, c) => s + c.count, 0) === 40
    const validated = output.filter(r => r.validated)
    const validated40 = validated.filter(isForty)
    console.log('\n=== Sample Summary ===')
    console.log(`Year range          : ${CDX_FROM}-${CDX_TO}`)
    console.log(`Stopped early       : ${stoppedEarly ? 'YES (consecutive fetch failures)' : 'no'}`)
    console.log(`Restored (resume)   : ${restoredCount}`)
    console.log(`Fetch attempts      : ${fetchAttempts}`)
    console.log(`Fetch ok            : ${fetchOk}`)
    console.log(`Parse ok            : ${parseOk}`)
    console.log(`Collected this run  : ${collected - restoredCount}`)
    console.log(`Collected total     : ${output.length}`)
    console.log(`Validated           : ${validated.length}`)
    console.log(`Validated & 40      : ${validated40.length}`)
    console.log(`Output: ${outPath}`)
  } else {
    const validated = output.filter(r => r.validated).length
    console.log('\n=== Summary ===')
    console.log(`Total recipes collected : ${output.length}`)
    console.log(`Validated (Classic08)   : ${validated}`)
    console.log(`Not validated           : ${output.length - validated}`)
    console.log(`Output: ${OUTPUT_PATH}`)
  }
}

// 直接起動時のみ実行（テストから純ロジックを import しても scrape が走らないようにする）。
if (process.argv[1] && process.argv[1].endsWith('scrape-recipes.ts')) {
  main().catch(e => {
    console.error(e)
    process.exit(1)
  })
}
