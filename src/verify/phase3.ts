/**
 * Phase 3 verification script
 * Checks known cards, distribution counts, and data integrity.
 *
 * Usage: npx tsx src/verify/phase3.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkKnownCard(name: string, expectedSetCode?: string, expectedCardType?: string) {
  const card = await prisma.card.findFirst({
    where: { name: { contains: name } },
    include: {
      cardCivilizations: { include: { civilization: true } },
      cardRaces: { include: { race: true } },
      printings: { include: { set: true } },
    },
  })

  if (!card) {
    console.log(`  ✗ NOT FOUND: "${name}"`)
    return false
  }

  const civs = card.cardCivilizations.map(c => c.civilization.name).join('/')
  const races = card.cardRaces.map(r => r.race.name).join('/')
  const printings = card.printings.map(p => `${p.set.setCode} ${p.cardNumber}`).join(', ')

  console.log(`  ✓ FOUND: ${card.name}`)
  console.log(`    Type      : ${card.cardType}`)
  console.log(`    Civ/Race  : ${civs} / ${races}`)
  console.log(`    Cost/Power: ${card.cost ?? '-'} / ${card.power ?? '-'}`)
  console.log(`    Printings : ${printings}`)

  let ok = true
  if (expectedSetCode) {
    const hasSet = card.printings.some(p => p.set.setCode === expectedSetCode)
    if (!hasSet) {
      console.log(`    ⚠ Expected set ${expectedSetCode} not found (actual: ${printings})`)
      ok = false
    }
  }
  if (expectedCardType && card.cardType !== expectedCardType) {
    console.log(`    ⚠ Expected type "${expectedCardType}" but got "${card.cardType}"`)
    ok = false
  }
  return ok
}

async function main() {
  console.log('=== Phase 3 Verification ===\n')

  // 1. Known card checks
  console.log('--- Known Card Checks ---')

  // DM-04: アストラル・リーフ (Water, Liquid People, 4 cost)
  await checkKnownCard('アストラル・リーフ', 'DM-04')

  // DM-30: 無敵城 シルヴァー・グローリー (Castle type, first card dm30-001)
  await checkKnownCard('シルヴァー・グローリー', 'DM-30', '城')

  // ボルメテウス・ホワイト・ドラゴン (brief says DM-06, but may be in a different set)
  await checkKnownCard('ボルメテウス', undefined)

  // DM-06 known VR: 銀界の守護者ル・ギラ・レシール
  await checkKnownCard('銀界の守護者ル・ギラ・レシール', 'DM-06', 'クリーチャー')

  // 2. Distribution counts
  console.log('\n--- Distribution Counts ---')

  const totalCards = await prisma.card.count()
  const totalPrintings = await prisma.printing.count()
  const totalRaces = await prisma.race.count()
  console.log(`Total cards    : ${totalCards}`)
  console.log(`Total printings: ${totalPrintings}`)
  console.log(`Total races    : ${totalRaces}`)

  // Civilization distribution
  console.log('\nCards by civilization:')
  const civDist = await prisma.$queryRaw<{ name: string; cnt: bigint }[]>`
    SELECT civ.name, COUNT(DISTINCT cc.card_id) AS cnt
    FROM card_civilizations cc
    JOIN civilizations civ ON civ.id = cc.civilization_id
    GROUP BY civ.name
    ORDER BY cnt DESC
  `
  for (const row of civDist) {
    console.log(`  ${row.name}: ${row.cnt}`)
  }

  // Card type distribution
  console.log('\nCards by card type:')
  const typeDist = await prisma.$queryRaw<{ card_type: string; cnt: bigint }[]>`
    SELECT card_type, COUNT(*) AS cnt
    FROM cards
    GROUP BY card_type
    ORDER BY cnt DESC
  `
  for (const row of typeDist) {
    console.log(`  ${row.card_type}: ${row.cnt}`)
  }

  // Printings per set
  console.log('\nPrintings per set (DM expansion packs):')
  const setDist = await prisma.$queryRaw<{ set_code: string; cnt: bigint }[]>`
    SELECT s.set_code, COUNT(p.id) AS cnt
    FROM printings p
    JOIN sets s ON s.id = p.set_id
    WHERE s.line = 'DM'
    GROUP BY s.set_code
    ORDER BY s.set_code
  `
  for (const row of setDist) {
    console.log(`  ${row.set_code}: ${row.cnt}`)
  }

  // 3. Integrity checks
  console.log('\n--- Integrity Checks ---')

  const cardsWithoutCiv = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(*) AS cnt FROM cards
    WHERE id NOT IN (SELECT card_id FROM card_civilizations)
  `
  const noCiv = Number(cardsWithoutCiv[0].cnt)
  console.log(`Cards without civilization: ${noCiv} ${noCiv > 0 ? '⚠' : '✓'}`)

  const cardsWithoutPrinting = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(*) AS cnt FROM cards
    WHERE id NOT IN (SELECT card_id FROM printings)
  `
  const noPrint = Number(cardsWithoutPrinting[0].cnt)
  console.log(`Cards without printing    : ${noPrint} ${noPrint > 0 ? '⚠' : '✓'}`)

  // Castle type check (introduced in DM-30)
  const castleCount = await prisma.card.count({ where: { cardType: '城' } })
  console.log(`Castle-type cards         : ${castleCount} ${castleCount > 0 ? '✓' : '⚠ (expected ≥1)'}`)

  // Cross-gear check (introduced in DM-14)
  const crossgearCount = await prisma.card.count({ where: { cardType: 'クロスギア' } })
  console.log(`Cross-gear cards          : ${crossgearCount} ${crossgearCount > 0 ? '✓' : '⚠ (expected ≥1)'}`)

  console.log('\n=== Verification complete ===')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
