/** Local-only deck UX and analytics checks. Never uses a personal browser profile. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const artifacts = process.env.QA_ARTIFACT_DIR || path.resolve('qa-deck-progress');
await fs.mkdir(artifacts, { recursive: true });
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/js/analytics-config.js') return res.writeHead(200, { 'Content-Type': 'text/javascript' }).end('window.__GA_ID__="G-QATEST123";');
    const filename = path.resolve(root, '.' + (url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname));
    if (!filename.startsWith(root + path.sep)) return res.writeHead(403).end();
    const content = await fs.readFile(filename);
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' })[path.extname(filename)] || 'application/octet-stream' }).end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const results = [];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, serviceWorkers: 'block' });
    context.setDefaultTimeout(8000);
    const tagRequests = [], externalRequests = [];
    let resolveTagRequest;
    const tagRequestRecorded = new Promise(resolve => { resolveTagRequest = resolve; });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === base) return route.continue();
      externalRequests.push(url.hostname);
      if (url.hostname === 'www.googletagmanager.com' && url.pathname === '/gtag/js') {
        tagRequests.push(url.pathname);
        resolveTagRequest();
        // The real Google script is never downloaded. Inspect the app's command queue.
        return route.fulfill({ contentType: 'text/javascript', body: '/* isolated tag fixture */' });
      }
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length && REG);
    await page.evaluate(() => selectCard('dm01-100'));
    await page.locator('button[onclick="addToDeck(\'dm01-100\')"]').press('Enter');
    const afterAdd = await page.evaluate(() => ({ detailOpen: !document.getElementById('mobileDetail').classList.contains('hidden'), progress: document.getElementById('detailDeckProgress')?.textContent || '', count: deckTotalCount() }));
    if (process.env.QA_BASELINE === '1') {
      await page.evaluate(() => openDeckPanel());
      results.push({ width, afterAdd, legality: await page.locator('#deckLegality').innerText() });
      await page.screenshot({ path: path.join(artifacts, `baseline-${width}.png`) });
      await context.close();
      continue;
    }
    assert.equal(afterAdd.count, 1);
    assert.match(afterAdd.progress, /このカード：1枚.*デッキ合計：1 \/ 40/);
    assert.equal(await page.locator('button[onclick="addToDeck(\'dm01-100\')"]').evaluate(el => el === document.activeElement), true);
    await page.screenshot({ path: path.join(artifacts, `added-${width}.png`) });
    assert.equal(tagRequests.length, 0, '未同意時はタグ要求なし');
    await page.getByRole('button', { name: 'デッキを見る', exact: true }).press('Enter');
    assert.equal(await page.locator('#mobileDetail').isVisible(), false);
    assert.match(await page.locator('#deckLegality').innerText(), /あと 39 枚で完成/);
    assert.doesNotMatch(await page.locator('#deckLegality').innerText(), /ルール違反/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'deckHeading');
    await page.screenshot({ path: path.join(artifacts, `progress-${width}.png`) });
    // Existing dm_deck entries still restore without registration or conversion.
    await page.reload();
    await page.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length && REG);
    assert.equal(await page.evaluate(() => deckTotalCount()), 1);
    await page.evaluate(() => selectCard('dm01-100'));
    assert.match(await page.locator('#detailDeckProgress').innerText(), /このカード：1枚/);
    await page.evaluate(() => closeDetail());
    const tagRequest = page.waitForRequest(request => {
      const url = new URL(request.url());
      return url.hostname === 'www.googletagmanager.com' && url.pathname === '/gtag/js';
    });
    await page.locator('#ga-consent-accept').click();
    await page.waitForFunction(() => window.__gaLoaded);
    await Promise.all([tagRequest, tagRequestRecorded]);
    assert.equal(tagRequests.length, 1);
    const configCount = () => page.evaluate(() => window.dataLayer.filter(a => a[0] === 'config').length);
    assert.equal(await configCount(), 1);
    await page.evaluate(() => { document.getElementById('textSearch').value = 'クロー'; syncURL(); renderDeckPanel(); renderDeckBadge(); });
    assert.equal(await configCount(), 1, '再描画やURL同期でconfigを増やさない');
    assert.equal(await page.evaluate(() => window.dataLayer.filter(a => a[0] === 'event' && a[1] === 'page_view').length), 0);
    await page.evaluate(() => { clearDeck(); window.dataLayer.length = 0; });
    await page.evaluate(() => { closeDeckPanel(); selectCard('dm01-100'); });
    for (let i = 0; i < 5; i++) await page.locator('button[onclick="addToDeck(\'dm01-100\')"]').press('Enter');
    assert.match(await page.locator('#detailDeckProgress').innerText(), /このカード：4枚.*デッキ合計：4 \/ 40/);
    const counts = await page.evaluate(() => {
      const ids = CARDS.filter(c => c.id !== 'dm01-100').slice(0, 9).map(c => c.id);
      ids.forEach(id => { for (let i=0;i<4;i++) addToDeck(id); });
      addToDeck(CARDS[12].id);
      return { total: deckTotalCount(), additions: dataLayer.filter(a => a[0] === 'event' && a[1] === 'add_to_deck').length, completions: dataLayer.filter(a => a[0] === 'event' && a[1] === 'deck_complete').length };
    });
    assert.deepEqual(counts, { total: 40, additions: 40, completions: 1 });
    const status = await page.evaluate(() => {
      const entry = name => ({ id: 'fixture', name, count: 1 });
      const banned = [entry(REG.banned[0].name)];
      const over = [{ ...entry('通常'), count: 41 }];
      return { banned: deckStatusHTML(1, checkDeckLegality(banned, REG).violations), over: deckStatusHTML(41, checkDeckLegality(over, REG).violations) };
    });
    assert.match(status.banned, /ルール違反/);
    assert.match(status.over, /ルール違反/);
    assert.deepEqual(errors, []);
    assert.equal(externalRequests.some(host => /google-analytics\.com$/.test(host)), false);
    results.push({ width, passed: true, tagRequests: tagRequests.length, configCommands: 1, explicitPageViews: 0, ...counts });
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await fs.writeFile(path.join(artifacts, 'results.json'), JSON.stringify(results, null, 2));
}
console.log(JSON.stringify(results, null, 2));
