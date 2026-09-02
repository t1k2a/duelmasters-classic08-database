import { mkdir, writeFile, readFile, access } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = join(__dirname, '../data/raw')
const BASE_URL = 'https://dm.takaratomy.co.jp'
const USER_AGENT = 'DuelMasters-Classic08-DB/1.0 (+https://github.com/t1k2a/duelmasters-classic08-database)'
const DELAY_MS = 150

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function fileExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function isValidCardPage(html) {
  return html.includes("class='cardDetail'") || html.includes('class="cardDetail"')
}

function extractCardName(html) {
  const m = html.match(/<h3 class='card-name'>([^<]+)/)
  return m ? m[1].trim() : 'Unknown'
}

async function fetchPromoCard(y, num) {
  const setCode = `PROMO-Y${y}`
  const cardId = `promoy${y}-${String(num).padStart(3, '0')}`
  const setDir = join(RAW_DIR, setCode)
  const filePath = join(setDir, `${cardId}.html`)

  if (await fileExists(filePath)) {
    const html = await readFile(filePath, 'utf-8')
    return { cardId, valid: isValidCardPage(html), name: extractCardName(html), cached: true }
  }

  await sleep(DELAY_MS)

  const url = `${BASE_URL}/card/detail/?id=${cardId}`
  let res
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  } catch (err) {
    return { cardId, valid: false }
  }

  if (!res.ok) return { cardId, valid: false }

  const html = await res.text()
  if (!isValidCardPage(html)) return { cardId, valid: false }

  await mkdir(setDir, { recursive: true })
  await writeFile(filePath, html, 'utf-8')
  return { cardId, valid: true, name: extractCardName(html), cached: false }
}

async function fetchSet(y, maxMiss = 15, maxId = 65) {
  const setCode = `PROMO-Y${y}`
  console.log(`\n=== Scanning ${setCode} (maxId=${maxId}, maxMiss=${maxMiss}) ===`)
  let valid = 0
  let consecutive = 0

  for (let i = 1; i <= maxId; i++) {
    const res = await fetchPromoCard(y, i)

    if (!res.valid) {
      consecutive++
      if (consecutive >= maxMiss) {
        console.log(`  Hit ${maxMiss} consecutive misses at ID ${i}. Completed ${setCode}.`)
        break
      }
      continue
    }
    consecutive = 0
    valid++
    console.log(`  ✓ [${res.cardId}] ${res.name} ${res.cached ? '(cached)' : '(fetched)'}`)
  }
  return valid
}

async function main() {
  const years = [1, 2, 3, 4, 5, 6, 7]
  let grandTotal = 0
  for (const y of years) {
    const valid = await fetchSet(y)
    console.log(`  → ${valid} cards in PROMO-Y${y}`)
    grandTotal += valid
  }
  console.log(`\n=== All Promo Sets Finished. Total: ${grandTotal} cards ===`)
}

main().catch(e => { console.error(e); process.exit(1) })
