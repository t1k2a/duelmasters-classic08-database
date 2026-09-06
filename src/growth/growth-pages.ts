export type GrowthPageKind = 'guide' | 'deck-guide'

export interface GrowthSection {
  heading: string
  paragraphs: string[]
  bullets?: string[]
}

export interface GrowthReference {
  label: string
  url: string
}

export interface GrowthPage {
  kind: GrowthPageKind
  slug: string
  title: string
  description: string
  lead: string
  sections: GrowthSection[]
  relatedCardIds: string[]
  relatedGuideSlugs?: string[]
  featuredRecipeId?: string
  references?: GrowthReference[]
}

export interface GrowthCardSource {
  id: string
  name: string
}

export interface GrowthRecipeSource {
  id: string
  name?: string
  poolStatus?: string
  cards?: { id: string; count?: number }[]
}

export interface GrowthPageSources {
  cards: GrowthCardSource[]
  recipes: GrowthRecipeSource[]
  allowMissingReferences?: boolean
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const TEMPLATE_RESIDUE = /TODO|要確認|\{\{[^}]*\}\}/i

export function growthPagePath(page: GrowthPage): string {
  return `${page.kind}/${page.slug}/`
}

export function growthSitemapUrls(pages: GrowthPage[], siteUrl: string): string[] {
  const base = siteUrl.replace(/\/$/, '')
  return [`${base}/guides/`, ...pages.map(page => `${base}/${growthPagePath(page)}`)]
}

export function extractSitemapLastModified(xml: string): Map<string, string> {
  const dates = new Map<string, string>()
  const entries = xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>\s*<\/url>/g)
  for (const entry of entries) {
    dates.set(entry[1].replace(/&amp;/g, '&'), entry[2])
  }
  return dates
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function collectStrings(value: unknown, strings: string[]): void {
  if (typeof value === 'string') {
    strings.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, strings)
    return
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) collectStrings(item, strings)
  }
}

function parseStringArray(value: unknown, field: string, slug: string, errors: string[]): string[] {
  if (!Array.isArray(value) || value.some(item => !nonEmptyString(item))) {
    errors.push(`${slug}: ${field} は空でない文字列の配列である必要があります`)
    return []
  }
  return value.map(item => (item as string).trim())
}

