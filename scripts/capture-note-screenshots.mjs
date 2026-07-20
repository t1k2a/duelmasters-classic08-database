/**
 * note 記事用スクリーンショット撮影スクリプト。
 *
 * scripts/capture-screenshots.mjs（SEO証拠を base64 JSON 化する既存スクリプト）の
 * localhost 配信 + playwright chromium 撮影の手法を踏襲しつつ、
 * note 記事に貼れる PNG を docs/marketing/images/ に直接保存する。
 *
 * 撮影対象:
 *   1. カード検索UI（文明フィルタ・カードグリッド） -> search-ui.png
 *   2. カード詳細ページ（プレ殿バッジつき 無双竜機ボルバルザーク） -> card-detail.png
 *
 * 事前に public/ を http で配信しておくこと（SPA は fetch を使うため file:// 不可）。
 * Usage:
 *   npx serve public -l 5173 &   # もしくは同等の静的サーバ
 *   PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers node scripts/capture-note-screenshots.mjs
 */

import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../docs/marketing/images'
)

const shots = [
  {
    file: 'search-ui.png',
    label: 'カード検索UI（文明フィルタ・グリッド）',
    url: '/',
    viewport: { width: 1280, height: 900 },
    // 絞り込みパネル（初期は折りたたみ）を開き、検索語でインクリメンタル検索・
    // ハイライトが伝わる状態にする。文明フィルタのバッジも見えるようにする。
    prepare: async page => {
      const toggle = await page.$('#filterPanelToggle')
      if (toggle) {
        await toggle.click()
        await page.waitForTimeout(300)
      }
      const box = await page.$('#textSearch')
      if (box) {
        await box.fill('ボルバル')
        await page.waitForTimeout(600)
      }
    },
  },
  {
    file: 'card-detail.png',
    label: 'カード詳細ページ（プレ殿バッジ）',
    url: '/?id=dm10-009',
    viewport: { width: 1280, height: 900 },
    prepare: async page => {
      // 詳細パネルが描画されるまで待つ。
      await page.waitForSelector('#detailName', { timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(800)
    },
  },
]

mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ deviceScaleFactor: 2 })

for (const shot of shots) {
  const page = await context.newPage()
  await page.setViewportSize(shot.viewport)
  await page.goto(`${BASE}${shot.url}`, { waitUntil: 'networkidle' })
  if (shot.prepare) await shot.prepare(page)
  const outPath = path.join(OUT_DIR, shot.file)
  await page.screenshot({ path: outPath })
  console.log(`✓ ${shot.file}  (${shot.label})`)
  await page.close()
}

await browser.close()
console.log(`\nSaved ${shots.length} screenshots → ${OUT_DIR}`)
