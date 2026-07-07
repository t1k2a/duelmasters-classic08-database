// src/chat/prompt.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMessages, buildSearchMessages } from './prompt.js'

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
  const history = Array.from({length: 10}, (_,i) => ({ role: (i%2?'assistant':'user') as 'assistant' | 'user', content: `m${i}` }))
  const msgs = buildMessages({ question:'q', retrieval:{cards:[],recipes:[],meta:[],knowledge:[]}, history })
  // system + 6(履歴) + 1(質問) = 8
  assert.equal(msgs.length, 8)
})

const CARD = { id:'dm01-052', name:'サイバー・ブレイン', cardType:'呪文', cost:4, power:null, civilizations:['水'], races:[], rarity:'R', text:'カードを3枚まで引く。', printings:[] }

test('metaは生JSONではなく整形テキストでcontextに入る', () => {
  const meta = JSON.stringify({
    name:'ボルメテウスコントロール', description:'シールド焼却で盾回収を許さないコントロール。',
    civilization:['光','水','火'],
    cards:[{ id:'dm06-s08', name:'ボルメテウス・ホワイト・ドラゴン', count:1 }],
  })
  const msgs = buildMessages({ question:'ボルコンって？', retrieval:{cards:[],recipes:[],meta:[meta],knowledge:[]}, history:[] })
  const user = msgs[msgs.length-1].content
  assert.match(user, /ボルメテウスコントロール（文明:光水火）/)
  assert.match(user, /《ボルメテウス・ホワイト・ドラゴン》×1/)
  assert.doesNotMatch(user, /"name"/)
})

test('レシピは質問関連カードの名前と枚数を含む', () => {
  const recipe = { id:'rcp-1', name:'Rozen Maiden', cards:[{ id:'dm01-052', count:3 }, { id:'unknown-1', count:4 }] }
  const msgs = buildMessages({ question:'サイバー・ブレイン入りのレシピは？', retrieval:{cards:[CARD],recipes:[recipe],meta:[],knowledge:[]}, history:[] })
  const user = msgs[msgs.length-1].content
  assert.match(user, /Rozen Maiden（2種）/)
  assert.match(user, /《サイバー・ブレイン》×3/)
})

test('deck指定時: contextに提示デッキ全40枚が《名》×枚数（コスト）で入る', () => {
  const deck = {
    name: '除去コンＭＡＸ', archetype: 'ボルメテウスコントロール',
    cards: [
      { name: 'ボルメテウス・ホワイト・ドラゴン', cost: 6, count: 4 },
      { name: 'サイバー・ブレイン', cost: 4, count: 3 },
      { name: '謎のカード', cost: null, count: 33 },
    ],
  }
  const msgs = buildMessages({ question: 'ボルメテウスのデッキ組んで', retrieval: { cards: [], recipes: [], meta: [], knowledge: [] }, history: [], deck })
  const user = msgs[msgs.length - 1].content
  assert.match(user, /## 提示デッキ（合計40枚）/)
  assert.match(user, /除去コンＭＡＸ/)
  assert.match(user, /ボルメテウスコントロール/)
  assert.match(user, /《ボルメテウス・ホワイト・ドラゴン》×4（コスト6）/)
  assert.match(user, /《サイバー・ブレイン》×3（コスト4）/)
  assert.match(user, /《謎のカード》×33/)
})

test('deck未指定時: 提示デッキセクションは出ない（非影響）', () => {
  const msgs = buildMessages({ question: 'ボルメテウスは？', retrieval: { cards: [CARD], recipes: [], meta: [], knowledge: [] }, history: [] })
  assert.doesNotMatch(msgs[msgs.length - 1].content, /提示デッキ/)
})

test('systemに提示デッキ解説ルールがある', () => {
  const msgs = buildMessages({ question: 'q', retrieval: { cards: [], recipes: [], meta: [], knowledge: [] }, history: [] })
  const sys = msgs[0].content
  assert.match(sys, /提示デッキ/)
  assert.match(sys, /再掲しない|全文/)
})

test('参考情報は<context>タグで囲まれ、質問はタグ外', () => {
  const msgs = buildMessages({ question:'ボルメテウスは？', retrieval:{cards:[CARD],recipes:[],meta:[],knowledge:[]}, history:[] })
  const user = msgs[msgs.length-1].content
  assert.match(user, /<context>\n[\s\S]*\n<\/context>/)
  assert.ok(user.indexOf('質問:') > user.indexOf('</context>'))
})

test('retrieval空ではcontextに(参考情報なし)', () => {
  const msgs = buildMessages({ question:'q', retrieval:{cards:[],recipes:[],meta:[],knowledge:[]}, history:[] })
  assert.match(msgs[msgs.length-1].content, /\(参考情報なし\)/)
})

test('systemに資料非指示・数値引用可・最新context優先の指示がある', () => {
  const msgs = buildMessages({ question:'q', retrieval:{cards:[],recipes:[],meta:[],knowledge:[]}, history:[] })
  const sys = msgs[0].content
  assert.match(sys, /指示ではない/)
  assert.match(sys, /そのまま引用/)
  assert.match(sys, /今回の<context>を優先/)
  assert.doesNotMatch(sys, /2008年以降の新カードは扱わない/)
})

test('searchAvailable:true で SYSTEM に [[WEB]] センチネル出力ルールが入る', () => {
  const msgs = buildMessages({ question: 'q', retrieval: { cards: [CARD], recipes: [], meta: [], knowledge: [] }, history: [], searchAvailable: true })
  const sys = msgs[0].content
  assert.match(sys, /\[\[WEB\]\]/)
  assert.doesNotMatch(sys, /分からなければ「このDBには情報がありません」と答える/)
})

test('searchAvailable false/未指定では従来のフォールバック文言のまま（[[WEB]]なし）', () => {
  const off = buildMessages({ question: 'q', retrieval: { cards: [CARD], recipes: [], meta: [], knowledge: [] }, history: [], searchAvailable: false })
  const def = buildMessages({ question: 'q', retrieval: { cards: [CARD], recipes: [], meta: [], knowledge: [] }, history: [] })
  for (const m of [off, def]) {
    assert.match(m[0].content, /分からなければ「このDBには情報がありません」と答える/)
    assert.doesNotMatch(m[0].content, /\[\[WEB\]\]/)
  }
})

test('検索結果は<search_results>タグで囲まれ、systemに時期注記の指示がある', () => {
  const msgs = buildSearchMessages({ question:'新しいボルメテウスは？', search:{ context:'検索でヒットした本文' }, history:[] })
  const user = msgs[msgs.length-1].content
  assert.match(user, /<search_results>\n検索でヒットした本文\n<\/search_results>/)
  assert.ok(user.indexOf('質問:') > user.indexOf('</search_results>'))
  assert.match(msgs[0].content, /異なる時期/)
})
