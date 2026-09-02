import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = process.cwd()
const SEED = join(ROOT, 'data/seeds/classic08_restrictions.json')
const CARDS = join(ROOT, 'public/cards.json')
const HOF = join(ROOT, 'public/data/hall-of-fame.json')
const OUT = join(ROOT, 'public/data/classic08-restrictions.json')

const readJson = async p => JSON.parse(await readFile(p, 'utf-8'))

function resolveName(cards, name) {
  return cards.find(c => c.name === name) ?? null
}

function buildRestrictionList(cards, seed, officialHof = []) {
  const known = new Set(seed.knownMissingFromCardPool?.names ?? [])
  const unexpectedMissing = []

  const toEntry = name => {
    const hit = resolveName(cards, name)
    if (!hit && !known.has(name)) unexpectedMissing.push(name)
    return { name, id: hit?.id ?? null }
  }

  const list = {
    meta: seed.meta,
    banned: seed.banned.map(toEntry),
    restricted: seed.restricted.map(toEntry),
    helper: seed.helper.map(toEntry),
    helperPickLimit: 1,
    bannedCombos: seed.bannedCombos.map(pair => ({ cards: pair.map(toEntry) })),
  }

  const classOf = new Map()
  for (const n of seed.banned) classOf.set(n, 'banned')
  for (const n of seed.restricted) classOf.set(n, 'restricted')
  for (const n of seed.helper) classOf.set(n, 'helper')

  const divergesFromOfficial = []
  for (const o of officialHof) {
    const c = classOf.get(o.name)
    if (o.status === 'プレ殿' && c && c !== 'banned') {
      divergesFromOfficial.push({ name: o.name, official: o.status, classic08: c })
    }
  }

  return { list, unexpectedMissing, divergesFromOfficial }
}

async function main() {
  const seed = await readJson(SEED)
  const cards = await readJson(CARDS)
  const hof = await readJson(HOF)

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
