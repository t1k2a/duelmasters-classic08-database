/**
 * Build script: generate public/js/analytics-config.js from an environment variable.
 *
 * 測定IDをリポジトリのソースに直書きしないため、GA4 測定ID は
 * 環境変数 GA_MEASUREMENT_ID からビルド時に注入する。
 * 出力ファイル public/js/analytics-config.js は .gitignore 対象で追跡しない。
 *
 * GA_MEASUREMENT_ID 未設定なら空値を書き出す（→ analytics.js が完全ノーオペ）。
 *
 * Usage: npm run build:analytics-config
 */

import { writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../public/js')
const OUT_FILE = join(OUT_DIR, 'analytics-config.js')

const id = (process.env.GA_MEASUREMENT_ID ?? '').trim()

// JSON.stringify で安全に文字列化（XSS/構文事故を防ぐ）。
const content = `// 自動生成ファイル（scripts/build-analytics-config.ts）。手で編集しない。
// GA4測定ID。ビルド時に env GA_MEASUREMENT_ID から注入される。未設定なら空 → 計測ノーオペ。
window.__GA_ID__ = ${JSON.stringify(id)};
`

await mkdir(OUT_DIR, { recursive: true })
await writeFile(OUT_FILE, content)

console.log(
  id
    ? `analytics-config.js: GA_MEASUREMENT_ID を注入しました (${id})`
    : 'analytics-config.js: GA_MEASUREMENT_ID 未設定 → 空値（計測は無効）'
)
