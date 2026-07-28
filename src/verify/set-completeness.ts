/**
 * セット完全性検証（DB非依存）
 *
 * 背景: スクレイパーが途中で停止しても誰も気づけず、DM-27〜30 のSR枠25枚が
 * 欠落したまま cards.json が生成され続けていた（サイレント失敗）。
 *
 * 対策: 各カードページの span.packname には「分母」が入っている
 * （例 "(DM6 1/110)" の 110、"(DM28 s1/s10)" の s10）。この分母を正として
 * 「セット×系列ごとに分母どおりの枚数が揃っているか」を検査し、欠番を明示する。
 *
 * data/raw/{SET}/*.html を直接読むため Postgres 不要（src/verify/phase3.ts は
 * Prisma 依存で、今回壊れた data/raw → build-json.ts → cards.json の経路を
 * カバーできないので別モジュールにしている）。
 *
 * Usage:
 *   npm run verify:sets                 # DM-01〜DM-30 を検査
 *   SETS=DM-28,DM-29 npm run verify:sets
 * 欠落があれば非ゼロ終了する。
 */

import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { parseCardHtml, isValidCardPage } from '../scraper/parse-card.js'
import { RAW_DIR } from '../scraper/fetch-detail.js'

export interface PackNumber {
  /** 系列。通常枠は ''、SR枠は 'S'（公式の大文字/小文字の揺れは 'S' に正規化） */
  series: string
  index: number
  total: number
}

export interface Entry {
  setCode: string
  cardNumber: string
  /** 報告メッセージ用（任意） */
  cardId?: string
  name?: string
}

export interface SeriesReport {
  setCode: string
  series: string
  expected: number
  actual: number
  missing: number[]
  complete: boolean
  /** 同一系列で複数の分母が観測された場合（再録などの混入）に立つ */
  conflictingTotals: number[]
  /** 期待されている系列が1件も観測されなかった（分母すら分からない）状態 */
  absent: boolean
}

export interface CompletenessResult {
  reports: SeriesReport[]
  /** cardNumber が空 or 解釈不能なもの。正規表現の取りこぼしを表面化させる */
  unparsable: Entry[]
}

/**
 * 各セットが持つはずの系列のマニフェスト。
 * 観測データからしか系列を組み立てないと「系列が丸ごと0件」を検出できないため
 * （DM-27 の S枠が0件のまま通っていたのがまさにこれ）、期待値を外から与える。
 * DM-01〜DM-30 はいずれも通常枠とSR枠(S)の2系列を持つ。
 */
export const EXPECTED_SERIES_BY_SET: Record<string, string[]> = Object.fromEntries(
  Array.from({ length: 30 }, (_v, i) => [`DM-${String(i + 1).padStart(2, '0')}`, ['', 'S']])
)

/** 検査対象セットに対する期待系列マップを返す。マニフェスト未登録のセットは検査対象外 */
export function expectedSeriesFor(setCodes: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const setCode of setCodes) {
    const series = EXPECTED_SERIES_BY_SET[setCode]
    if (series) map.set(setCode, series)
  }
  return map
}

/** "1/110" → {series:'', index:1, total:110} / "s6/s10" → {series:'S', index:6, total:10} */
export function parsePackNumber(cardNumber: string): PackNumber | null {
  const m = cardNumber.match(/^([A-Za-z]*)(\d+)\/([A-Za-z]*)(\d+)$/)
  if (!m) return null
  const [, prefixL, idx, prefixR, total] = m
  // 分子と分母で系列接頭辞が食い違う表記は想定外なので弾く
  if (prefixL!.toUpperCase() !== prefixR!.toUpperCase()) return null
  return {
    series: prefixL!.toUpperCase(),
    index: parseInt(idx!, 10),
    total: parseInt(total!, 10),
  }
}

/** 最も多く観測された分母を採用する（他セットからの再録が1件混ざっても引きずられない） */
function dominantTotal(totals: number[]): number {
  const counts = new Map<number, number>()
  for (const t of totals) counts.set(t, (counts.get(t) ?? 0) + 1)
  let best = 0
  let bestCount = -1
  for (const [total, count] of counts) {
    if (count > bestCount || (count === bestCount && total > best)) {
      best = total
      bestCount = count
    }
  }
  return best
}

