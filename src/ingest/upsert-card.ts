import { PrismaClient } from '@prisma/client'
import type { CardData } from '../types.js'

export const prisma = new PrismaClient()

const CIV_MAP: Record<string, number> = {
  '光': 1,
  '水': 2,
  '闇': 3,
  '火': 4,
  '自然': 5,
}

export async function upsertCard(card: CardData): Promise<void> {
  // 1. Upsert card entity
  const dbCard = await prisma.card.upsert({
    where: { name: card.name },
    update: {
      cardType: card.cardType,
      cost: card.cost ?? null,
      power: card.power ?? null,
      text: card.text ?? null,
      flavorText: card.flavorText ?? null,
      illustrator: card.illustrator ?? null,
    },
    create: {
      name: card.name,
      cardType: card.cardType,
      cost: card.cost ?? null,
      power: card.power ?? null,
      text: card.text ?? null,
      flavorText: card.flavorText ?? null,
      illustrator: card.illustrator ?? null,
    },
  })

  // 2. Civilizations
  for (const civName of card.civilizations) {
    const civId = CIV_MAP[civName]
    if (civId === undefined) {
      console.warn(`  Unknown civilization: "${civName}" for card "${card.name}"`)
      continue
    }
    await prisma.cardCivilization.upsert({
      where: { cardId_civilizationId: { cardId: dbCard.id, civilizationId: civId } },
      update: {},
      create: { cardId: dbCard.id, civilizationId: civId },
    })
  }

  // 3. Races
  for (const raceName of card.races) {
    if (!raceName) continue
    const race = await prisma.race.upsert({
      where: { name: raceName },
      update: {},
      create: { name: raceName },
    })
    await prisma.cardRace.upsert({
      where: { cardId_raceId: { cardId: dbCard.id, raceId: race.id } },
      update: {},
      create: { cardId: dbCard.id, raceId: race.id },
    })
  }

  // 4. Primary printing (set determined by card's URL/setCode)
  if (card.setCode && card.cardNumber) {
    const set = await prisma.set.findUnique({ where: { setCode: card.setCode } })
    if (!set) {
      console.warn(`  Set not found in DB: "${card.setCode}" for card "${card.name}"`)
    } else {
      await prisma.printing.upsert({
        where: { setId_cardNumber: { setId: set.id, cardNumber: card.cardNumber } },
        update: { rarity: card.rarity ?? null },
        create: {
          cardId: dbCard.id,
          setId: set.id,
          cardNumber: card.cardNumber,
          rarity: card.rarity ?? null,
        },
      })
    }
  }
}