function parseSections(value: unknown, slug: string, errors: string[]): GrowthSection[] {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${slug}: sections は1件以上必要です`)
    return []
  }
  const sections: GrowthSection[] = []
  value.forEach((section, index) => {
    if (!isRecord(section)) {
      errors.push(`${slug}: sections[${index}] はオブジェクトである必要があります`)
      return
    }
    if (!nonEmptyString(section.heading)) errors.push(`${slug}: sections[${index}].heading は必須です`)
    const paragraphs = parseStringArray(section.paragraphs, `sections[${index}].paragraphs`, slug, errors)
    if (paragraphs.length === 0) errors.push(`${slug}: sections[${index}].paragraphs は1件以上必要です`)
    const bullets = section.bullets === undefined
      ? undefined
      : parseStringArray(section.bullets, `sections[${index}].bullets`, slug, errors)
    sections.push({
      heading: nonEmptyString(section.heading) ? section.heading.trim() : '',
      paragraphs,
      ...(bullets === undefined ? {} : { bullets }),
    })
  })
  return sections
}

function parseReferences(value: unknown, slug: string, errors: string[]): GrowthReference[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    errors.push(`${slug}: references は配列である必要があります`)
    return []
  }
  return value.flatMap((reference, index) => {
    if (!isRecord(reference) || !nonEmptyString(reference.label) || !nonEmptyString(reference.url)) {
      errors.push(`${slug}: references[${index}] はlabelとurlが必要です`)
      return []
    }
    let validHttps = false
    try {
      const url = new URL(reference.url)
      validHttps = url.protocol === 'https:'
    } catch {
      validHttps = false
    }
    if (!validHttps) errors.push(`${slug}: references[${index}].url はhttps URLである必要があります`)
    return [{ label: reference.label.trim(), url: reference.url.trim() }]
  })
}

/**
 * 公開用ガイドを一括検証する。すべての不備を収集してから例外にするため、
 * 編集者は一度の実行で直すべき箇所を把握できる。
 */
export function validateGrowthPages(
  input: unknown,
  sources: GrowthPageSources,
  options: { expectedPageCount?: number } = {},
): { pages: GrowthPage[] } {
  const errors: string[] = []
  if (!Array.isArray(input)) throw new Error('growth-pages.json: ルートは配列である必要があります')

  const expectedPageCount = options.expectedPageCount ?? 8
  if (input.length !== expectedPageCount) errors.push(`全体: ページ数は${expectedPageCount}件である必要があります（実際: ${input.length}件）`)

  const cardsById = new Map(sources.cards.map(card => [card.id, card]))
  const recipesById = new Map(sources.recipes.map(recipe => [recipe.id, recipe]))
  const pages: GrowthPage[] = []
  const seenSlugs = new Set<string>()

  input.forEach((rawPage, index) => {
    if (!isRecord(rawPage)) {
      errors.push(`[${index}]: ページはオブジェクトである必要があります`)
      return
    }
    const slug = nonEmptyString(rawPage.slug) ? rawPage.slug.trim() : `[${index}]`
    if (!nonEmptyString(rawPage.slug) || !SLUG_PATTERN.test(rawPage.slug)) errors.push(`${slug}: slug の形式が不正です`)
    if (seenSlugs.has(slug)) errors.push(`${slug}: slug が重複しています`)
    seenSlugs.add(slug)

    const kind = rawPage.kind
    if (kind !== 'guide' && kind !== 'deck-guide') errors.push(`${slug}: kind はguideまたはdeck-guideである必要があります`)
    for (const field of ['title', 'description', 'lead'] as const) {
      if (!nonEmptyString(rawPage[field])) errors.push(`${slug}: ${field} は必須です`)
    }

    const sections = parseSections(rawPage.sections, slug, errors)
    const relatedCardIds = parseStringArray(rawPage.relatedCardIds, 'relatedCardIds', slug, errors)
    const relatedGuideSlugs = rawPage.relatedGuideSlugs === undefined
      ? []
      : parseStringArray(rawPage.relatedGuideSlugs, 'relatedGuideSlugs', slug, errors)
    const references = parseReferences(rawPage.references, slug, errors)

    const strings: string[] = []
    collectStrings(rawPage, strings)
    if (strings.some(value => TEMPLATE_RESIDUE.test(value))) errors.push(`${slug}: TODO・要確認・{{...}}などのテンプレート残骸があります`)

    if (!sources.allowMissingReferences) {
      for (const cardId of relatedCardIds) {
        if (!cardsById.has(cardId)) errors.push(`${slug}: relatedCardIds のカードが存在しません: ${cardId}`)
      }
    }

    const featuredRecipeId = nonEmptyString(rawPage.featuredRecipeId) ? rawPage.featuredRecipeId.trim() : undefined
    if (kind === 'deck-guide') {
      if (!featuredRecipeId) {
        errors.push(`${slug}: deck-guideにはfeaturedRecipeIdが必要です`)
      } else if (!sources.allowMissingReferences) {
        const recipe = recipesById.get(featuredRecipeId)
        if (!recipe) {
          errors.push(`${slug}: featuredRecipeIdが存在しません: ${featuredRecipeId}`)
        } else {
          if (recipe.poolStatus !== 'in') errors.push(`${slug}: featuredRecipeIdのpoolStatusはinである必要があります`)
          if (!Array.isArray(recipe.cards)) {
            errors.push(`${slug}: featuredRecipeIdにcardsがありません`)
          } else {
            const total = recipe.cards.reduce((sum, card) => sum + (Number.isInteger(card.count) ? (card.count ?? 0) : 0), 0)
            if (total !== 40) errors.push(`${slug}: featuredRecipeIdは40枚である必要があります（実際: ${total}枚）`)
            for (const card of recipe.cards) {
              if (!nonEmptyString(card.id) || !cardsById.has(card.id)) errors.push(`${slug}: レシピ内カードを解決できません: ${card.id}`)
              if (!Number.isInteger(card.count) || (card.count ?? 0) <= 0) errors.push(`${slug}: レシピ内カード枚数が不正です: ${card.id}`)
            }
          }
        }
      }
    }

    pages.push({
      kind: kind === 'deck-guide' ? 'deck-guide' : 'guide',
      slug,
      title: nonEmptyString(rawPage.title) ? rawPage.title.trim() : '',
      description: nonEmptyString(rawPage.description) ? rawPage.description.trim() : '',
      lead: nonEmptyString(rawPage.lead) ? rawPage.lead.trim() : '',
      sections,
      relatedCardIds,
      relatedGuideSlugs,
      ...(featuredRecipeId ? { featuredRecipeId } : {}),
      ...(references === undefined ? {} : { references }),
    })
  })

  if (!sources.allowMissingReferences) {
    const slugs = new Set(pages.map(page => page.slug))
    for (const page of pages) {
      for (const relatedSlug of page.relatedGuideSlugs ?? []) {
        if (!slugs.has(relatedSlug)) errors.push(`${page.slug}: relatedGuideSlugsが存在しません: ${relatedSlug}`)
        if (relatedSlug === page.slug) errors.push(`${page.slug}: 自分自身を関連ガイドに指定できません`)
      }
    }
  }

  if (errors.length > 0) throw new Error(`growth-pages.json:\n- ${errors.join('\n- ')}`)
  return { pages }
}
