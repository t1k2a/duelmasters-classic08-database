/**
 * デッキレシピのカードプール判定（クラシック08スコープ = 発売 ≤ 2008-12-31）
 *
 * 背景: public/data/recipes.json は DM Vault のアーカイブから収集しており、
 * クラシック08のカードプール外（DM-31以降）のレシピが大量に混入している。
 * 「どのレシピがスコープ内か」を人手のスプレッドシートではなくコードで再現可能にする。
 *
 * 判定は4層。上から順に適用し、決まった時点で確定する:
 *   層1 cards.json 照合   … recipe-match.ts の canonicalCardName で解決できれば in
 *   層2 アーカイブ日付論法 … スナップショット年より後に出たカードはそのデッキに入り得ない。
 *                            よって ≤2008 のスナップショットに出る名前は 2008年以前のカードと証明できる
 *   層3 プール外インデックス … data/seeds/out_of_pool_{strong,weak}.json
 *                            strong = DM-31〜39 / DMR 由来（決定的）
 *                            weak   = DMC-47〜61 / DMX / DMD 由来（再録の可能性を排除できない）
 *   層4 残余                … undecided
 *
 * 重要な優先順位: **層2（日付証明）は層3より常に優先**する。weak は再録を排除できず、
 * 日付証明と衝突するケースが実データで20件観測されているため。
 *
 * Usage:
 *   npm run verify:pool
 * 4分類の合計が recipes.json の件数と一致しない場合は非ゼロ終了する。
 */

import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { canonicalCardName, parseUnmatchedNote, type CardLike } from '../scraper/recipe-match.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')

/** クラシック08 = 発売 ≤ 2008-12-31。この年以前のスナップショットはプール外カードを含み得ない */
export const SCOPE_CUTOFF_YEAR = 2008

export type PoolClass = 'IN' | 'OUT_STRONG' | 'OUT_WEAK' | 'UNDECIDED'
export type PoolStatus = 'in' | 'out' | 'undecided'

export interface PoolScopeRecipe {
  id: string
  source: { url: string }
  validationNote?: string
}

/** カード名 → 初出セット（例 "超銀河弾 HELL" → "DM31"） */
export type OutOfPoolIndex = Record<string, string>

export interface ScopeContext {
  /** 照合キー生成。recipe-match.ts の canonicalCardName をそのまま使う（新しい正規化は作らない） */
  canon(name: string): string
  /** cards.json の厳密名 */
  exactNames: Set<string>
  /** cards.json の正規化キー */
  canonNames: Set<string>
  /** 正規化キー → 初出セット（strong） */
  strong: Map<string, string>
  /** 正規化キー → 初出セット（weak） */
  weak: Map<string, string>
}

export function buildScopeContext(
  cards: CardLike[],
  strong: OutOfPoolIndex,
  weak: OutOfPoolIndex
): ScopeContext {
  const toMap = (idx: OutOfPoolIndex) =>
    new Map(Object.entries(idx).map(([name, set]) => [canonicalCardName(name), set]))
  return {
    canon: canonicalCardName,
    exactNames: new Set(cards.map(c => c.name)),
    canonNames: new Set(cards.map(c => canonicalCardName(c.name))),
    strong: toMap(strong),
    weak: toMap(weak),
  }
}

/** Internet Archive の最初期スナップショット。これより前の「年」は壊れたURL由来とみなす */
export const ARCHIVE_MIN_YEAR = 1996

/**
 * web.archive.org のスナップショット年。アーカイブURLでなければ null（年を捏造しない）。
 * `/web/0000/` のような異常値も null にする。数値として ≤2008 なので、そのまま通すと
 * 「日付証明でIN」という最も緩い判定に落ちてしまい、フェイルセーフの向きが逆になるため。
 */
export function archiveYear(url: string): number | null {
  const m = url.match(/web\.archive\.org\/web\/(\d{4})/)
  if (!m) return null
  const year = parseInt(m[1]!, 10)
  if (year < ARCHIVE_MIN_YEAR || year > new Date().getFullYear()) return null
  return year
}

/** validationNote の未マッチ名のうち、cards.json で解決できないものだけを返す（層1） */
export function unresolvedNames(recipe: PoolScopeRecipe, ctx: ScopeContext): string[] {
  return parseUnmatchedNote(recipe.validationNote ?? '')
    .map(u => u.name)
    .filter(name => !ctx.exactNames.has(name) && !ctx.canonNames.has(ctx.canon(name)))
}

