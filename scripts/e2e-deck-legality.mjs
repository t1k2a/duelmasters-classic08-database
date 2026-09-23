/**
 * デッキの禁止コンビ警告を確認するE2E。
 * 実行: PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers node scripts/e2e-deck-legality.mjs
 */

import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let requestPath;
  try { requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  const filePath = path.resolve(ROOT, `.${requestPath === '/' ? '/index.html' : requestPath}`);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(filePath, (error, data) => {
    if (error) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.route('**/wp-content/card/cardimage/**', route => route.abort());
  await page.goto(baseUrl);
  await page.waitForFunction(() => window.isRestrictionsReady?.(), undefined, { timeout: 8000 });
  await page.waitForFunction(() => CARDS.length > 0, undefined, { timeout: 8000 });
  await page.evaluate(() => {
    addToDeck('dm10-036'); // 母なる大地
    addToDeck('dm25-s04'); // 龍仙ロマネスク
  });
  await page.locator('#deckFab').click();
  const legalityText = (await page.locator('#deckLegality').textContent()).trim();
  const pass = /母なる大地/.test(legalityText)
    && /龍仙ロマネスク/.test(legalityText)
    && /同時に投入|同時投入/.test(legalityText);
  console.log(`${pass ? 'PASS' : 'FAIL'} 禁止コンビ同時投入でデッキパネルに違反警告`);
  if (!pass) {
    console.error(`legalityText="${legalityText.slice(0, 200)}"`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server.close();
}
