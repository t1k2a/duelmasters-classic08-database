// src/chat/env.ts
// ローカル実行時に .env を process.env へ読み込む（依存ライブラリ不要）。
// server.ts の「最初の import」として読み込むこと。ollama.ts/gemini.ts は
// モジュール先頭で process.env を参照するため、それらより前に評価される必要がある。
// Render など PaaS は環境変数を直接注入し .env は存在しないので、ENOENT は握りつぶす。
try {
  process.loadEnvFile?.('.env')
} catch {
  /* .env が無い環境（Render等）は正常。注入済みの process.env を使う */
}