/**
 * 層2: ≤2008 のスナップショットに出現する未マッチ名の正規化キー集合。
 * 「そのデッキが存在した時点で既に発売されていた」ため、2008年以前のカードだと証明できる。
 */
export function buildDateProvenNames(recipes: PoolScopeRecipe[], ctx: ScopeContext): Set<string> {
  const proven = new Set<string>()
  for (const r of recipes) {
    const year = archiveYear(r.source.url)
    if (year === null || year > SCOPE_CUTOFF_YEAR) continue
    for (const name of unresolvedNames(r, ctx)) proven.add(ctx.canon(name))
  }
  return proven
}

export interface Classification {
  id: string
  klass: PoolClass
  poolStatus: PoolStatus
  /** 判定の決め手になったプール外カード（OUT_* のとき） */
  evidence: { name: string; set: string }[]
  /** 判定できずに残った名前（UNDECIDED のとき） */
  unresolved: string[]
  year: number | null
}

const STATUS: Record<PoolClass, PoolStatus> = {
  IN: 'in',
  OUT_STRONG: 'out',
  OUT_WEAK: 'out',
  UNDECIDED: 'undecided',
}

export function classifyRecipe(
  recipe: PoolScopeRecipe,
  ctx: ScopeContext,
  dateProven: Set<string>
): Classification {
  const year = archiveYear(recipe.source.url)
  const base = { id: recipe.id, year, evidence: [] as { name: string; set: string }[], unresolved: [] as string[] }

  // 層2: スナップショット自体が ≤2008 なら、そのデッキはプール外カードを含み得ない
  if (year !== null && year <= SCOPE_CUTOFF_YEAR) {
    return { ...base, klass: 'IN', poolStatus: 'in' }
  }

  // 層1 + 層2（名前単位の日付証明。層3 より先に落とすことで weak/strong より優先される）
  const remaining = unresolvedNames(recipe, ctx).filter(n => !dateProven.has(ctx.canon(n)))
  if (remaining.length === 0) return { ...base, klass: 'IN', poolStatus: 'in' }

  // 層3: strong 優先。weak は再録の可能性があるため根拠として弱い扱いにする
  const strongHits = remaining
    .map(name => ({ name, set: ctx.strong.get(ctx.canon(name)) }))
    .filter((h): h is { name: string; set: string } => h.set !== undefined)
  if (strongHits.length) {
    return { ...base, klass: 'OUT_STRONG', poolStatus: STATUS.OUT_STRONG, evidence: strongHits }
  }

  const weakHits = remaining
    .map(name => ({ name, set: ctx.weak.get(ctx.canon(name)) }))
    .filter((h): h is { name: string; set: string } => h.set !== undefined)
  if (weakHits.length) {
    return { ...base, klass: 'OUT_WEAK', poolStatus: STATUS.OUT_WEAK, evidence: weakHits }
  }

  // 層4
  return { ...base, klass: 'UNDECIDED', poolStatus: STATUS.UNDECIDED, unresolved: remaining }
}

export interface ClassifyAllResult {
  results: Classification[]
  counts: Record<PoolClass, number>
  /** アーカイブ年を取り出せなかったレシピ。黙って通さず表面化させる */
  unknownYearIds: string[]
  /** 日付証明でスコープ内と確定した未マッチ名の数 */
  dateProvenCount: number
  /** 日付証明された名前のうち strong にも載っているもの（本来は空。>0 はどちらかが誤り） */
  dateProvenStrongConflicts: { name: string; set: string }[]
  /** 日付証明された名前のうち weak にも載っているもの（再録なので正常。件数の増加だけ監視する） */
  dateProvenWeakOverlaps: { name: string; set: string }[]
}

/** 日付証明された名前とプール外インデックスの交差を取る */
function intersectIndex(
  dateProven: Set<string>,
  index: Map<string, string>
): { name: string; set: string }[] {
  const hits: { name: string; set: string }[] = []
  for (const name of dateProven) {
    const set = index.get(name)
    if (set !== undefined) hits.push({ name, set })
  }
  return hits
}

/**
 * 日付証明（≤2008 のスナップショットに実在）と strong（DM-31以降が初出）は本来両立しない。
 * 実測0件なので、1件でも出たら strong インデックスへの誤り混入とみなして落とす。
 */
export function findDateProvenStrongConflicts(
  dateProven: Set<string>,
  ctx: ScopeContext
): { name: string; set: string }[] {
  return intersectIndex(dateProven, ctx.strong)
}

