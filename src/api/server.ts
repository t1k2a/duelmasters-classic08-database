/**
 * Phase 4 — Search API server (Hono + Node.js)
 *
 * Usage: npx tsx src/api/server.ts
 *
 * Endpoints:
 *   GET /api/cards   — search cards with filters
 *   GET /api/health  — health check
 *   GET /            — minimal HTML search UI
 *
 * Query params for /api/cards:
 *   name        — card name substring
 *   text        — ability text substring
 *   civilization — comma-separated OR: "光" | "水,闇"
 *   cardType    — comma-separated OR: "クリーチャー" | "クリーチャー,進化クリーチャー"
 *   race        — race name substring
 *   cost_min, cost_max   — integer cost range
 *   power_min, power_max — integer power range
 *   limit       — max results (default 20, max 100)
 *   offset      — pagination offset
 */

import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { searchCards, prisma } from './search.js'

const app = new Hono()

// Health check
app.get('/api/health', async (c) => {
  const count = await prisma.card.count()
  return c.json({ status: 'ok', cardCount: count })
})

// Card search endpoint
app.get('/api/cards', async (c) => {
  const q = c.req.query()
  try {
    const result = await searchCards({
      name: q['name'],
      text: q['text'],
      civilization: q['civilization'],
      cardType: q['cardType'] ?? q['card_type'],
      race: q['race'],
      costMin: q['cost_min'] ? parseInt(q['cost_min']) : undefined,
      costMax: q['cost_max'] ? parseInt(q['cost_max']) : undefined,
      powerMin: q['power_min'] ? parseInt(q['power_min']) : undefined,
      powerMax: q['power_max'] ? parseInt(q['power_max']) : undefined,
      limit: q['limit'] ? parseInt(q['limit']) : 20,
      offset: q['offset'] ? parseInt(q['offset']) : 0,
    })
    return c.json(result)
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Search failed' }, 500)
  }
})

// Minimal HTML search UI
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>デュエマ クラシック08 カード検索</title>
  <style>
    body { font-family: sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
    h1 { color: #333; }
    form { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1rem; }
    label { font-size: 0.85rem; color: #555; display: flex; flex-direction: column; gap: 2px; }
    input, select { padding: 0.4rem; border: 1px solid #ccc; border-radius: 4px; }
    button { grid-column: span 2; padding: 0.6rem; background: #1a73e8; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; }
    button:hover { background: #1558b0; }
    #results { margin-top: 1.5rem; }
    .card { border: 1px solid #ddd; border-radius: 6px; padding: 0.8rem; margin-bottom: 0.6rem; }
    .card-name { font-weight: bold; font-size: 1.05rem; }
    .card-meta { color: #666; font-size: 0.85rem; margin-top: 0.2rem; }
    .card-text { font-size: 0.85rem; margin-top: 0.4rem; white-space: pre-wrap; background: #f9f9f9; padding: 0.4rem; border-radius: 4px; }
    .total { color: #555; margin-bottom: 0.8rem; }
  </style>
</head>
<body>
  <h1>デュエマ クラシック08 カード検索</h1>
  <form id="searchForm">
    <label>カード名
      <input name="name" placeholder="例: ボルメテウス">
    </label>
    <label>文明 (カンマ区切りでOR)
      <input name="civilization" placeholder="例: 光 / 火,自然">
    </label>
    <label>カードの種類
      <select name="cardType">
        <option value="">すべて</option>
        <option>クリーチャー</option>
        <option>進化クリーチャー</option>
        <option>呪文</option>
        <option>クロスギア</option>
        <option>城</option>
      </select>
    </label>
    <label>種族
      <input name="race" placeholder="例: ドラゴン">
    </label>
    <label>コスト（最小）
      <input name="cost_min" type="number" min="1" max="20" placeholder="1">
    </label>
    <label>コスト（最大）
      <input name="cost_max" type="number" min="1" max="20" placeholder="20">
    </label>
    <label>パワー（最小）
      <input name="power_min" type="number" placeholder="1000">
    </label>
    <label>パワー（最大）
      <input name="power_max" type="number" placeholder="99000">
    </label>
    <label>テキスト検索
      <input name="text" placeholder="例: ブロッカー">
    </label>
    <label>表示件数
      <select name="limit">
        <option value="20">20件</option>
        <option value="50">50件</option>
        <option value="100">100件</option>
      </select>
    </label>
    <button type="submit">検索</button>
  </form>
  <div id="results"></div>

  <script>
    const form = document.getElementById('searchForm');
    const results = document.getElementById('results');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const params = new URLSearchParams();
      for (const [k, v] of data.entries()) {
        if (v) params.append(k, v);
      }
      results.innerHTML = '<p>検索中...</p>';
      try {
        const res = await fetch('/api/cards?' + params.toString());
        const json = await res.json();
        render(json);
      } catch(err) {
        results.innerHTML = '<p>エラーが発生しました</p>';
      }
    });

    function civColor(civ) {
      return { '光':'#ffe', '水':'#e8f4ff', '闇':'#f0e8ff', '火':'#fff0e8', '自然':'#e8ffe8' }[civ] || '#fff';
    }

    function render({ total, cards }) {
      if (!cards.length) { results.innerHTML = '<p>該当カードなし</p>'; return; }
      const cardHtml = cards.map(c => {
        const civs = c.civilizations.join('/');
        const races = c.races.join('/');
        const prints = c.printings.map(p => p.setCode + ' ' + p.cardNumber).join(', ');
        const power = c.power != null ? c.power.toLocaleString() : '—';
        return \`<div class="card">
          <div class="card-name">\${c.name}</div>
          <div class="card-meta">\${c.cardType} | 文明:\${civs || '—'} | 種族:\${races || '—'} | コスト:\${c.cost ?? '—'} | パワー:\${power} | \${c.printings[0]?.rarity ?? ''} | \${prints}</div>
          \${c.text ? \`<div class="card-text">\${c.text}</div>\` : ''}
        </div>\`;
      }).join('');
      results.innerHTML = \`<div class="total">検索結果: \${total} 件 (表示: \${cards.length}件)</div>\` + cardHtml;
    }
  </script>
</body>
</html>`)
})

const PORT = parseInt(process.env['PORT'] ?? '3000')
console.log(`Server running at http://localhost:${PORT}`)
serve({ fetch: app.fetch, port: PORT })
