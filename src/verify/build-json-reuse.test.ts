import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildCards, validateReusableCards } from '../../scripts/build-json.js'

function card() {
  return {
    id: 'dm01-001', name: 'テストカード', cardType: 'クリーチャー', cost: 1, power: null,
    civilizations: ['光'], races: [], rarity: null, text: null,
    printings: [{ setCode: 'DM-01', cardNumber: '1/110', rarity: null }], setsContaining: [],
  }
}

test('reuse validation accepts nullable fields without mutating the catalog', () => {
  const cards = [card()]
  const before = structuredClone(cards)
  validateReusableCards(cards)
  assert.deepEqual(cards, before)
})

test('reuse rejects empty, incomplete, malformed and duplicate catalogs', () => {
  const invalid: unknown[] = [null, {}, [], [null], [card(), card()]]
  for (const field of Object.keys(card())) {
    const missing = { ...card() } as Record<string, unknown>
    delete missing[field]
    invalid.push([missing])
  }
  for (const change of [
    { id: '../escape' }, { id: '' }, { name: '' }, { cardType: 1 },
    { cost: '1' }, { power: Infinity }, { races: [null] }, { civilizations: '光' },
    { text: {} }, { rarity: false }, { setsContaining: [1] },
    { printings: [] }, { printings: [null] },
    { printings: [{ setCode: 'DM-01', cardNumber: '1/110' }] },
    { printings: [{ setCode: '', cardNumber: '1/110', rarity: null }] },
  ]) invalid.push([{ ...card(), ...change }])
  for (const value of invalid) assert.throws(() => validateReusableCards(value))
})

test('explicit reuse leaves catalog bytes unchanged and never reads raw input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cards-reuse-'))
  try {
    const outFile = join(dir, 'cards.json')
    const rawDir = join(dir, 'raw')
    const contents = `  ${JSON.stringify([card()])}\n\n`
    await writeFile(outFile, contents)
    // A file instead of a directory makes any raw-directory traversal fail.
    await writeFile(rawDir, 'not a raw directory')
    await buildCards({ rawDir, outFile, reuse: true })
    assert.equal(await readFile(outFile, 'utf-8'), contents)
    await assert.rejects(buildCards({ rawDir, outFile, reuse: false }))
    assert.equal(await readFile(outFile, 'utf-8'), contents)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('reuse fails closed on missing, malformed or invalid catalog without writing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cards-reuse-invalid-'))
  try {
    const outFile = join(dir, 'cards.json')
    const options = { rawDir: join(dir, 'missing-raw'), outFile, reuse: true }
    await assert.rejects(buildCards(options))
    for (const contents of ['{invalid', '[]', '[{}]']) {
      await writeFile(outFile, contents)
      await assert.rejects(buildCards(options))
      assert.equal(await readFile(outFile, 'utf-8'), contents)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
