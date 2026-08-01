// data/seeds/classic08_restrictions.json のカード名を id 解決し、
// public/data/classic08-restrictions.json を生成する。
//
// 既知欠落に登録されていない名前が解決できなかった場合は、黙って id: null を書かずに
// 失敗させる。一次ソースの改定やカード名の誤記を見逃さないため。
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildRestrictionList } from '../src/verify/restrictions.js'
import type { CardLike, RestrictionSeed, OfficialHofEntry } from '../src/verify/restrictions.js'

const ROOT = process.cwd()
const SEED = join(ROOT, 'data/seeds/classic08_restrictions.json')
const CARDS = join(ROOT, 'public/cards.json')
const HOF = join(ROOT, 'public/data/hall-of-fame.json')
const OUT = join(ROOT, 'public/data/classic08-restrictions.json')

const readJson = async <T>(p: string): Promise<T> => JSON.parse(await readFile(p, 'utf-8')) as T

async function main() {
  const seed = await readJson<RestrictionSeed>(SEED)
  const cards = await readJson<CardLike[]>(CARDS)
  const hof = await readJson<OfficialHofEntry[]>(HOF)

  if (!cards.length) throw new Error(`${CARDS} が空です`)
  if (!seed.restricted?.length || !seed.helper?.length) throw new Error(`${SEED} の制限リストが空です`)

  const { list, unexpectedMissing, divergesFromOfficial } = buildRestrictionList(cards, seed, hof)

  if (unexpectedMissing.length) {
    throw new Error(
      `カードプールに存在しない名前が ${unexpectedMissing.length} 件あります: ${unexpectedMissing.join(', ')}\n` +
        `一次ソースの改定か名前の誤記の可能性があります。正当な欠落なら ` +
        `data/seeds/classic08_restrictions.json の knownMissingFromCardPool.names に追加してください。`
    )
  }

  await writeFile(OUT, JSON.stringify(list, null, 2), 'utf-8')

  const nullIds = [...list.banned, ...list.restricted, ...list.helper].filter(e => !e.id)
  console.log(`✓ ${OUT}`)
  console.log(`   使用禁止 ${list.banned.length} / 制限 ${list.restricted.length} / お助け ${list.helper.length}（うち1枚のみ採用可）`)
  console.log(`   禁止コンビ ${list.bannedCombos.length} 組`)
  console.log(`   カードページへ紐付かない既知欠落: ${nullIds.length} 件${nullIds.length ? ' — ' + nullIds.map(e => e.name).join('、') : ''}`)
  console.log(`   公式殿堂と扱いが食い違うカード: ${divergesFromOfficial.length} 件`)
  for (const d of divergesFromOfficial) {
    console.log(`     ${d.name}: 公式=${d.official} → クラシック08=${d.classic08}`)
  }
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
