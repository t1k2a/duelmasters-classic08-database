/**
 * DB不要で DMC/DMS セットの生HTMLを取得・キャッシュする補助スクリプト。
 *
 * 本体スクレイパー src/scraper/run-dmc.ts は取得と同時に prisma(PostgreSQL) へ
 * upsert するためDB稼働が前提。一方 cards.json は scripts/build-json.ts が
 * data/raw/{SET}/*.html を直接パースして生成する設計（DB非依存）なので、
 * Postgres を用意できない環境では「このスクリプトで生HTMLをキャッシュ →
 * build-json.ts で cards.json 再生成」という経路で取り込みできる。
 *
 * run-dmc.ts との関係: スクレイプ部（ID連番列挙・無効ページの連続打ち切り・
 * fetch-detail.ts の 2秒レート制御）は run-dmc.ts と同じ挙動で、違いは prisma への
 * upsert を行わない点のみ。run-dmc.ts 側のループは reprint判定/upsert がDB呼び出しと
 * 密に絡んでおり、HTML取得だけを切り出した共通関数が存在しないため、ここでは取得
 * ループを最小限コピーしている（共通化は run-dmc.ts のリファクタが必要で別件）。
 *
 * DMCセットはID連番が大きく歯抜けのことがある（例: DMC-46 は 005 の後 010/011/012/
 * 018/020... と飛ぶ）。run-dmc.ts 既定の「5連続ミスで打ち切り」では取りこぼすため、
 * 打ち切り閾値(MAX_MISS)と探索上限(MAX_ID)を環境変数で広げられるようにしている。
 *
 * Usage:
 *   SETS=DMC-46 tsx scripts/fetch-dmc-html.ts
 *   SETS=DMC-34,DMC-42 MAX_MISS=40 MAX_ID=150 tsx scripts/fetch-dmc-html.ts
 */

import { fetchCardDetail } from '../src/scraper/fetch-detail.js'
import { isValidCardPage } from '../src/scraper/parse-card.js'

// "DMC-46" → "dmc46", "DMS-02" → "dms02"
function setCodeToPrefix(setCode: string): string {
  return setCode.replace(/-/g, '').toLowerCase()
}

async function fetchSet(setCode: string, maxMiss: number, maxId: number): Promise<number> {
  const prefix = setCodeToPrefix(setCode)
  let valid = 0
  let consecutive = 0

  for (let i = 1; i <= maxId; i++) {
    const cardId = `${prefix}-${String(i).padStart(3, '0')}`
    const html = await fetchCardDetail(cardId, setCode)

    if (!html || !isValidCardPage(html)) {
      consecutive++
      if (consecutive >= maxMiss) break
      continue
    }
    consecutive = 0
    valid++
  }
  return valid
}

async function main() {
  const sets = (process.env['SETS'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (!sets.length) {
    console.error('No SETS provided. Example: SETS=DMC-34,DMC-37 tsx scripts/fetch-dmc-html.ts')
    process.exit(1)
  }
  const maxMiss = parseInt(process.env['MAX_MISS'] ?? '5', 10)
  const maxId = parseInt(process.env['MAX_ID'] ?? '999', 10)

  console.log(`Fetching ${sets.length} set(s): ${sets.join(', ')} (MAX_MISS=${maxMiss}, MAX_ID=${maxId})`)
  let total = 0
  for (const setCode of sets) {
    console.log(`\n=== ${setCode} ===`)
    const valid = await fetchSet(setCode, maxMiss, maxId)
    console.log(`  → ${valid} valid card pages cached`)
    total += valid
  }
  console.log(`\nTotal valid pages: ${total}`)
}

main().catch(e => { console.error(e); process.exit(1) })
