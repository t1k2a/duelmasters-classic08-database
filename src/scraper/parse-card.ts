import * as cheerio from 'cheerio'
import type { CardData } from '../types.js'

export function isValidCardPage(html: string): boolean {
  return html.includes("class='cardDetail'") || html.includes('class="cardDetail"')
}

function parsePower(raw: string): number | undefined {
  const s = raw.replace(/,/g, '').replace(/[−－]/g, '-').trim()
  if (!s || s === '-' || s === '—') return undefined
  const n = parseInt(s, 10)
  return isNaN(n) ? undefined : n
}

function parseCivilizations(raw: string): string[] {
  if (!raw.trim()) return []
  return raw.split('/').map(s => s.trim()).filter(Boolean)
}

function parseRaces(raw: string): string[] {
  if (!raw.trim()) return []
  // Races can be separated by "/" e.g. "アーマード・ドラゴン/ビースト・フォーク"
  return raw.split('/').map(s => s.trim()).filter(Boolean)
}

function parseCardNumber(packname: string): string {
  // packname text = "(DM6 1/110)"
  const m = packname.match(/\([A-Z0-9+]+\s+([\d\/]+)\)/)
  return m ? m[1] : ''
}

function parseAbilityText($: cheerio.CheerioAPI): string | undefined {
  const cell = $('td.skills')
  if (!cell.length) return undefined

  // Replace <br> with newline before text extraction
  cell.find('br').replaceWith('\n')

  // <block> tags are non-standard; extract their text inline
  cell.find('block').each((_i, el) => {
    $(el).replaceWith($(el).html() ?? '')
  })

  // Each ability is wrapped in <li> (directly inside <td>, no <ul>)
  const lines: string[] = []
  cell.find('li').each((_i, el) => {
    const line = $(el).text().replace(/\n+/g, '\n').trim()
    if (line) lines.push(line)
  })

  // Fallback: if no <li> found, use raw cell text
  if (!lines.length) {
    const raw = cell.text().replace(/\n+/g, '\n').trim()
    return raw || undefined
  }

  return lines.join('\n') || undefined
}

/**
 * Parse card detail HTML into a CardData object.
 * Returns null if the page is not a valid card page.
 */
export function parseCardHtml(html: string, cardId: string, setCode: string): CardData | null {
  if (!isValidCardPage(html)) return null

  const $ = cheerio.load(html)

  // Card name: h3.card-name text, strip the span.packname child
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
  const illustrator = $('td.illusttxt').text().trim()

  const text = parseAbilityText($)
  const flavorText = $('td.flavor').text().trim() || undefined

  // productCardList: list of set names that include this card
  const additionalSetNames: string[] = []
  $('ul.productCardList li').each((_i, el) => {
    const s = $(el).text().trim()
    if (s) additionalSetNames.push(s)
  })

  const cost = costStr ? parseInt(costStr, 10) : undefined

  return {
    cardId,
    name,
    cardType,
    cost: cost !== undefined && !isNaN(cost) ? cost : undefined,
    power: parsePower(powerStr),
    text,
    flavorText,
    illustrator: illustrator || undefined,
    civilizations: parseCivilizations(civilization),
    races: parseRaces(race),
    setCode,
    cardNumber: parseCardNumber(packname),
    rarity: rarity || undefined,
    additionalSetNames,
  }
}
