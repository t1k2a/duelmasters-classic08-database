import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const prisma = new PrismaClient()

async function main() {
  // 文明マスタ
  for (const [id, name] of [[1,'光'],[2,'水'],[3,'闇'],[4,'火'],[5,'自然']] as [number,string][]) {
    await prisma.civilization.upsert({
      where: { id },
      update: { name },
      create: { id, name },
    })
  }

  // ルールセットマスタ
  for (const [id, code, name] of [[1,'dmc08','デュエマクラシック08環境'],[2,'official','公式']] as [number,string,string][]) {
    await prisma.ruleset.upsert({
      where: { id },
      update: { code, name },
      create: { id, code, name },
    })
  }

  // 制限種別マスタ
  for (const [id, nm, maxCopies, sortOrder] of [[1,'通常',4,0],[2,'殿堂入り',1,1],[3,'プレミアム殿堂',0,2]] as [number,string,number,number][]) {
    await prisma.restrictionType.upsert({
      where: { id },
      update: { name: nm, maxCopies, sortOrder },
      create: { id, name: nm, maxCopies, sortOrder },
    })
  }

  // セットマスタ (sets_dmc08.json)
  const jsonPath = join(__dirname, '../data/seeds/sets_dmc08.json')
  const raw = JSON.parse(readFileSync(jsonPath, 'utf-8'))
  const sets: Array<{
    set_code: string
    name: string
    line: string
    product_type?: string
    series?: string
    released_ym: string
    note?: string
  }> = raw.sets

  for (const s of sets) {
    await prisma.set.upsert({
      where: { setCode: s.set_code },
      update: {
        name: s.name,
        line: s.line,
        productType: s.product_type ?? null,
        series: s.series ?? null,
        releasedYm: s.released_ym,
        releasedAt: null, // 日精度は商品ページスクレイプ後に確定
        source: raw.meta?.source ?? 'sets_dmc08.json',
      },
      create: {
        setCode: s.set_code,
        name: s.name,
        line: s.line,
        productType: s.product_type ?? null,
        series: s.series ?? null,
        releasedYm: s.released_ym,
        releasedAt: null,
        source: raw.meta?.source ?? 'sets_dmc08.json',
      },
    })
  }

  const setCount = await prisma.set.count()
  console.log(`Seeded: ${setCount} sets`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