/**
 * 日付証明と weak（DMC/DMX/DMD 由来）の交差。weak は再録を排除できないため、
 * 交差自体は異常ではない（＝失敗にしない）。実測 KNOWN_WEAK_OVERLAP 件から
 * 増えた場合だけ、再録以外の原因（索引の過剰登録・照合漏れ）を疑う材料として警告する。
 */
export function findDateProvenWeakOverlaps(
  dateProven: Set<string>,
  ctx: ScopeContext
): { name: string; set: string }[] {
  return intersectIndex(dateProven, ctx.weak)
}

/** dateProven ∩ weak の実測値。再録由来で正常な交差の基準線 */
export const KNOWN_WEAK_OVERLAP = 20

export function classifyAll(recipes: PoolScopeRecipe[], ctx: ScopeContext): ClassifyAllResult {
  const dateProven = buildDateProvenNames(recipes, ctx)
  const counts: Record<PoolClass, number> = { IN: 0, OUT_STRONG: 0, OUT_WEAK: 0, UNDECIDED: 0 }
  const results: Classification[] = []
  const unknownYearIds: string[] = []
  for (const r of recipes) {
    const c = classifyRecipe(r, ctx, dateProven)
    if (c.year === null) unknownYearIds.push(r.id)
    counts[c.klass]++
    results.push(c)
  }
  return {
    results,
    counts,
    unknownYearIds,
    dateProvenCount: dateProven.size,
    dateProvenStrongConflicts: findDateProvenStrongConflicts(dateProven, ctx),
    dateProvenWeakOverlaps: findDateProvenWeakOverlaps(dateProven, ctx),
  }
}

/** 判定根拠を人が読める1行にする（recipes.json の poolNote 用） */
export function poolNoteOf(c: Classification): string {
  switch (c.klass) {
    case 'IN':
      return 'in-pool'
    case 'OUT_STRONG':
      return `out-strong: ${c.evidence.map(e => `${e.name}[${e.set}]`).join(', ')}`
    case 'OUT_WEAK':
      return `out-weak: ${c.evidence.map(e => `${e.name}[${e.set}]`).join(', ')}`
    case 'UNDECIDED':
      return `undecided: ${c.unresolved.join(', ')}`
  }
}

// --- I/O --------------------------------------------------------------------

export const RECIPES_PATH = join(ROOT, 'public/data/recipes.json')
export const CARDS_PATH = join(ROOT, 'public/cards.json')
export const STRONG_PATH = join(ROOT, 'data/seeds/out_of_pool_strong.json')
export const WEAK_PATH = join(ROOT, 'data/seeds/out_of_pool_weak.json')

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf-8')) as T
}

/** cards.json と2つのプール外インデックスから ScopeContext を組む */
export async function loadScopeContext(): Promise<ScopeContext> {
  const [cards, strong, weak] = await Promise.all([
    readJson<CardLike[]>(CARDS_PATH),
    readJson<OutOfPoolIndex>(STRONG_PATH),
    readJson<OutOfPoolIndex>(WEAK_PATH),
  ])
  // 空のインデックスで「全部 IN」というサイレント成功を作らないための番人
  if (!cards.length) throw new Error(`${CARDS_PATH} が空です`)
  if (!Object.keys(strong).length) throw new Error(`${STRONG_PATH} が空です`)
  if (!Object.keys(weak).length) throw new Error(`${WEAK_PATH} が空です`)
  return buildScopeContext(cards, strong, weak)
}

export async function loadRecipes(): Promise<PoolScopeRecipe[]> {
  const recipes = await readJson<PoolScopeRecipe[]>(RECIPES_PATH)
  if (!recipes.length) throw new Error(`${RECIPES_PATH} が空です`)
  return recipes
}

/** 期待件数。EXPECTED_TOTAL は調査で確定した値で、ズレたら実装かデータの異常 */
export const EXPECTED_TOTAL = 16813

