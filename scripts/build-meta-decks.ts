/**
 * public/data/meta-decks.json を public/data/recipes.json の実データから生成する（ビルド経路）。
 *
 * 方針:
 *   - 母数は poolStatus === 'in' のレシピのみ（クラシック08プール内）。
 *   - Tier は「サイト内の収録レシピ件数」順。大会勝率ではない（description に明記する）。
 *   - cards は各アーキタイプの実レシピ群から採用率の高い順に抽出し、枚数は最頻値を採る。
 *     架空のカードリストは絶対に書かない。
 *   - EXCLUDED_ARCHETYPES は特定の構築ではなく分類ラベル（雑多カテゴリ）のため除外する。
 *
 * Usage: npm run build:meta-decks
 */

import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

const PUBLIC_DIR = join(process.cwd(), 'public')
const RECIPES_FILE = join(PUBLIC_DIR, 'data/recipes.json')
const CARDS_FILE = join(PUBLIC_DIR, 'cards.json')
const OUT_FILE = join(PUBLIC_DIR, 'data/meta-decks.json')

/** 個別アーキタイプではなく雑多カテゴリのタグ。Tier表の対象から外す。 */
const EXCLUDED_ARCHETYPES = new Set(['地雷', 'ファンデッキ'])

/**
 * アーキタイプ名の一般的な別称（チャット検索のヒット率のため）。
 * 集計対象を変えるものではなく、呼称の対応表にすぎない。
 */
const ALIASES: Record<string, string[]> = {
  ヘブンズゲート: ['天門', 'ヘブンズ・ゲート'],
  ボルメテウス: ['ボルコン', 'ボルメテウスコントロール'],
  ヘヴィメタル: ['ヘヴィ・デス・メタル', 'HDM'],
  キングロック: ['キング・アルカディアス'],
  ギャラクシー: ['パーフェクト・ギャラクシー'],
}

/** Tier 表に載せる最小収録件数。 */
const MIN_RECIPES = 150
/** 1アーキタイプあたりに載せる代表カード数。 */
const MAX_CARDS = 15
/** 代表カードとして採用する最低採用率。 */
const MIN_ADOPTION = 0.2
/** 代表文明として載せる最低出現率。 */
const MIN_CIV_SHARE = 0.4

const TIER_THRESHOLDS: { tier: number; min: number }[] = [
  { tier: 1, min: 240 },
  { tier: 2, min: 180 },
  { tier: 3, min: 0 },
]

interface Recipe {
  id: string
  name: string
  archetype?: string
  poolStatus?: string
  civilizations?: string[]
  cards?: { id: string; count?: number }[]
}

interface Card { id: string; name: string }

interface MetaDeck {
  name: string
  aliases: string[]
  tier: number
  recipeCount: number
  poolShare: string
  description: string
  civilization: string[]
  cards: { id: string; name: string; count: number }[]
  tags: string[]
}

function mode(values: number[]): number {
  const freq = new Map<number, number>()
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1)
  return [...freq].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0]
}

function tierOf(count: number): number {
  return TIER_THRESHOLDS.find(t => count >= t.min)!.tier
}

async function main() {
  const recipes = JSON.parse(await readFile(RECIPES_FILE, 'utf-8')) as Recipe[]
  const cards = JSON.parse(await readFile(CARDS_FILE, 'utf-8')) as Card[]
  const cardName = new Map(cards.map(c => [c.id, c.name]))

  const pool = recipes.filter(r => r.poolStatus === 'in')
  if (!pool.length) throw new Error(`${RECIPES_FILE} に poolStatus:'in' のレシピがありません（annotate-recipe-pool 未実行？）`)

  const byArchetype = new Map<string, Recipe[]>()
  for (const r of pool) {
    const a = (r.archetype ?? '').trim()
    if (!a || EXCLUDED_ARCHETYPES.has(a)) continue
    const list = byArchetype.get(a) ?? []
    list.push(r)
    byArchetype.set(a, list)
  }

  const ranked = [...byArchetype.entries()]
    .filter(([, list]) => list.length >= MIN_RECIPES)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))

  if (!ranked.length) throw new Error(`収録件数 ${MIN_RECIPES} 件以上のアーキタイプがありません`)

  const decks: MetaDeck[] = ranked.map(([name, list]) => {
    const n = list.length

    const civCount = new Map<string, number>()
    for (const r of list) for (const c of new Set(r.civilizations ?? [])) civCount.set(c, (civCount.get(c) ?? 0) + 1)
    const civilization = [...civCount.entries()]
      .filter(([, c]) => c / n >= MIN_CIV_SHARE)
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c)

    const adopt = new Map<string, number[]>()
    for (const r of list) {
      for (const c of r.cards ?? []) {
        if (!cardName.has(c.id)) continue
        const counts = adopt.get(c.id) ?? []
        counts.push(c.count ?? 1)
        adopt.set(c.id, counts)
      }
    }
    const topCards = [...adopt.entries()]
      .filter(([, counts]) => counts.length / n >= MIN_ADOPTION)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .slice(0, MAX_CARDS)
      .map(([id, counts]) => ({ id, name: cardName.get(id)!, count: mode(counts) }))

    const share = ((n / pool.length) * 100).toFixed(1)
    const headline = topCards.slice(0, 3).map(c => `《${c.name}》`).join('')
    const description =
      `当サイト収録のクラシック08プール内レシピ ${pool.length.toLocaleString('en-US')} 件のうち ${n} 件（${share}%）がこのアーキタイプ。` +
      (civilization.length ? `主な文明は${civilization.join('')}。` : '') +
      (headline ? `頻出カードは${headline}など。` : '') +
      `掲載カードは該当レシピ群の採用率上位${topCards.length}枚（枚数は最頻値）で、40枚の完成形ではありません。` +
      `件数は収録レシピの人気度の代理指標であり、大会成績ではありません。`

    return {
      name,
      aliases: ALIASES[name] ?? [],
      tier: tierOf(n),
      recipeCount: n,
      poolShare: `${share}%`,
      description,
      civilization,
      cards: topCards,
      tags: [`Tier ${tierOf(n)}`, `収録${n}件`],
    }
  })

  const empty = decks.filter(d => !d.cards.length)
  if (empty.length) throw new Error(`代表カードを抽出できないアーキタイプ: ${empty.map(d => d.name).join(', ')}`)

  await writeFile(OUT_FILE, JSON.stringify(decks, null, 2) + '\n', 'utf-8')
  console.log(`meta-decks.json: ${decks.length}アーキタイプ / 母数 ${pool.length}件`)
  for (const d of decks) console.log(`  Tier${d.tier} ${d.name} ${d.recipeCount}件 (${d.cards.length}枚)`)
}

main().catch(err => { console.error(err); process.exit(1) })
