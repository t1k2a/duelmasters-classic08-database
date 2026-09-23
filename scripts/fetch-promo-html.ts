import { mkdir, writeFile, readFile, access } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parseCardHtml, isValidCardPage } from '../src/scraper/parse-card.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = join(__dirname, '../data/raw')
const BASE_URL = 'https://dm.takaratomy.co.jp'
const USER_AGENT = 'DuelMasters-Classic08-DB/1.0 (+https://github.com/t1k2a/duelmasters-classic08-database)'
const DELAY_MS = 200

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function setCodeToPrefix(setCode: string): string {
  return setCode.replace(/-/g, '').toLowerCase()
}

async function fetchPromoCard(setCode: string, cardId: string): Promise<string | null> {
  const setDir = join(RAW_DIR, setCode)
  const filePath = join(setDir, `${cardId}.html`)

  if (await fileExists(filePath)) {
    return readFile(filePath, 'utf-8')
  }

  await sleep(DELAY_MS)

  const url = `${BASE_URL}/card/detail/?id=${cardId}`
  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  } catch (err) {
    console.error(`Fetch error for ${cardId}:`, err)
    return null
  }

  if (!res.ok) return null

  const html = await res.text()
  if (!isValidCardPage(html)) return null

  await mkdir(setDir, { recursive: true })
  await writeFile(filePath, html, 'utf-8')
  return html
}

async function fetchSet(setCode: string, maxMiss: number, maxId: number): Promise<number> {
  const prefix = setCodeToPrefix(setCode)
  let valid = 0
  let consecutive = 0

  for (let i = 1; i <= maxId; i++) {
    const cardId = `${prefix}-${String(i).padStart(3, '0')}`
    const html = await fetchPromoCard(setCode, cardId)

    if (!html || !isValidCardPage(html)) {
      consecutive++
      if (consecutive >= maxMiss) {
        console.log(`  Miss threshold (${maxMiss}) reached at ID ${i}. Completed ${setCode}.`)
        break
      }
      continue
    }
    consecutive = 0
    valid++

    const card = parseCardHtml(html, cardId, setCode)
    console.log(`  ✓ ${card ? card.name : cardId} [${cardId}]`)
  }
  return valid
}

async function main() {
  const setsArg = process.env['SETS'] ?? 'PROMO-Y1,PROMO-Y2,PROMO-Y3,PROMO-Y4,PROMO-Y5,PROMO-Y6,PROMO-Y7'
  const sets = setsArg.split(',').map(s => s.trim()).filter(Boolean)
  const maxMiss = parseInt(process.env['MAX_MISS'] ?? '20', 10)
  const maxId = parseInt(process.env['MAX_ID'] ?? '75', 10)

  console.log(`Fetching promo sets: ${sets.join(', ')} (MAX_MISS=${maxMiss}, MAX_ID=${maxId})`)
  let total = 0
  for (const setCode of sets) {
    console.log(`\n=== ${setCode} ===`)
    const valid = await fetchSet(setCode, maxMiss, maxId)
    console.log(`  → ${valid} valid card pages cached for ${setCode}`)
    total += valid
  }
  console.log(`\nTotal valid promo pages across processed sets: ${total}`)
}

main().catch(e => { console.error(e); process.exit(1) })