async function main() {
  console.log('=== Recipe Pool Scope Verification (classic08 = 発売 ≤ 2008-12-31) ===\n')

  const ctx = await loadScopeContext()
  const recipes = await loadRecipes()
  const {
    counts,
    unknownYearIds,
    dateProvenCount,
    dateProvenStrongConflicts,
    dateProvenWeakOverlaps,
    results,
  } = classifyAll(recipes, ctx)

  const total = counts.IN + counts.OUT_STRONG + counts.OUT_WEAK + counts.UNDECIDED
  console.log(`  IN         : ${counts.IN}`)
  console.log(`  OUT-strong : ${counts.OUT_STRONG}`)
  console.log(`  OUT-weak   : ${counts.OUT_WEAK}`)
  console.log(`  UNDECIDED  : ${counts.UNDECIDED}`)
  console.log(`  ---------------------`)
  console.log(`  TOTAL      : ${total} / recipes.json ${recipes.length} 件`)
  console.log(`\n  日付証明でスコープ内と確定した未マッチ名: ${dateProvenCount}`)
  console.log(`  strong インデックス: ${ctx.strong.size} 名 / weak インデックス: ${ctx.weak.size} 名`)

  // 層2（日付証明）は層3（インデックス）を上書きする設計なので、両者の交差を必ず可視化する。
  // 黙って上書きすると、索引の誤りが「INが増える」形で吸収されて気付けない
  console.log(`\n  層2 ∩ 層3 の交差:`)
  console.log(`    dateProven ∩ strong : ${dateProvenStrongConflicts.length} 件（期待 0 / >0 は失敗）`)
  console.log(`    dateProven ∩ weak   : ${dateProvenWeakOverlaps.length} 件（既知 ${KNOWN_WEAK_OVERLAP} / 再録のため正常）`)

  let failures = 0

  if (total !== recipes.length) {
    failures++
    console.error(`\n  ✗ 分類の合計 ${total} がレシピ件数 ${recipes.length} と一致しません（取りこぼし）`)
  }
  if (results.length !== recipes.length) {
    failures++
    console.error(`\n  ✗ 判定結果 ${results.length} 件がレシピ件数 ${recipes.length} と一致しません`)
  }
  if (recipes.length !== EXPECTED_TOTAL) {
    failures++
    console.error(`\n  ✗ recipes.json が ${recipes.length} 件で、期待値 ${EXPECTED_TOTAL} 件と異なります`)
    console.error('    データが更新された場合は EXPECTED_TOTAL を意図的に更新してください。')
  }
  if (dateProvenStrongConflicts.length) {
    failures++
    console.error(`\n  ✗ 日付証明済みの名前が strong インデックスにも ${dateProvenStrongConflicts.length} 件あります（本来0件）`)
    console.error('    ≤2008 のスナップショットに実在するカードが DM-31以降 初出と登録されています。どちらかが誤りです。')
    for (const c of dateProvenStrongConflicts.slice(0, 10)) {
      console.error(`      ${c.name} [${c.set}]`)
    }
  }
  // weak は再録を排除できないため交差しても失敗にしない。既知値からの増加だけ知らせる
  if (dateProvenWeakOverlaps.length > KNOWN_WEAK_OVERLAP) {
    console.warn(`\n  ! 警告: 日付証明済みの名前と weak インデックスの交差が ${dateProvenWeakOverlaps.length} 件で、既知値 ${KNOWN_WEAK_OVERLAP} 件から増えています`)
    console.warn('    再録なら正常ですが、weak への過剰登録や照合漏れの可能性もあります。増分を確認してください。')
    for (const o of dateProvenWeakOverlaps.slice(0, 10)) {
      console.warn(`      ${o.name} [${o.set}]`)
    }
  }
  if (unknownYearIds.length) {
    failures++
    console.error(`\n  ✗ アーカイブ年を取り出せない source.url が ${unknownYearIds.length} 件あります（日付論法が効いていません）`)
    console.error(`      例: ${unknownYearIds.slice(0, 10).join(', ')}`)
  }

  // UNDECIDED の内訳（何を追いかければ減るかを毎回示す）
  const residual = new Map<string, number>()
  for (const r of results) {
    if (r.klass !== 'UNDECIDED') continue
    for (const n of r.unresolved) residual.set(n, (residual.get(n) ?? 0) + 1)
  }
  const top = [...residual].sort((a, b) => b[1] - a[1]).slice(0, 15)
  if (top.length) {
    console.log(`\n  UNDECIDED の未解決名 ${residual.size} 種（上位15件）:`)
    for (const [name, count] of top) console.log(`      ${String(count).padStart(5)} ${name}`)
  }

  if (failures > 0) {
    console.error(`\n=== FAILED: ${failures} 件の問題を検出しました ===`)
    process.exit(1)
  }
  console.log('\n=== OK: 全レシピを4分類に振り分けました（取りこぼし0件） ===')
}

// CLI として直接実行されたときだけ main を走らせる（テストからの import では走らせない）
if (process.argv[1]?.endsWith('pool-scope.ts')) {
  main().catch(e => { console.error(e); process.exit(1) })
}
