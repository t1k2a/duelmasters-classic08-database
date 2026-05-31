export interface CardData {
  cardId: string
  name: string
  nameReading?: string
  cardType: string
  cost?: number
  power?: number
  text?: string
  flavorText?: string
  illustrator?: string
  civilizations: string[]
  races: string[]
  setCode: string
  cardNumber: string
  rarity?: string
  // Product names from productCardList (e.g. "DM-06 闘魂編(インビンシブル・ソウル)")
  additionalSetNames: string[]
}
