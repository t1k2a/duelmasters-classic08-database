// Independent local browser data only; all external requests are blocked.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const artifacts = process.env.QA_ARTIFACT_DIR || fileURLToPath(new URL('../docs/screenshots/deck-safety/', import.meta.url));
await fs.mkdir(artifacts, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/js/analytics-config.js') { res.setHeader('Content-Type', 'text/javascript'); res.end('window.__GA_ID__="";'); return; }
    const filename = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!filename.startsWith(root)) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', mime[path.extname(filename)] || 'application/octet-stream');
    res.end(await fs.readFile(filename));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [1440, 390]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, serviceWorkers: 'block' });
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      await page.waitForFunction(() => CARDS.length > 0 && RECIPES.length > 0);
      const stored = await page.evaluate(() => {
        const value = JSON.stringify([{ id: CARDS[0].id, name: '<img src=x onerror=bad>', count: 2 }]);
        localStorage.setItem('dm_deck', value);
        return value;
      });
      let prompts = 0;
      page.on('dialog', async dialog => { prompts++; await dialog.dismiss(); });
      await page.goto(`${base}/?recipe=rcp-0001`);
      await page.waitForFunction(() => CARDS.length > 0 && RECIPES.length > 0);
      await page.waitForFunction(() => deck.length === 1);
      // Wait beyond the previous retry interval to catch repeated confirmation.
      await page.waitForTimeout(600);
      assert.equal(prompts, 1);
      assert.equal(await page.evaluate(() => localStorage.getItem('dm_deck')), stored);
      await page.evaluate(theme => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        openDeckPanel();
      }, theme);
      assert.equal(await page.locator('#deckCardList [onclick], #deckCardList [onerror]').count(), 0);
      assert.equal(await page.locator('#deckCardList img').count(), 1);
      assert.equal(await page.locator('#deckCardList button').first().textContent(), await page.evaluate(() => CARDS[0].name));
      await page.screenshot({ path: path.join(artifacts, `${width === 390 ? 'mobile' : 'pc'}-${theme}.png`), fullPage: true });
      await page.locator('#deckCardList button').first().click();
      await page.locator('#mobileDetail').waitFor({ state: 'visible' });
      await page.evaluate(() => { closeDetail(); openDeckPanel(); });
      await page.locator('#deckCardList button').last().click();
      assert.equal(await page.evaluate(() => deck[0].count), 1);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS ${width} ${theme}: cancellation, canonical storage, safe DOM, detail and decrement`);
    }
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
