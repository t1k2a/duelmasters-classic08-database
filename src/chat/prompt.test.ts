// src/chat/prompt.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMessages } from './prompt.js'

test('systemに厳格指示・contextにカード名が入る', () => {
  const msgs = buildMessages({
    question: 'ボルメテウスは？',
    retrieval: { cards: [{ id:'x', name:'ボルメテウス・ホワイト・ドラゴン', cardType:'クリーチャー', cost:6, power:5000, civilizations:['火','水'], races:['アーマード・ドラゴン'], rarity:'VR', text:'…', printings:[] }], recipes: [], meta: [], knowledge: [] },
    history: [],
  })
  assert.equal(msgs[0].role, 'system')
  assert.match(msgs[0].content, /情報がありません|創作しない|文脈/)
  assert.match(msgs[msgs.length-1].content, /ボルメテウス/)
})

test('履歴は直近3往復に制限', () => {
  const history = Array.from({length: 10}, (_,i) => ({ role: (i%2?'assistant':'user') as const, content: `m${i}` }))
  const msgs = buildMessages({ question:'q', retrieval:{cards:[],recipes:[],meta:[],knowledge:[]}, history })
  // system + 6(履歴) + 1(質問) = 8
  assert.equal(msgs.length, 8)
})
