import { mkdir, writeFile, readFile, access } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
export const RAW_DIR = join(__dirname, '../../data/raw')

const BASE_URL = 'https://dm.takaratomy.co.jp'
const USER_AGENT = 'DuelMasters-Classic08-DB/1.0 (+https://github.com/t1k2a/duelmasters-classic08-database)'
const DELAY_MS = 2000

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Fetch card detail HTML, saving to data/raw/{setCode}/{cardId}.html.
 * Returns cached file if already saved (idempotent).
 */
export async function fetchCardDetail(cardId: string, setCode: string): Promise<string | null> {
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

  if (!res.ok) {
    console.warn(`HTTP ${res.status} for ${cardId}`)
    return null
  }

  const html = await res.text()
  await mkdir(setDir, { recursive: true })
  await writeFile(filePath, html, 'utf-8')
  return html
}