export function checkCompleteness(
  entries: Entry[],
  expectedSeries?: Map<string, string[]>
): CompletenessResult {
  const groups = new Map<string, { setCode: string; series: string; parsed: PackNumber[] }>()
  const unparsable: Entry[] = []

  // 期待系列を先に空グループとして起こしておく。こうしないと観測0件の系列は
  // グループ自体が存在せず、欠落が報告されないまま通ってしまう
  if (expectedSeries) {
    for (const [setCode, seriesList] of expectedSeries) {
      for (const series of seriesList) {
        groups.set(`${setCode}|${series}`, { setCode, series, parsed: [] })
      }
    }
  }

  for (const entry of entries) {
    const parsed = parsePackNumber(entry.cardNumber ?? '')
    if (!parsed) {
      unparsable.push(entry)
      continue
    }
    const key = `${entry.setCode}|${parsed.series}`
    let g = groups.get(key)
    if (!g) {
      g = { setCode: entry.setCode, series: parsed.series, parsed: [] }
      groups.set(key, g)
    }
    g.parsed.push(parsed)
  }

  const reports: SeriesReport[] = []
  for (const g of groups.values()) {
    if (g.parsed.length === 0) {
      reports.push({
        setCode: g.setCode,
        series: g.series,
        expected: 0,
        actual: 0,
        missing: [],
        complete: false,
        conflictingTotals: [],
        absent: true,
      })
      continue
    }
    const totals = g.parsed.map(p => p.total)
    const expected = dominantTotal(totals)
    const present = new Set(g.parsed.filter(p => p.total === expected).map(p => p.index))
    const missing: number[] = []
    for (let i = 1; i <= expected; i++) if (!present.has(i)) missing.push(i)
    const conflictingTotals = [...new Set(totals)].filter(t => t !== expected).sort((a, b) => a - b)

    reports.push({
      setCode: g.setCode,
      series: g.series,
      expected,
      actual: present.size,
      missing,
      complete: missing.length === 0,
      conflictingTotals,
      absent: false,
    })
  }

  reports.sort((a, b) => a.setCode.localeCompare(b.setCode) || a.series.localeCompare(b.series))
  return { reports, unparsable }
}

/**
 * 検査対象に指定したのに1件も取得できていないセットを返す。
 * 「対象0件だから合格」というサイレント成功を防ぐための番人。
 */
export function findEmptySets(setCodes: string[], entries: Entry[]): string[] {
  const seen = new Set(entries.map(e => e.setCode))
  return setCodes.filter(s => !seen.has(s))
}

/** data/raw/{SET}/*.html を読み、検査対象の Entry を集める */
export async function collectEntries(setCodes: string[]): Promise<Entry[]> {
  const entries: Entry[] = []
  for (const setCode of setCodes) {
    let files: string[]
    try {
      files = (await readdir(join(RAW_DIR, setCode))).filter(f => f.endsWith('.html')).sort()
    } catch {
      console.warn(`  ! ${setCode}: data/raw/${setCode} が存在しません`)
      continue
    }
    for (const file of files) {
      const cardId = file.replace('.html', '')
      const html = await readFile(join(RAW_DIR, setCode, file), 'utf-8')
      if (!isValidCardPage(html)) continue
      const card = parseCardHtml(html, cardId, setCode)
      if (!card) continue
      entries.push({ setCode, cardNumber: card.cardNumber, cardId, name: card.name })
    }
  }
  return entries
}

async function main() {
  const envSets = (process.env['SETS'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const setCodes = envSets.length
    ? envSets
    : Array.from({ length: 30 }, (_v, i) => `DM-${String(i + 1).padStart(2, '0')}`)

  console.log(`=== Set Completeness Verification (${setCodes.length} sets) ===\n`)

  const entries = await collectEntries(setCodes)
  const { reports, unparsable } = checkCompleteness(entries, expectedSeriesFor(setCodes))

  let failures = 0

  const emptySets = findEmptySets(setCodes, entries)
  for (const setCode of emptySets) {
    failures++
    console.log(`  ✗ ${setCode}: 有効なカードページが1件もありません（未取得の可能性）`)
  }

  for (const r of reports) {
    const label = `${r.setCode}${r.series ? ` [${r.series}枠]` : ' [通常枠]'}`
    if (r.absent) {
      failures++
      console.log(`  ✗ ${label}: 1件も取得できていません（系列ごと欠落）`)
      continue
    }
    if (r.complete) {
      console.log(`  ✓ ${label}: ${r.actual}/${r.expected}`)
    } else {
      failures++
      console.log(`  ✗ ${label}: ${r.actual}/${r.expected}  欠番: ${r.missing.join(', ')}`)
    }
    if (r.conflictingTotals.length) {
      console.log(`      （別系列の分母も観測: ${r.conflictingTotals.join(', ')} — 再録の混入と思われる）`)
    }
  }

  if (unparsable.length) {
    failures++
    console.log(`\n  ✗ cardNumber を解釈できないページ ${unparsable.length} 件:`)
    for (const e of unparsable.slice(0, 20)) {
      console.log(`      ${e.setCode} ${e.cardId} "${e.cardNumber}" ${e.name ?? ''}`)
    }
    if (unparsable.length > 20) console.log(`      ... ほか ${unparsable.length - 20} 件`)
  }

  console.log(`\n検査した系列: ${reports.length} / カードページ: ${entries.length}`)

  if (failures > 0) {
    console.error(`\n=== FAILED: ${failures} 件の問題を検出しました ===`)
    console.error('スクレイピングが途中で停止している可能性があります。')
    console.error('SR枠は  SETS=DM-XX tsx scripts/fetch-dm-sr-html.ts  で取得できます。')
    process.exit(1)
  }

  console.log('\n=== OK: すべてのセットが分母どおり揃っています ===')
}

// CLI として直接実行されたときだけ main を走らせる（テストからの import では走らせない）
// （.test.ts から import されたときに main が走らないよう、末尾一致で判定する）
if (process.argv[1]?.endsWith('set-completeness.ts')) {
  main().catch(e => { console.error(e); process.exit(1) })
}
