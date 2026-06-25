// src/chat/prompt.ts
import type { RetrievalResult, ChatTurn } from './types.js'

const SYSTEM = `あなたはデュエル・マスターズ「クラシック08環境」の対話アシスタントです。
厳守事項:
- 回答は「以下の参考情報(context)」に書かれていることだけを根拠にする。
- contextに無い事実・カードの数値・能力テキストは創作しない。分からなければ「このDBには情報がありません」と答える。
- カードのコストやパワーなどの数値は、あなたが書かず「《カード名》」で参照するに留める（数値は別途表示される）。
- 一般知識や2008年以降の新カードは扱わない。
- 日本語で**簡潔に**。前置き・繰り返し・過剰な丁寧表現を避け、要点を絞る（目安: 全体で5〜8行程度）。
- デッキ相談は「軸となるキーカード」と「動きの要点」を短い箇条書きでまとめ、長文化しない。`

function renderContext(r: RetrievalResult): string {
  const parts: string[] = []
  if (r.cards.length) parts.push('## カード\n' + r.cards.map(c =>
    `- 《${c.name}》 ${c.cardType} / 文明:${c.civilizations.join('')} / コスト:${c.cost ?? '—'} / パワー:${c.power ?? '—'} / 種族:${c.races.join('・') || '—'}\n  ${c.text ?? ''}`).join('\n'))
  if (r.meta.length) parts.push('## メタデッキ\n' + r.meta.join('\n'))
  if (r.recipes.length) parts.push('## 参考レシピ\n' + r.recipes.map(x => `- ${x.name ?? x.id}（${x.cards?.length ?? 0}種）`).join('\n'))
  if (r.knowledge.length) parts.push('## 用語/ルール\n' + r.knowledge.join('\n'))
  if (!parts.length) return '(参考情報なし)'
  return parts.join('\n\n')
}

export function buildMessages(input: { question: string; retrieval: RetrievalResult; history: ChatTurn[] }) {
  const recent = input.history.slice(-6)
  return [
    { role: 'system', content: SYSTEM },
    ...recent.map(t => ({ role: t.role, content: t.content })),
    { role: 'user', content: `参考情報:\n${renderContext(input.retrieval)}\n\n質問: ${input.question}` },
  ]
}

// DB（クラシック08）に該当が無くWeb検索にフォールバックした場合のプロンプト。
// 「DB範囲外のWeb情報」であることを明示し、検索結果のみを根拠にさせる（推測の創作は禁止）。
const SEARCH_SYSTEM = `あなたはデュエル・マスターズ「クラシック08環境」の対話アシスタントです。
今回の質問はこのDB（クラシック08）に該当が無かったため、Web検索結果を参考に回答します。
厳守事項:
- 以下の「検索結果」に書かれていることだけを根拠にする。書かれていなければ「確かな情報が見つかりませんでした」と答える。
- 検索結果に無い数値・能力・事実を推測で創作しない。
- 日本語で簡潔に（目安5〜8行程度）。出典は別途リンク表示されるため本文に羅列しなくてよい。`

export function buildSearchMessages(input: { question: string; search: { context: string }; history: ChatTurn[] }) {
  const recent = input.history.slice(-6)
  return [
    { role: 'system', content: SEARCH_SYSTEM },
    ...recent.map(t => ({ role: t.role, content: t.content })),
    { role: 'user', content: `検索結果:\n${input.search.context || '(検索結果なし)'}\n\n質問: ${input.question}` },
  ]
}
