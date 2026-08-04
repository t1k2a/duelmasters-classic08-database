// クラシック08 の独自制限リストを、カードIDを解決した公開用データに変換する。
//
// 重要: このフォーマットの制限リストは公式デュエル・マスターズの殿堂レギュレーションとは
// 別物である。公式でプレミアム殿堂（使用禁止）のカードが、クラシック08では制限（1枚まで）
// や「お助け枠」として使えることがある。public/data/hall-of-fame.json は公式殿堂であり、
// 本フォーマットの正当性判定には使えない。

export interface CardLike {
  id: string
  name: string
}

export interface RestrictionSeed {
  meta: Record<string, unknown>
  banned: string[]
  restricted: string[]
  helper: string[]
  bannedCombos: string[][]
  knownMissingFromCardPool: { names: string[] }
}

/** カードプールに存在しないものは id: null。制限リストには載せるが詳細ページへは飛べない */
export interface RestrictionEntry {
  name: string
  id: string | null
}

export interface RestrictionList {
  meta: Record<string, unknown>
  banned: RestrictionEntry[]
  restricted: RestrictionEntry[]
  helper: RestrictionEntry[]
  /** helper は列挙された中から合計何枚まで入れられるか */
  helperPickLimit: number
  bannedCombos: { cards: RestrictionEntry[] }[]
}

export interface OfficialHofEntry {
  id: string
  name: string
  status: string
}

export interface Divergence {
  name: string
  official: string
  classic08: 'banned' | 'restricted' | 'helper'
}

export interface BuildResult {
  list: RestrictionList
  /** 既知欠落として登録されていないのに解決できなかった名前。ビルドを失敗させる */
  unexpectedMissing: string[]
  /** 公式殿堂と扱いが食い違うカード。サイト上で注意喚起するために抽出する */
  divergesFromOfficial: Divergence[]
}

export function resolveName(cards: CardLike[], name: string): CardLike | null {
  return cards.find(c => c.name === name) ?? null
}

export function buildRestrictionList(
  cards: CardLike[],
  seed: RestrictionSeed,
  officialHof: OfficialHofEntry[] = []
): BuildResult {
  const known = new Set(seed.knownMissingFromCardPool?.names ?? [])
  const unexpectedMissing: string[] = []

  const toEntry = (name: string): RestrictionEntry => {
    const hit = resolveName(cards, name)
    if (!hit && !known.has(name)) unexpectedMissing.push(name)
    return { name, id: hit?.id ?? null }
  }

  const list: RestrictionList = {
    meta: seed.meta,
    banned: seed.banned.map(toEntry),
    restricted: seed.restricted.map(toEntry),
    helper: seed.helper.map(toEntry),
    helperPickLimit: 1,
    bannedCombos: seed.bannedCombos.map(pair => ({ cards: pair.map(toEntry) })),
  }

  const classOf = new Map<string, Divergence['classic08']>()
  for (const n of seed.banned) classOf.set(n, 'banned')
  for (const n of seed.restricted) classOf.set(n, 'restricted')
  for (const n of seed.helper) classOf.set(n, 'helper')

  const divergesFromOfficial: Divergence[] = []
  for (const o of officialHof) {
    const c = classOf.get(o.name)
    // 公式が「プレ殿(禁止)」なのに本フォーマットでは使えるものが、最も誤解を招く
    if (o.status === 'プレ殿' && c && c !== 'banned') {
      divergesFromOfficial.push({ name: o.name, official: o.status, classic08: c })
    }
  }

  return { list, unexpectedMissing, divergesFromOfficial }
}
