/**
 * CLI search tool for Phase 4 demonstration.
 * Usage: npx tsx src/api/search-cli.ts [options]
 *
 * Examples:
 *   npx tsx src/api/search-cli.ts --name ボルメテウス
 *   npx tsx src/api/search-cli.ts --civilization 火 --card-type クリーチャー --cost-max 5
 *   npx tsx src/api/search-cli.ts --text ブロッカー --limit 10
 */

import { searchCards, prisma } from './search.js'

function parseArgs() {
  const args = process.argv.slice(2)
  const params: Record<string, string> = {}
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    params[key] = args[i + 1] ?? ''
  }
  return params
}

async function main() {
  const args = parseArgs()

  const result = await searchCards({
    name: args['name'],
    text: args['text'],
    civilization: args['civilization'],
    cardType: args['cardType'],
    race: args['race'],
    costMin: args['costMin'] ? parseInt(args['costMin']) : undefined,
    costMax: args['costMax'] ? parseInt(args['costMax']) : undefined,
    powerMin: args['powerMin'] ? parseInt(args['powerMin']) : undefined,
    powerMax: args['powerMax'] ? parseInt(args['powerMax']) : undefined,
    limit: args['limit'] ? parseInt(args['limit']) : 20,
    offset: args['offset'] ? parseInt(args['offset']) : 0,
  })

  console.log(`検索結果: ${result.total} 件 (表示: ${result.cards.length} 件)\n`)

  for (const card of result.cards) {
    const civs = card.civilizations.join('/')
    const races = card.races.join('/')
    const printing = card.printings[0]
    console.log(`【${card.name}】`)
    console.log(`  種類: ${card.cardType} | 文明: ${civs || '—'} | 種族: ${races || '—'}`)
    console.log(`  コスト: ${card.cost ?? '—'} | パワー: ${card.power?.toLocaleString() ?? '—'}`)
    if (printing) {
      console.log(`  収録: ${printing.setCode} ${printing.cardNumber} [${printing.rarity ?? '?'}]`)
    }
    if (card.text) {
      const preview = card.text.slice(0, 80) + (card.text.length > 80 ? '…' : '')
      console.log(`  テキスト: ${preview}`)
    }
    console.log()
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
