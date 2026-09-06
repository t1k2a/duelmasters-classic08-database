/**
 * デッキ構築応答 → 40枚カード画像グリッド描画 E2E（モック）
 *
 * 実行: PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers node scripts/e2e-deck.mjs
 * 自己完結: 内蔵HTTPで public/ を配信 → /api/chat の done に実レシピの deck を注入 → 実描画を検証。
 * 実バックエンド/LLMは不要。exit code: 全PASS=0 / 1件以上FAIL=1。
 *
 * 検証観点（AC-3/4/5）:
 *  - done後に40枚グリッドがDOMに存在（imgタイル数=種数、×枚数バッジ、デッキ名見出し、「40枚」明示）
 *  - 画像URLをabortし onerror フォールバック（🎴プレースホルダ表示）を確認、テキスト詳細は維持
 *  - 「デッキに読み込む」でデッキパネルに40枚展開
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'public');
const SCRATCH = '/tmp/duelmasters-classic08-e2e';
const CHAT_API_BASE = 'https://chat-e2e.example.test';

// 実レシピ（validated&&40枚、全カードid解決可能）を deck ペイロードとして使う
fs.mkdirSync(SCRATCH, { recursive: true });
const ALL_RECIPES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'recipes.json'), 'utf8'));
const PICK = ALL_RECIPES.find(recipe =>
  recipe.validated && Array.isArray(recipe.cards) && recipe.cards.reduce((sum, card) => sum + (card.count || 0), 0) === 40
);
if (!PICK) throw new Error('validated 40-card recipe not found');
const DECK = { id: PICK.id, name: PICK.name, archetype: PICK.archetype, cards: PICK.cards };
const UNIQUE = DECK.cards.length;
const TOTAL = DECK.cards.reduce((s, c) => s + (c.count || 0), 0);
// 実カード名（CARDSはスクリプトスコープでwindow非公開のため、node側で解決して照合に使う）
const CARDS_BY_ID = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'cards.json'), 'utf8')).map(c => [c.id, c.name]));
const FIRST_NAME = CARDS_BY_ID.get(DECK.cards[0].id);

// ---- 内蔵 HTTP サーバー（public 配信） ----
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
console.log(`[e2e-deck] server started at ${BASE}`);
console.log(`[e2e-deck] deck=${DECK.id} "${DECK.name}" unique=${UNIQUE} total=${TOTAL}`);

const results = [];
function rec(id, name, pass, detail = '') {
  results.push({ id, name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  #${String(id).padStart(2, '0')} ${name}${detail ? ' :: ' + detail : ''}`);
}

// done に deck を含むSSE本文
function sseBody() {
  const lines = ['デッキ', 'を', '提案します。'].map(t => `data: ${JSON.stringify({ token: t })}\n\n`);
  lines.push(`data: ${JSON.stringify({ done: true, cards: [], recipes: [{ id: DECK.id, name: DECK.name }], deck: DECK })}\n\n`);
  return lines.join('');
}

async function setupRoutes(page, { abortImages = false } = {}) {
  await page.route(CHAT_API_BASE + '/api/health', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', up: true, model: 'stub', depth: 0 }) })
  );
  await page.route(CHAT_API_BASE + '/api/chat', route =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody() })
  );
  // カード画像は外部ホスト。通常はabortして onerror（🎴フォールバック）を発火させ、オフラインでも決定的にする
  if (abortImages) {
    await page.route('**/wp-content/card/cardimage/**', route => route.abort());
  }
}

async function gotoAndAsk(page) {
  await page.goto(BASE + '/index.html?chatApi=' + encodeURIComponent(CHAT_API_BASE));
  await page.waitForFunction(() => {
    const el = document.getElementById('resultCount');
    return el && /件中/.test(el.textContent);
  }, { timeout: 15000 });
  await page.locator('#chatFab').click();
  await page.fill('#chatInput', 'ボルメテウスのデッキ組んで');
  await page.locator('#chatSendBtn').click();
  // デッキグリッド（🃏見出し）が出るまで待つ
  await page.waitForFunction(() => /🃏/.test(document.getElementById('chatLog')?.textContent || ''), { timeout: 8000 });
}

const browser = await chromium.launch({ headless: true });

// ===== #1 40枚グリッド描画（見出し・種数・合計・×枚数バッジ） =====
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await setupRoutes(page, { abortImages: true });
  await gotoAndAsk(page);
  await page.waitForTimeout(400);

  const logText = await page.locator('#chatLog').textContent();
  const headingOk = logText.includes(DECK.name);
  const totalOk = logText.includes(`${TOTAL}枚`) && logText.includes(`${UNIQUE}種`);
  const imgTiles = await page.locator('#chatLog img[src*="cardimage"]').count();
  const badgeCount = await page.locator('#chatLog span:has-text("×")').count();
  const loadBtn = await page.locator('#chatLog button:has-text("デッキに読み込む")').count();
  const pass = headingOk && totalOk && imgTiles === UNIQUE && badgeCount >= UNIQUE && loadBtn === 1;
  rec(1, '40枚グリッド描画（見出し/種数/合計/バッジ）', pass,
    `heading=${headingOk}, total/種=${totalOk}, imgTiles=${imgTiles}(期待${UNIQUE}), badges=${badgeCount}, loadBtn=${loadBtn}`);
  await page.screenshot({ path: path.join(SCRATCH, 'deck-grid.png'), fullPage: false });
  await ctx.close();
} catch (e) { rec(1, '40枚グリッド描画', false, 'EXC: ' + e.message); }

// ===== #2 画像onerror→🎴フォールバック（テキスト詳細は維持） =====
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await setupRoutes(page, { abortImages: true });
  await gotoAndAsk(page);
  await page.waitForTimeout(600);
  // 各タイルの placeholder が表示(display:flex)に切り替わっているか
  const placeholdersShown = await page.locator('#chatLog .card-img-placeholder').evaluateAll(
    els => els.filter(el => getComputedStyle(el).display !== 'none').length
  );
  const imgsHidden = await page.locator('#chatLog img[src*="cardimage"]').evaluateAll(
    els => els.filter(el => getComputedStyle(el).display === 'none').length
  );
  // テキスト詳細（カード名）が残っているか：最初のカード名で確認
  const nameKept = FIRST_NAME ? (await page.locator('#chatLog').getByText(FIRST_NAME, { exact: false }).count()) > 0 : false;
  const pass = placeholdersShown === UNIQUE && imgsHidden === UNIQUE && nameKept;
  rec(2, '画像onerror→🎴フォールバック（詳細維持）', pass,
    `placeholdersShown=${placeholdersShown}/${UNIQUE}, imgsHidden=${imgsHidden}/${UNIQUE}, nameKept=${nameKept}`);
  await ctx.close();
} catch (e) { rec(2, '画像onerror→🎴フォールバック', false, 'EXC: ' + e.message); }

// ===== #3 「デッキに読み込む」でデッキパネルに40枚展開 =====
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await setupRoutes(page, { abortImages: true });
  await gotoAndAsk(page);
  // loadRecipe は殿堂(hof)ロード完了が前提。準備できるまで待つ
  await page.waitForFunction(() => window.isRestrictionsReady && window.isRestrictionsReady(), { timeout: 8000 }).catch(() => {});
  await page.locator('#chatLog button:has-text("デッキに読み込む")').click();
  await page.waitForTimeout(400);
  // deck状態はDOMバッジ/合計表示で確認（deck変数はスクリプトスコープでwindow非公開）
  const badge = (await page.locator('#deckCountBadge').textContent()).trim();
  const panelVisible = await page.locator('#deckPanel').isVisible();
  const deckTotalText = (await page.locator('#deckTotal').textContent()).trim();
  const pass = badge === String(TOTAL) && /40\s*\/\s*40/.test(deckTotalText) && panelVisible;
  rec(3, '「デッキに読み込む」で40枚展開', pass, `badge=${badge}(期待${TOTAL}), deckTotal="${deckTotalText}", panelVisible=${panelVisible}`);
  await page.screenshot({ path: path.join(SCRATCH, 'deck-loaded.png'), fullPage: false });
  await ctx.close();
} catch (e) { rec(3, '「デッキに読み込む」で40枚展開', false, 'EXC: ' + e.message); }

// ===== #4 通常カード質問は deck を出さず ≤8枚グリッド（回帰・二重表示なし） =====
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // deck無し・cards付きの通常応答に差し替え
  await page.route(CHAT_API_BASE + '/api/health', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', up: true, model: 'stub', depth: 0 }) }));
  const SAMPLE = { id: DECK.cards[0].id, name: 'サンプルカード', cardType: 'クリーチャー', cost: 6, power: 5000, civilizations: ['火'], races: [], rarity: 'VR', text: 't', printings: [] };
  await page.route(CHAT_API_BASE + '/api/chat', route =>
    route.fulfill({ status: 200, contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ token: 'はい。' })}\n\ndata: ${JSON.stringify({ done: true, cards: [SAMPLE], recipes: [] })}\n\n` }));
  await page.route('**/wp-content/card/cardimage/**', route => route.abort());
  await page.goto(BASE + '/index.html?chatApi=' + encodeURIComponent(CHAT_API_BASE));
  await page.waitForFunction(() => { const el = document.getElementById('resultCount'); return el && /件中/.test(el.textContent); }, { timeout: 15000 });
  await page.locator('#chatFab').click();
  await page.fill('#chatInput', 'ボルメテウスってどんなカード？');
  await page.locator('#chatSendBtn').click();
  await page.waitForTimeout(500);
  const logText = await page.locator('#chatLog').textContent();
  const noDeckHeading = !/🃏/.test(logText);
  const noFortyText = !/40枚/.test(logText);
  const imgTiles = await page.locator('#chatLog img[src*="cardimage"]').count();
  const pass = noDeckHeading && noFortyText && imgTiles === 1;
  rec(4, '通常質問は deck無し・≤8枚（回帰）', pass, `noDeckHeading=${noDeckHeading}, noFortyText=${noFortyText}, imgTiles=${imgTiles}`);
  await ctx.close();
} catch (e) { rec(4, '通常質問は deck無し・≤8枚（回帰）', false, 'EXC: ' + e.message); }

// ===== #5 禁止コンビ同時投入でデッキパネルに違反警告が表示される =====
{
  let ctx;
  try {
    ctx = await browser.newContext();
    const page = await ctx.newPage();
    await setupRoutes(page, { abortImages: true });
    await page.goto(BASE + '/index.html');
    await page.waitForFunction(() => window.isRestrictionsReady && window.isRestrictionsReady(), { timeout: 8000 });
    // 母なる大地 + 龍仙ロマネスク（禁止コンビ）をデッキに追加
    await page.evaluate(() => { addToDeck('dm10-036'); addToDeck('dm25-s04'); });
    await page.locator('#deckFab').click();
    await page.waitForTimeout(200);
    const legalityText = await page.locator('#deckLegality').textContent();
    const pass = /母なる大地/.test(legalityText) && /龍仙ロマネスク/.test(legalityText) && /同時に投入|同時投入/.test(legalityText);
    rec(5, '禁止コンビ同時投入でデッキパネルに違反警告', pass, `legalityText="${legalityText.trim().slice(0, 120)}"`);
  } catch (e) { rec(5, '禁止コンビ同時投入でデッキパネルに違反警告', false, 'EXC: ' + e.message); }
  finally { if (ctx) await ctx.close(); }
}

// ===== #6 空デッキの共有操作はshare_deckを送らない =====
{
  let ctx;
  try {
    ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      window.__growthEvents = [];
      const spy = (eventName, params) => window.__growthEvents.push([eventName, params || {}]);
      Object.defineProperty(window, 'trackEvent', { configurable: true, get: () => spy, set: () => {} });
    });
    const page = await ctx.newPage();
    await page.goto(BASE + '/index.html');
    await page.waitForFunction(() => document.getElementById('resultCount') && /\u4ef6中/.test(document.getElementById('resultCount').textContent), { timeout: 15000 });
    const result = await page.evaluate(async () => {
      shareDeckX();
      if (typeof exportDeckImage === 'function') await exportDeckImage();
      return {
        exportDefined: typeof exportDeckImage === 'function',
        events: window.__growthEvents.filter(([name]) => name === 'share_deck'),
      };
    });
    rec(6, '空デッキでshare_deckを送らない', result.exportDefined && result.events.length === 0,
      `exportDefined=${result.exportDefined}, events=${result.events.length}`);
  } catch (e) { rec(6, '空デッキでshare_deckを送らない', false, 'EXC: ' + e.message); }
  finally { if (ctx) await ctx.close(); }
}

// ===== #7 X Intent はポップアップを開けた場合だけ共有導線を計測 =====
{
  let ctx;
  try {
    ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      window.__growthEvents = [];
      const spy = (eventName, params) => window.__growthEvents.push([eventName, params || {}]);
      Object.defineProperty(window, 'trackEvent', { configurable: true, get: () => spy, set: () => {} });
    });
    const page = await ctx.newPage();
    await page.goto(BASE + '/index.html?recipe=rcp-2628');
    await page.waitForFunction(() => deckTotalCount() === 40, { timeout: 15000 });
    const result = await page.evaluate(() => {
      window.__growthEvents.length = 0;
      window.open = () => null;
      shareDeckX();
      const blocked = window.__growthEvents.length;
      window.open = () => ({});
      shareDeckX();
      return { blocked, events: window.__growthEvents.filter(([name]) => name === 'share_deck') };
    });
    rec(7, 'X Intentはポップアップ成功時だけ計測', result.blocked === 0 && result.events.length === 1 && result.events[0][1].method === 'x',
      `blocked=${result.blocked}, events=${result.events.length}`);
  } catch (e) { rec(7, 'X Intentはポップアップ成功時だけ計測', false, 'EXC: ' + e.message); }
  finally { if (ctx) await ctx.close(); }
}

// ===== #7 画像に復元URL/QRを描画し、QR失敗時もPNGを出力する =====
{
  let ctx;
  try {
    ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      window.__drawnTexts = [];
      window.__downloadSizes = [];
      const originalFillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
        window.__drawnTexts.push(String(text));
        return originalFillText.call(this, text, ...args);
      };
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
      URL.createObjectURL = blob => {
        window.__downloadSizes.push(blob.size);
        return 'blob:e2e-download';
      };
      URL.revokeObjectURL = () => {};
      HTMLAnchorElement.prototype.click = function () {};
    });
    const page = await ctx.newPage();
    await page.goto(BASE + '/index.html?recipe=' + encodeURIComponent(DECK.id));
    await page.waitForFunction(() => document.getElementById('deckCountBadge')?.textContent === '40', { timeout: 15000 });
    const result = await page.evaluate(async () => {
      window.__shareEvents = [];
      window.trackGrowthEvent = (eventName, params) => window.__shareEvents.push([eventName, params]);
      await exportDeckImage();
      const qrAvailable = typeof qrcode === 'function';
      window.qrcode = () => { throw new Error('forced QR failure'); };
      await exportDeckImage();
      return {
        qrAvailable,
        texts: window.__drawnTexts,
        sizes: window.__downloadSizes,
        events: window.__shareEvents,
      };
    });
    const hasSite = result.texts.some(text => text.includes('デュエマ クラシック08 データベース'));
    const hasRestoreURL = result.texts.some(text => text.includes('?d='));
    const twoPngs = result.sizes.length === 2 && result.sizes.every(size => size > 0);
    const downloadsTracked = result.events.length === 2 && result.events.every(([name, params]) =>
      name === 'share_deck' && params.method === 'image_download' && params.card_count === 40);
    rec(7, '復元URL/QR付き画像とQR失敗fallback', result.qrAvailable && hasSite && hasRestoreURL && twoPngs && downloadsTracked,
      `qr=${result.qrAvailable}, site=${hasSite}, url=${hasRestoreURL}, pngSizes=${result.sizes.join(',')}, events=${JSON.stringify(result.events)}`);
  } catch (e) { rec(7, '復元URL/QR付き画像とQR失敗fallback', false, 'EXC: ' + e.message); }
  finally { if (ctx) await ctx.close(); }
}

// ===== #10 Web Share成功時は共有完了後にweb_shareだけを計測する =====
{
  const ctx = await browser.newContext();
  try {
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      navigator.share = async () => {};
      HTMLAnchorElement.prototype.click = function () { throw new Error('download should not run'); };
    });
    const page = await ctx.newPage();
    await page.goto(BASE + '/index.html?recipe=' + encodeURIComponent(DECK.id));
    await page.waitForFunction(() => document.getElementById('deckCountBadge')?.textContent === '40', { timeout: 15000 });
    const events = await page.evaluate(async () => {
      window.__shareEvents = [];
      window.trackGrowthEvent = (eventName, params) => window.__shareEvents.push([eventName, params]);
      await exportDeckImage();
      return window.__shareEvents;
    });
    rec(10, 'Web Share成功後にweb_shareだけを計測', events.length === 1 && events[0][0] === 'share_deck' &&
      events[0][1].method === 'web_share' && events[0][1].card_count === 40, `events=${JSON.stringify(events)}`);
  } catch (e) { rec(10, 'Web Share成功後にweb_shareだけを計測', false, e.message); }
  finally { await ctx.close(); }
}

// 40種類のカードがすべて描かれ、長い復元URLのQRも整数ピクセルで描画される。
{
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    await page.goto(BASE + '/index.html?recipe=' + encodeURIComponent(DECK.id));
    await page.waitForFunction(() => document.getElementById('deckCountBadge')?.textContent === '40');
    const result = await page.evaluate(async () => {
      deck = CARDS.slice(0, 40).map(card => ({ id: card.id, count: 1 }));
      const badges = [];
      const modules = [];
      let imageHeight = 0;
      const originalText = CanvasRenderingContext2D.prototype.fillText;
      const originalRect = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...rest) {
        if (text === '×1') badges.push(y);
        imageHeight = this.canvas.height;
        return originalText.call(this, text, x, y, ...rest);
      };
      CanvasRenderingContext2D.prototype.fillRect = function(x, y, w, h) {
        if (this.fillStyle === '#0f172a' && w === h) modules.push([x, y, w]);
        return originalRect.call(this, x, y, w, h);
      };
      Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
      HTMLAnchorElement.prototype.click = function() {};
      await exportDeckImage();
      return { badges, modules, imageHeight };
    });
    rec(8, '40種類すべて描画しQRは3px以上の整数module', result.badges.length === 40 &&
      result.modules.length > 0 && Math.max(...result.badges) < Math.min(...result.modules.map(module => module[1])) &&
      result.modules.every(module => module.every(Number.isInteger) && module[2] >= 3),
      `cards=${result.badges.length}, height=${result.imageHeight}, modules=${result.modules.length}`);
  } catch (e) { rec(8, '40種類すべて描画しQRは3px以上の整数module', false, e.message); }
  finally { await ctx.close(); }
}

// ===== #9 ?recipe=で復元したデッキは対応する解説ページへ移動できる =====
{
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    await page.goto(BASE + '/index.html?recipe=rcp-2628');
    await page.waitForFunction(() => document.getElementById('deckCountBadge')?.textContent === '40', { timeout: 15000 });
    const guide = page.locator('#deckRelatedGuide a');
    await guide.waitFor({ state: 'visible', timeout: 15000 });
    const href = await guide.getAttribute('href');
    rec(9, '復元デッキから対応する解説ページへ移動', href === 'deck-guide/shinobi-dorugeza/', `href=${href}`);
  } catch (e) { rec(9, '復元デッキから対応する解説ページへ移動', false, e.message); }
  finally { await ctx.close(); }
}

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
