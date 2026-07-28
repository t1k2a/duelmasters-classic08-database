/**
 * DB不要で DM拡張パックの「SR枠」(ID: dm27-s01 形式) の生HTMLを取得・キャッシュする補助スクリプト。
 *
 * 本体スクレイパー src/scraper/run-dm.ts は取得と同時に prisma(PostgreSQL) へ upsert するため
 * DB稼働が前提。一方 cards.json は scripts/build-json.ts が data/raw/{SET}/*.html を直接パースして
 * 生成する設計（DB非依存）なので、Postgres を用意できない環境では「このスクリプトで生HTMLを
 * キャッシュ → build-json.ts で cards.json 再生成」という経路で取り込みできる。
 * 位置づけは scripts/fetch-dmc-html.ts と同じ（あちらは通常枠の連番、こちらは SR 枠）。
 *
 * 取得ループの挙動（ID列挙・3連続ミスで打ち切り・fetch-detail.ts の2秒レート制御）は
 * run-dm.ts の SR 列挙部と同じ。違いは prisma への upsert を行わない点のみ。
 *
 * 注意: 公式DBは存在しないIDにも HTTP 200 で「該当なし」シェルを返すことがあるため、
 * 取得成功の判定は isValidCardPage()（cardDetail の有無）で行う。
 * fetch-detail.ts はファイル存在＝キャッシュヒットなので、既存ファイルは再取得も上書きもされない。
 * 本スクリプトが「今回新規に保存した」かつ「有効なカードページでない」ファイルのみ後片付けで削除し、
 * data/raw 配下に無効ページのゴミを残さない（既存ファイルには一切触れない）。
 *
 * Usage:
 *   SETS=DM-27,DM-28,DM-29,DM-30 tsx scripts/fetch-dm-sr-html.ts
 */

import { access, unlink } from 'fs/promises'
import { join } from 'path'
import { fetchCardDetail, RAW_DIR } from '../src/scraper/fetch-detail.js'
import { isValidCardPage } from '../src/scraper/parse-card.js'

// "DM-27" → "dm27"
function setCodeToPrefix(setCode: string): string {
  return setCode.replace(/-/g, '').toLowerCase()
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function fetchSetSr(setCode: string, maxMiss: number, maxSr: number): Promise<number> {
  const prefix = setCodeToPrefix(setCode)
  let valid = 0
  let consecutive = 0

  for (let i = 1; i <= maxSr; i++) {
    const cardId = `${prefix}-s${String(i).padStart(2, '0')}`
    const filePath = join(RAW_DIR, setCode, `${cardId}.html`)
    const existedBefore = await fileExists(filePath)

    const html = await fetchCardDetail(cardId, setCode)

    if (!html || !isValidCardPage(html)) {
      // 今回新規に保存された無効ページのみ削除（既存ファイルは絶対に消さない）
      if (!existedBefore && (await fileExists(filePath))) await unlink(filePath)
      consecutive++
      if (consecutive >= maxMiss) break
      continue
    }

    consecutive = 0
    valid++
    console.log(`  ✓ ${cardId}${existedBefore ? ' (cached)' : ''}`)
  }
  return valid
}

async function main() {
  const sets = (process.env['SETS'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (!sets.length) {
    console.error('No SETS provided. Example: SETS=DM-27,DM-28 tsx scripts/fetch-dm-sr-html.ts')
    process.exit(1)
  }
  const maxMiss = parseInt(process.env['MAX_MISS'] ?? '3', 10)
  const maxSr = parseInt(process.env['MAX_SR'] ?? '99', 10)

  console.log(`Fetching SR pages for ${sets.length} set(s): ${sets.join(', ')} (MAX_MISS=${maxMiss}, MAX_SR=${maxSr})`)
  let total = 0
  for (const setCode of sets) {
    console.log(`\n=== ${setCode} ===`)
    const valid = await fetchSetSr(setCode, maxMiss, maxSr)
    console.log(`  → ${valid} valid SR card pages cached`)
    total += valid
  }
  console.log(`\nTotal valid SR pages: ${total}`)
}

main().catch(e => { console.error(e); process.exit(1) })
