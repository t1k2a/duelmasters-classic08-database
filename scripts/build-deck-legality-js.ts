// src/verify/deck-legality.ts から public/js/deck-legality.js を自動生成する。
//
// バンドラは無いが、型だけを除去すれば手書きプレーンJSと等価になるロジックのため、
// TypeScript コンパイラの transpileModule（型除去のみ、モジュール変換なし）で足りる。
// これにより TS 版と JS 版の手動同期ドリフトを構造的に無くす（CodeRabbit指摘 PR #46 対応）。

import ts from 'typescript'
import { readFileSync, writeFileSync } from 'node:fs'

const SRC = 'src/verify/deck-legality.ts'
const DEST = 'public/js/deck-legality.js'

const source = readFileSync(SRC, 'utf-8')
  // ブラウザ側は RestrictionList 型を import しない（型のみのため実行時に不要）
  .replace(/^import .*from '\.\/restrictions\.js'\n/m, '')
  // export を消してから変換することで、TS が ES モジュールと判定せず
  // CommonJS の exports/Object.defineProperty 等を出力しないようにする
  // （ブラウザには exports が存在しないため、残ると ReferenceError になる）
  .replace(/^export (function|interface|type)/gm, '$1')

const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.None,
    removeComments: false,
  },
})

const header = `// クラシック08 独自制限リストに基づくデッキ合法性判定（ブラウザ向けプレーンJS版）。
//
// 自動生成ファイル。編集しないこと。
// 生成元: src/verify/deck-legality.ts
// 生成コマンド: npx tsx scripts/build-deck-legality-js.ts
// （このファイルを変更したい場合は生成元を変更してから再生成すること）

`

writeFileSync(DEST, header + outputText.trimStart())
console.log(`generated: ${DEST}`)
