import { readdir, readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as cheerio from 'cheerio'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = join(__dirname, '../data/raw')
const OUT_DIR = join(__dirname, '../public')
const OUT_FILE = join(OUT_DIR, 'cards.json')

export function isValidCardPage(html) {
  return html.includes("class='cardDetail'") || html.includes('class="cardDetail"')
}

function parsePower(raw) {
  const s = raw.replace(/,/g, '').replace(/[−－]/g, '-').trim()
  if (!s || s === '-' || s === '—') return null
  const n = parseInt(s, 10)
  return isNaN(n) ? null : n
}

function parseCivilizations(raw) {
  if (!raw.trim()) return []
  return raw.split('/').map(s => s.trim()).filter(Boolean)
}

function parseRaces(raw) {
  if (!raw.trim()) return []
  return raw.split('/').map(s => s.trim()).filter(Boolean)
}

export function parseCardNumber(packname) {
  const m = packname.match(/\([A-Z0-9+]+\s+([A-Za-z0-9\/]+)\)/)
  return m ? m[1] : ''
}

function parseAbilityText($) {
  const cell = $('td.skills')
  if (!cell.length) return null

  cell.find('br').replaceWith('\n')
  cell.find('block').each((_i, el) => {
    $(el).replaceWith($(el).html() ?? '')
  })

  const lines = []
  cell.find('li').each((_i, el) => {
    const line = $(el).text().replace(/\n+/g, '\n').trim()
    if (line) lines.push(line)
  })

  if (!lines.length) {
    const raw = cell.text().replace(/\n+/g, '\n').trim()
    return raw || null
  }

  return lines.join('\n') || null
}

export function parseCardHtml(html, cardId, setCode) {
  if (!isValidCardPage(html)) return null

  const $ = cheerio.load(html)

  const h3 = $('h3.card-name')
  const packname = h3.find('span.packname').text().trim()
  h3.find('span.packname').remove()
  const name = h3.text().trim()
  if (!name) return null

  const cardType = $('td.type').text().trim()
  const civilization = $('td.civil').text().trim()
  const rarity = $('td.rarelity').text().trim()
  const powerStr = $('td.power').text().trim()
  const costStr = $('td.cost').text().trim()
  const race = $('td.race').text().trim()

  const text = parseAbilityText($)

  const additionalSetNames = []
  $('ul.productCardList li').each((_i, el) => {
    const s = $(el).text().trim()
    if (s) additionalSetNames.push(s)
  })

  const cost = costStr ? parseInt(costStr, 10) : null

  return {
    cardId,
    name,
    cardType,
    cost: cost !== null && !isNaN(cost) ? cost : null,
    power: parsePower(powerStr),
    civilizations: parseCivilizations(civilization),
    races: parseRaces(race),
    rarity: rarity || null,
    text,
    setCode,
    cardNumber: parseCardNumber(packname),
    additionalSetNames,
  }
}

async function main() {
  const setDirs = (await readdir(RAW_DIR)).sort()

  const cards = new Map()
  let total = 0
  let parsed = 0
  let skipped = 0

  for (const setCode of setDirs) {
    const setDir = join(RAW_DIR, setCode)
    let files
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
      const printing = {
        setCode: card.setCode,
        cardNumber: card.cardNumber,
        rarity: card.rarity ?? null,
      }

      if (cards.has(card.name)) {
        const existing = cards.get(card.name)
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

  const result = Array.from(cards.values())

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT_FILE, JSON.stringify(result, null, 2))

  const sizeKB = Math.round(JSON.stringify(result).length / 1024)
  console.log(`HTML files  : ${total}`)
  console.log(`Parsed      : ${parsed}`)
  console.log(`Skipped     : ${skipped}`)
  console.log(`Unique cards: ${result.length}`)
  console.log(`Output      : ${OUT_FILE} (${sizeKB} KB)`)
}

main().catch(e => { console.error(e); process.exit(1) })
