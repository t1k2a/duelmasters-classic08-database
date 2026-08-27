// src/chat/retriever.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCorpus } from './corpus.js'
import { retrieve } from './retriever.js'

test('カード名を含む質問でそのカードを抽出', async () => {
  const c = await loadCorpus()
  const r = retrieve(c, 'ボルメテウス・ホワイト・ドラゴンの能力は？')
  assert.ok(r.cards.some(x => x.name.includes('ボルメテウス')), '該当カード抽出')
})

test('用語質問でknowledgeを抽出', async () => {
  const c = await loadCorpus()
  const r = retrieve(c, 'ブロッカーって何？')
  assert.ok(r.knowledge.some(k => k.includes('ブロッカー')), '知識抽出')
})

test('DB外の語では空に近い結果', async () => {
  const c = await loadCorpus()
  const r = retrieve(c, '令和の最新カードについて')
  assert.equal(r.cards.length, 0)
})

test('アーキタイプ主要語（天門）でmetaまたはキーカードを抽出', async () => {
  const c = await loadCorpus()
  const r = retrieve(c, '天門デッキを組みたい')
  assert.ok(r.meta.length > 0 || r.cards.length > 0, 'meta/cardsいずれか非空')
  assert.ok(r.cards.length > 0, 'キーカード昇格')
})

test('用語の主要語（殿堂）で knowledge を抽出', async () => {
  const c = await loadCorpus()
  const r = retrieve(c, '殿堂って何？')
  assert.ok(r.knowledge.some(k => k.includes('殿堂')), '殿堂レギュレーション抽出')
})

test('略記された質問（クラシック05と08の違い）でも環境knowledgeを抽出', async () => {
  const c = await loadCorpus()
  const r = retrieve(c, 'クラシック05と08の違いは？')
  assert.ok(r.knowledge.some(k => k.includes('クラシック05')), '環境の違いを抽出（バイグラム照合）')
})

test('略称・俗称（ALIAS_MAP）から正式名称カードを正確に抽出', async () => {
  const c = await loadCorpus()
  const cases = [
    { query: 'ハヤブサマルの能力は？', expected: 'ハヤブサマル' },
    { query: 'パクリオの使い方', expected: 'パクリオ' },
    { query: 'ボルコンのキーカードは？', expected: 'ボルメテウス' },
    { query: 'デモハンは何マナ？', expected: 'デーモン・ハンド' },
    { query: '青単速攻のキーカード', expected: 'クリスタル' },
    { query: 'バイケンの使い方', expected: 'バイケン' },
    { query: 'エタソの効果教えて', expected: '英知と追撃の宝剣' },
    { query: 'PGの能力は？', expected: 'パーフェクト・ギャラクシー' },
    { query: 'マルコビートの切り札', expected: 'エンペラー・マルコ' },
    { query: 'ドルバロムの召喚条件', expected: '悪魔神ドルバロム' },
    { query: 'オルゼキアの除去能力', expected: '魔刻の斬将オルゼキア' },
    { query: '武者の効果は？', expected: 'ボルメテウス・武者・ドラゴン' },
  ]
  for (const { query, expected } of cases) {
    const r = retrieve(c, query)
    assert.ok(
      r.cards.some(card => card.name.includes(expected)) || r.knowledge.some(k => k.includes(expected)),
      `クエリ "${query}" で "${expected}" が抽出されること`
    )
  }
})

test('「属性（文明・コスト）＋役割」タグ検索で的確なカード群を抽出', async () => {
  const c = await loadCorpus()
  
  // 水文明の軽量ドロー
  const drawRes = retrieve(c, '水文明の軽量ドローソース教えて')
  assert.ok(
    drawRes.cards.some(card => card.civilizations.includes('水') && /(?:引|ドロー)/.test(card.text ?? '')),
    '水文明のドローカードが抽出されること'
  )

  // 闇文明の除去
  const killRes = retrieve(c, '闇文明の除去カード')
  assert.ok(
    killRes.cards.some(card => card.civilizations.includes('闇') && /(?:破壊|墓地)/.test(card.text ?? '')),
    '闇文明の除去カードが抽出されること'
  )

  // 光文明のS・トリガーブロッカー
  const stBlockerRes = retrieve(c, '光のS・トリガーブロッカー')
  assert.ok(
    stBlockerRes.cards.some(card => card.civilizations.includes('光') && (card.text ?? '').includes('ブロッカー')),
    '光のブロッカーカードが抽出されること'
  )
})
