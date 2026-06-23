/**
 * AIチャットUI E2E（モック） — health/chat を page.route で擬似応答
 *
 * 実行: node scripts/e2e-chat.mjs
 *   （ブラウザは PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers 前提。npm run test:e2e:chat 経由を推奨）
 * 自己完結: 内蔵HTTPサーバで public/ を配信 → CHAT_API_BASE への通信を route でモック → 検証。
 * exit code: 全件 PASS=0 / 1 件以上 FAIL=1
 *
 * 実バックエンド（Ollama/ngrok）は不要。SSE本文は擬似 `data:` 行で再現する。
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'public');

// index.html の ?chatApi= 上書きフックに渡すテスト用API原点。
// （プレースホルダのままだと本番ガードでfetchがスキップされるため、実URL風の値を注入してモックする）
const CHAT_API_BASE = 'https://chat-e2e.example.test';

// ---- 内蔵 HTTP サーバー起動（public 配信） ----
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let fp = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const BASE = `http://localhost:${PORT}`;
console.log(`[e2e-chat] server started at ${BASE}`);

// ---- 結果記録 ----
const results = [];
function rec(id, name, pass, detail = '') {
  results.push({ id, name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  #${String(id).padStart(2, '0')} ${name}${detail ? ' :: ' + detail : ''}`);
}

// 擬似SSE本文を生成（token数行＋done＋根拠cards）
function sseBody({ tokens, cards }) {
  const lines = tokens.map(t => `data: ${JSON.stringify({ token: t })}\n\n`);
  lines.push(`data: ${JSON.stringify({ done: true, cards: cards ?? [], recipes: [] })}\n\n`);
  return lines.join('');
}

const SAMPLE_CARD = {
  id: 'dm07-s2', name: 'ボルメテウス・ホワイト・ドラゴン', cardType: 'クリーチャー',
  cost: 6, power: 5000, civilizations: ['火'], races: ['アーマード・ドラゴン'],
  rarity: 'VR', text: 'このクリーチャーがブロックされたとき…', printings: [],
};

// health 応答を切り替えられるよう変数で保持
let healthUp = true;

async function setupRoutes(page) {
  await page.route(CHAT_API_BASE + '/api/health', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', up: healthUp, model: 'stub', depth: 0 }) })
  );
  await page.route(CHAT_API_BASE + '/api/chat', route =>
    route.fulfill({
      status: 200, contentType: 'text/event-stream',
      body: sseBody({ tokens: ['ボルメテウス', 'は', '火文明の', 'ドラゴン', 'です。'], cards: [SAMPLE_CARD] }),
    })
  );
}

async function gotoIndex(page) {
  // ?chatApi= で CHAT_API_BASE をモック原点に上書きしてから読み込む
  await page.goto(BASE + '/index.html?chatApi=' + encodeURIComponent(CHAT_API_BASE));
  await page.waitForFunction(() => {
    const el = document.getElementById('resultCount');
    return el && /件中/.test(el.textContent);
  }, { timeout: 15000 });
}

// ---- ブラウザ起動 ----
const browser = await chromium.launch({ headless: true });

// ===== #1 health up で FAB 表示 =====
try {
  healthUp = true;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await setupRoutes(page);
  await gotoIndex(page);
  await page.waitForTimeout(300);
  const fabVisible = await page.locator('#chatFab').isVisible();
  rec(1, 'health up で FAB 表示', fabVisible, `fabVisible=${fabVisible}`);
  await ctx.close();
} catch (e) { rec(1, 'health up で FAB 表示', false, 'EXC: ' + e.message); }

// ===== #2 health down で FAB 非表示 =====
try {
  healthUp = false;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await setupRoutes(page);
  await gotoIndex(page);
  await page.waitForTimeout(300);
  const fabHidden = await page.locator('#chatFab').isHidden();
  rec(2, 'health down で FAB 非表示', fabHidden, `fabHidden=${fabHidden}`);
  await ctx.close();
} catch (e) { rec(2, 'health down で FAB 非表示', false, 'EXC: ' + e.message); }

// ===== #3 シート開閉 =====
try {
  healthUp = true;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await setupRoutes(page);
  await gotoIndex(page);
  await page.waitForTimeout(300);
  await page.locator('#chatFab').click();
  const opened = await page.locator('#chatSheet').isVisible();
  await page.locator('#chatSheet button[onclick="closeChatSheet()"]').click();
  await page.waitForTimeout(100);
  const closed = await page.locator('#chatSheet').isHidden();
  rec(3, 'シート開閉', opened && closed, `opened=${opened}, closed=${closed}`);
  await ctx.close();
} catch (e) { rec(3, 'シート開閉', false, 'EXC: ' + e.message); }

// ===== #4 token逐次描画 ＆ カードカード描画 =====
try {
  healthUp = true;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await setupRoutes(page);
  await gotoIndex(page);
  await page.waitForTimeout(300);
  await page.locator('#chatFab').click();
  await page.fill('#chatInput', 'ボルメテウス・ホワイト・ドラゴンの能力は？');
  await page.locator('#chatSendBtn').click();
  await page.waitForTimeout(500);
  const logText = await page.locator('#chatLog').textContent();
  const tokenRendered = logText.includes('ボルメテウスは火文明のドラゴンです。');
  const userRendered = logText.includes('能力は？');
  const cardCount = await page.locator('#chatLog img[src*="cardimage"]').count();
  const cardName = await page.locator('#chatLog').getByText('ボルメテウス・ホワイト・ドラゴン', { exact: true }).count();
  rec(4, 'token逐次描画＆カードカード描画',
    tokenRendered && userRendered && cardCount > 0 && cardName > 0,
    `token=${tokenRendered}, user=${userRendered}, cardImgs=${cardCount}, cardName=${cardName}`);
  await ctx.close();
} catch (e) { rec(4, 'token逐次描画＆カードカード描画', false, 'EXC: ' + e.message); }

// ===== #5 リセットでログ消去 =====
try {
  healthUp = true;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await setupRoutes(page);
  await gotoIndex(page);
  await page.waitForTimeout(300);
  await page.locator('#chatFab').click();
  await page.fill('#chatInput', 'ブロッカーって何？');
  await page.locator('#chatSendBtn').click();
  await page.waitForTimeout(400);
  const before = (await page.locator('#chatLog').textContent()).trim().length;
  await page.locator('#chatSheet button[onclick="resetChat()"]').click();
  await page.waitForTimeout(100);
  const after = (await page.locator('#chatLog').textContent()).trim().length;
  rec(5, 'リセットでログ消去', before > 0 && after === 0, `before=${before}, after=${after}`);
  await ctx.close();
} catch (e) { rec(5, 'リセットでログ消去', false, 'EXC: ' + e.message); }

// ===== サマリー =====
await browser.close();
server.close();
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log('\n===== SUMMARY =====');
console.log(`${passed}/${results.length} passed`);
if (failed > 0) {
  console.log('\nFAILED:');
  results.filter(r => !r.pass).forEach(r => console.log(`  #${String(r.id).padStart(2, '0')} ${r.name} :: ${r.detail}`));
}
process.exit(failed > 0 ? 1 : 0);
