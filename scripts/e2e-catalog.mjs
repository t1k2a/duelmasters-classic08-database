/** Offline catalog QA: PC/mobile × light/dark. No external navigation or analytics. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const artifacts = process.env.QA_ARTIFACT_DIR || '/tmp/catalog-qa';
await fs.mkdir(artifacts, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/js/analytics-config.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' }).end('window.__GA_ID__="";');
      return;
    }
    const filename = path.resolve(root, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const data = await fs.readFile(filename);
    res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' }).end(data);
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' ? 404 : 400).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const results = [];
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    for (const theme of ['light', 'dark']) {
      const name = `${viewport.width > 500 ? 'pc' : 'mobile'}-${theme}`;
      const context = await browser.newContext({ viewport, colorScheme: theme, serviceWorkers: 'block' });
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await context.addInitScript(({ theme }) => {
        window.__qaOpened = [];
        window.__qaCopied = [];
        window.open = (url, target, features) => { window.__qaOpened.push({ url, target, features }); return null; };
        window.confirm = () => true;
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => window.__qaCopied.push(text) } });
        document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.toggle('dark', theme === 'dark'));
      }, { theme });
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      async function check(label, action) {
        try { await action(); results.push({ name, label, pass: true }); console.log(`PASS ${name}: ${label}`); }
        catch (error) { results.push({ name, label, pass: false, error: error.message }); console.error(`FAIL ${name}: ${label}: ${error.message}`); }
      }
      const ready = async () => page.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length > 0 && /件中/.test(document.getElementById('resultCount')?.textContent || ''));
      try {
        await page.goto(base + '/index.html');
        await ready();
        await check('search remains visible when advanced filters collapse', async () => {
          assert.ok(await page.locator('#textSearch').isVisible());
          for (let i = 0; i < 2; i++) {
            await page.locator('#filterPanelToggle').click();
            assert.ok(await page.locator('#textSearch').isVisible());
          }
        });
        await check('zero results offers a working clear action', async () => {
          await page.locator('#textSearch').fill('QA_NO_CARD_不存在_987654321');
          await page.locator('#searchEmptyState').waitFor({ state: 'visible' });
          await page.screenshot({ path: path.join(artifacts, `${name}-empty.png`), fullPage: true });
          await page.locator('#searchEmptyState button').click();
          await page.waitForFunction(() => document.getElementById('textSearch').value === '' && document.querySelectorAll('#cardList .card-row, #cardList .card-cell').length > 0);
        });
        await check('search reset control clears input', async () => {
          await page.locator('#textSearch').fill('ドラゴン');
          await page.locator('#resetSearchBtn').click();
          assert.equal(await page.locator('#textSearch').inputValue(), '');
        });
        await check('grid cells stay readable without horizontal overflow', async () => {
          await page.locator('#viewGridBtn').click();
          await page.locator('#cardList .card-cell').first().waitFor();
          const widths = await page.locator('#cardList .card-cell').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().width));
          assert.ok(widths.length > 0 && Math.min(...widths) >= 140, `minimum cell width ${Math.min(...widths)}`);
          const overflow = await page.evaluate(() => ({ body: document.body.scrollWidth, root: document.documentElement.scrollWidth, viewport: innerWidth, list: document.getElementById('cardList').scrollWidth, listWidth: document.getElementById('cardList').clientWidth }));
          assert.ok(overflow.body <= overflow.viewport + 1 && overflow.root <= overflow.viewport + 1 && overflow.list <= overflow.listWidth + 1, JSON.stringify(overflow));
          await page.screenshot({ path: path.join(artifacts, `${name}-grid.png`), fullPage: true });
        });
        await check('list and grid cards open with Enter and Space', async () => {
          for (const [toggle, selector] of [['#viewListBtn', '.card-row'], ['#viewGridBtn', '.card-cell']]) {
            await page.locator(toggle).click();
            for (const key of ['Enter', 'Space']) {
              const card = page.locator(`#cardList ${selector}`).first();
              assert.equal(await card.getAttribute('role'), 'button');
              assert.equal(await card.getAttribute('tabindex'), '0');
              const expectedName = (await card.getAttribute('aria-label')).replace(/の詳細を見る$/, '');
              assert.ok(expectedName.length > 0);
              await card.focus();
              await page.keyboard.press(key);
              await page.locator('#mobileDetail').waitFor({ state: 'visible' });
              assert.ok((await page.locator('#detailName').textContent()).includes(expectedName));
              await page.locator('#mobileDetail button[onclick="closeDetail()"]').click();
              await page.locator('#mobileDetail').waitFor({ state: 'hidden' });
            }
          }
        });
        await check('form controls have accessible labels', async () => {
          const missing = await page.locator('input:not([type=hidden]), select, textarea').evaluateAll(elements => elements.filter(el => !(el.labels?.length || el.getAttribute('aria-label')?.trim() || el.getAttribute('aria-labelledby')?.split(/\s+/).some(id => document.getElementById(id)?.textContent.trim()))).map(el => el.id || el.outerHTML));
          assert.deepEqual(missing, []);
        });
        await check('DM DMC PROMO deck URL restores and opens panel', async () => {
          const fixture = await page.evaluate(() => {
            const ids = [/^dm\d+-/, /^dmc\d+-/, /^promo/i].map(pattern => CARDS.find(card => pattern.test(card.id))?.id);
            return { ids, url: ids.every(Boolean) ? `${location.origin}/index.html?d=${encodeDeck(ids.map(id => ({ id, count: 2 })))}` : null };
          });
          assert.ok(fixture.url, `missing fixture family: ${JSON.stringify(fixture.ids)}`);
          await page.goto(fixture.url);
          await ready();
          await page.locator('#deckPanel').waitFor({ state: 'visible' });
          const actual = await page.evaluate(() => deck.map(({ id, count }) => ({ id, count })));
          assert.deepEqual(actual, fixture.ids.map(id => ({ id, count: 2 })));
          await page.screenshot({ path: path.join(artifacts, `${name}-deck.png`), fullPage: true });
        });
        await check('both purchase buttons create safe search URLs', async () => {
          await page.locator('#deckPanel').getByRole('button', { name: 'メルカリで探す', exact: true }).click();
          await page.locator('#deckPanel').getByRole('button', { name: '駿河屋で探す', exact: true }).click();
          const opened = await page.evaluate(() => window.__qaOpened);
          assert.equal(opened.length, 2);
          for (const [index, host, key] of [[0, 'jp.mercari.com', 'keyword'], [1, 'www.surugaya.jp', 'search_word']]) {
            const url = new URL(opened[index].url);
            assert.equal(url.protocol, 'https:'); assert.equal(url.hostname, host);
            assert.ok(url.searchParams.get(key)?.includes('デュエルマスターズ'));
            assert.match(opened[index].features, /noopener/);
          }
        });
        await check('no JavaScript runtime errors', async () => assert.deepEqual(errors, []));
      } catch (error) {
        results.push({ name, label: 'scenario setup', pass: false, error: error.message });
      } finally {
        await page.screenshot({ path: path.join(artifacts, `${name}-final.png`), fullPage: true }).catch(() => {});
        await context.close();
      }
    }
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
await fs.writeFile(path.join(artifacts, 'results.json'), JSON.stringify(results, null, 2));
console.log(`${results.filter(result => result.pass).length}/${results.length} passed; artifacts: ${artifacts}`);
if (results.some(result => !result.pass)) process.exitCode = 1;
