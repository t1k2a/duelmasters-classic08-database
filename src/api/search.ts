import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

export interface SearchParams {
  name?: string
  text?: string
  civilization?: string      // comma-separated OR: "光,水" means Light OR Water
  cardType?: string           // comma-separated OR: "クリーチャー,進化クリーチャー"
  race?: string              // substring match
  costMin?: number
  costMax?: number
  powerMin?: number
  powerMax?: number
  limit?: number
  offset?: number
}

export interface CardResult {
  id: number
  name: string
  cardType: string
  cost: number | null
  power: number | null
  text: string | null
  flavorText: string | null
  illustrator: string | null
  civilizations: string[]
  races: string[]
  printings: Array<{
    setCode: string
    setName: string
    cardNumber: string
    rarity: string | null
  }>
}

export interface SearchResult {
  total: number
  cards: CardResult[]
}

/**
 * Search cards using the 08-environment scope.
 * 08 scope = cards whose earliest printing is in a set with released_ym <= '2008-12'.
 * Since the scraper only imports sets from sets_dmc08.json (all <= 2008-12), every
 * card in the DB satisfies this condition. The filter is applied anyway for safety.
 */
export async function searchCards(params: SearchParams): Promise<SearchResult> {
  const limit = Math.min(params.limit ?? 20, 100)
  const offset = params.offset ?? 0

  // Build Prisma where clause
  const where: Prisma.CardWhereInput = {}

  // Name search (case-insensitive substring)
  if (params.name?.trim()) {
    where.name = { contains: params.name.trim(), mode: 'insensitive' }
  }

  // Ability text search (case-insensitive substring)
  if (params.text?.trim()) {
    where.text = { contains: params.text.trim(), mode: 'insensitive' }
  }

  // Card type filter (OR across values)
  if (params.cardType?.trim()) {
    const types = params.cardType.split(',').map(s => s.trim()).filter(Boolean)
    if (types.length === 1) {
      where.cardType = types[0]
    } else if (types.length > 1) {
      where.cardType = { in: types }
    }
  }

  // Cost range
  if (params.costMin !== undefined || params.costMax !== undefined) {
    where.cost = {}
    if (params.costMin !== undefined) (where.cost as Prisma.IntNullableFilter).gte = params.costMin
    if (params.costMax !== undefined) (where.cost as Prisma.IntNullableFilter).lte = params.costMax
  }

  // Power range
  if (params.powerMin !== undefined || params.powerMax !== undefined) {
    where.power = {}
    if (params.powerMin !== undefined) (where.power as Prisma.IntNullableFilter).gte = params.powerMin
    if (params.powerMax !== undefined) (where.power as Prisma.IntNullableFilter).lte = params.powerMax
  }

  // Civilization filter (OR: card must have at least one of the specified civilizations)
  if (params.civilization?.trim()) {
    const civs = params.civilization.split(',').map(s => s.trim()).filter(Boolean)
    where.cardCivilizations = {
      some: { civilization: { name: { in: civs } } },
    }
  }

  // Race filter (substring match in any of the card's races)
  if (params.race?.trim()) {
    where.cardRaces = {
      some: { race: { name: { contains: params.race.trim(), mode: 'insensitive' } } },
    }
  }

  // 08-scope filter: card must have at least one printing in a set with released_ym <= '2008-12'
  where.printings = {
    some: {
      set: {
        OR: [
          { releasedYm: { lte: '2008-12' } },
          // Sets with no released_ym but known to be in scope (all seeds from sets_dmc08.json)
          { releasedYm: null },
        ],
      },
    },
  }

  const [total, rows] = await Promise.all([
    prisma.card.count({ where }),
    prisma.card.findMany({
      where,
      include: {
        cardCivilizations: { include: { civilization: true } },
        cardRaces: { include: { race: true } },
        printings: {
          include: { set: { select: { setCode: true, name: true } } },
          orderBy: { set: { releasedYm: 'asc' } },
        },
      },
      orderBy: [{ cost: 'asc' }, { name: 'asc' }],
      take: limit,
      skip: offset,
    }),
  ])

  const cards: CardResult[] = rows.map(c => ({
    id: c.id,
    name: c.name,
    cardType: c.cardType,
    cost: c.cost,
    power: c.power,
    text: c.text,
    flavorText: c.flavorText,
    illustrator: c.illustrator,
    civilizations: c.cardCivilizations.map(cc => cc.civilization.name),
    races: c.cardRaces.map(cr => cr.race.name),
    printings: c.printings.map(p => ({
      setCode: p.set.setCode,
      setName: p.set.name,
      cardNumber: p.cardNumber ?? '',
      rarity: p.rarity,
    })),
  }))

  return { total, cards }
}

export { prisma }
