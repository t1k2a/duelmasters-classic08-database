#!/usr/bin/env node
// X投稿の weighted 文字数を実測する。全角=2, 半角(ASCII)=1, URL(http/https)=23固定。上限280。
import { readFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) { console.error('usage: node count-x.mjs <markdown-with-fenced-posts>'); process.exit(1) }

const text = readFileSync(file, 'utf8')
// ```で囲まれたコードブロックを1投稿として抽出
const blocks = [...text.matchAll(/```\n([\s\S]*?)```/g)].map(m => m[1].replace(/\n$/, ''))

function weight(str) {
  // URLを23字換算に置換してからカウント
  const urlRe = /https?:\/\/[^\s]+/g
  let urls = 0
  const stripped = str.replace(urlRe, () => { urls++; return '' })
  let w = 0
  for (const ch of stripped) {
    const cp = ch.codePointAt(0)
    // ASCII(半角)およびラテン系半角記号は1、それ以外(全角/CJK/絵文字)は2
    w += (cp <= 0x7f) ? 1 : 2
  }
  return w + urls * 23
}

let idx = 0, over = 0
for (const b of blocks) {
  // 計測方法の説明コードブロック(bashコマンド等)はスキップ: 先頭がnode/bashのものを除外
  if (/^(node |bash|#!)/.test(b.trim())) continue
  idx++
  const w = weight(b)
  const ok = w <= 280
  if (!ok) over++
  const firstLine = b.split('\n')[0].slice(0, 24)
  console.log(`${ok ? 'OK ' : 'NG!'} ${String(w).padStart(3)}/280  #${String(idx).padStart(2)}  ${firstLine}`)
}
console.log(`\n投稿 ${idx}本 / 上限超過 ${over}本`)
process.exit(over ? 1 : 0)
