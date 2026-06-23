// src/chat/prompt.ts
import type { RetrievalResult, ChatTurn } from './types.js'

const SYSTEM = `あなたはデュエル・マスターズ「クラシック08環境」の対話アシスタントです。
厳守事項:
- 回答は「以下の参考情報(context)」に書かれていることだけを根拠にする。
- contextに無い事実・カードの数値・能力テキストは創作しない。分からなければ「このDBには情報がありません」と答える。
- カードのコストやパワーなどの数値は、あなたが書かず「《カード名》」で参照するに留める（数値は別途表示される）。
- 一般知識や2008年以降の新カードは扱わない。
- 日本語で簡潔に。デッキ相談では参考レシピを踏まえて助言する。`

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
