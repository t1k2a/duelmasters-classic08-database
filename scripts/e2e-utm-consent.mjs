/** Isolated consent QA. Google requests are fulfilled locally, never sent. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve('public');
const artifacts = process.env.QA_ARTIFACT_DIR || 'docs/qa/utm-consent';
await fs.mkdir(artifacts, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const filename = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' }).end(await fs.readFile(filename));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const [name, width, theme] of [['pc-light', 1440, 'light'], ['mobile-dark', 390, 'dark']]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, serviceWorkers: 'block' });
    const tagLoads = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/js/analytics-config.js' && url.origin === base) return route.fulfill({ contentType: 'text/javascript', body: 'window.__GA_ID__="G-QATEST123";' });
      if (url.hostname === 'www.googletagmanager.com') {
        tagLoads.push(route.request().frame().url());
        return route.fulfill({ contentType: 'text/javascript', body: '/* isolated QA tag */' });
      }
      return url.origin === base ? route.continue() : route.abort();
    });
    await context.addInitScript(theme => document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.toggle('dark', theme === 'dark')), theme);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const query = '?utm_source=x&utm_medium=social&utm_campaign=qa&utm_content=post-001&civs=火#qa';
    await page.goto(base + '/index.html' + query);
    await page.locator('#ga-consent-accept').waitFor();
    await page.locator('#textSearch').fill('ドラゴン');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === 'ドラゴン');
    await page.locator('mark').first().waitFor();
    assert.equal(tagLoads.length, 0);
    assert.equal(new URL(page.url()).searchParams.get('utm_content'), 'post-001');
    assert.equal(new URL(page.url()).hash, '#qa');
    await page.screenshot({ path: path.join(artifacts, `${name}-before-consent.png`), fullPage: false });
    await page.locator('#ga-consent-accept').click();
    await page.waitForFunction(() => typeof window.gtag === 'function');
    await page.waitForFunction(() => document.querySelector('script[src*="googletagmanager"]'));
    // Wait for the intercepted request rather than an arbitrary rendering delay.
    await page.waitForLoadState('networkidle');
    assert.equal(tagLoads.length, 1);
    assert.equal(new URL(tagLoads[0]).searchParams.get('utm_content'), 'post-001');
    await page.reload();
    await page.waitForLoadState('networkidle');
    assert.equal(tagLoads.length, 2);
    assert.equal(await page.locator('#textSearch').inputValue(), 'ドラゴン');
    await page.evaluate(() => localStorage.setItem('ga-consent', 'denied'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    assert.equal(tagLoads.length, 2);
    assert.equal(await page.evaluate(() => typeof window.gtag), 'undefined');
    await page.evaluate(() => localStorage.removeItem('ga-consent'));
    await page.reload();
    await page.locator('#ga-consent-reject').click();
    await page.locator('#textSearch').fill('青銅');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === '青銅');
    assert.equal(tagLoads.length, 2);
    assert.equal(await page.evaluate(() => localStorage.getItem('ga-consent')), 'denied');
    console.log(`PASS ${name}: tagged landing, filter sync, accept, restored consent, denied revisit, reject`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
