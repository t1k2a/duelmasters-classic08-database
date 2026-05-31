/**
 * Playwright-based card ID lister for sets where enumeration doesn't work
 * (DMC, DMS, promo, variant sets with unknown URL patterns).
 *
 * Navigates to the listing page (?product={code}), waits for JS to render,
 * and extracts all card detail links.
 */

import { chromium } from 'playwright'

const BASE_URL = 'https://dm.takaratomy.co.jp'
const LISTING_URL = (productCode: string) => `${BASE_URL}/card/?product=${productCode}`

/**
 * Convert set_code to the product URL parameter.
 * "DM-01"    → "dm01"
 * "DMC-09"   → "dmc09"
 * "DMS-01"   → "dms01"
 * "DM-22+1D" → "dm22+1d"
 */
export function setCodeToProductParam(setCode: string): string {
  return setCode.replace(/-/g, '').toLowerCase()
}

/**
 * Get all card IDs for a set using the Playwright listing page.
 * Returns list of card IDs like ["dm01-001", "dm01-002", ...]
 */
export async function listCardIdsByPlaywright(setCode: string): Promise<string[]> {
  const productParam = setCodeToProductParam(setCode)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    const allIds = new Set<string>()
    let pageNum = 1

    while (true) {
      const url = LISTING_URL(productParam) + (pageNum > 1 ? `&paged=${pageNum}` : '')
      console.log(`  Fetching listing page ${pageNum}: ${url}`)

      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

      // Wait for card links to appear (or detect empty page)
      try {
        await page.waitForSelector('a[href*="/card/detail/"]', { timeout: 10000 })
      } catch {
        // No cards found on this page - end of pagination
        break
      }

      // Extract all card detail links
      const links = await page.$$eval(
        'a[href*="/card/detail/?id="]',
        (anchors) => anchors.map(a => a.getAttribute('href') ?? '')
      )

      const cardIds = links
        .map(href => {
          const match = href.match(/[?&]id=([^&]+)/)
          return match ? match[1] : null
        })
        .filter((id): id is string => id !== null)

      const beforeSize = allIds.size
      cardIds.forEach(id => allIds.add(id))
      const newIds = allIds.size - beforeSize

      console.log(`  Page ${pageNum}: found ${cardIds.length} links, ${newIds} new`)

      // Check for next page: look for pagination "next" button
      const hasNext = await page.$('a.next.page-numbers, a[aria-label="Next"]')
      if (!hasNext || newIds === 0) break

      pageNum++

      // Rate limit between pages
      await new Promise(r => setTimeout(r, 2000))
    }

    return Array.from(allIds)
  } finally {
    await browser.close()
  }
}
