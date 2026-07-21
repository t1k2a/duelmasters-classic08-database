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

// ローカル実行時は .env を process.env へ読み込む（src/chat/env.ts と同じ慣習）。
// CI（deploy.yml）には .env が無く process.loadEnvFile は throw するため握りつぶす。
// その場合は CI が渡す process.env.GA_MEASUREMENT_ID をそのまま使う。
try {
  process.loadEnvFile?.('.env')
} catch {
  /* .env が無い環境（CI等）は正常。注入済みの process.env を使う */
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../public/js')
const OUT_FILE = join(OUT_DIR, 'analytics-config.js')

const id = (process.env.GA_MEASUREMENT_ID ?? '').trim()
const PLACEHOLDER = 'G-XXXXXXXXXX'

// GA4 IDの簡易バリデーション（事故検知目的。注入自体は続行する）。
if (id && id !== PLACEHOLDER && !/^G-[A-Z0-9]+$/.test(id)) {
  console.warn(
    `[build-analytics-config] 警告: GA_MEASUREMENT_ID がGA4形式(/^G-[A-Z0-9]+$/)に一致しません: ${id}`
  )
}

// JSON.stringify で文字列化しつつ、<script> の途中終了を防ぐため < / を退避する（多層防御）。
const idLiteral = JSON.stringify(id).replace(/</g, '\\u003c').replace(/\//g, '\\/')
const content = `// 自動生成ファイル（scripts/build-analytics-config.ts）。手で編集しない。
// GA4測定ID。ビルド時に env GA_MEASUREMENT_ID から注入される。未設定なら空 → 計測ノーオペ。
window.__GA_ID__ = ${idLiteral};
`

await mkdir(OUT_DIR, { recursive: true })
await writeFile(OUT_FILE, content)

console.log(
  id
    ? `analytics-config.js: GA_MEASUREMENT_ID を注入しました (${id})`
    : 'analytics-config.js: GA_MEASUREMENT_ID 未設定 → 空値（計測は無効）'
)
