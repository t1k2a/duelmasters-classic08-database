/** Exercise delayed recipe responses locally, without personal storage or analytics. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const artifacts = process.env.QA_ARTIFACT_DIR || path.resolve('qa-recipe-focus');
await fs.mkdir(artifacts, { recursive: true });
const recipes = await fs.readFile(path.join(root, 'data/recipes.json'), 'utf8');
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const filename = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!filename.startsWith(root + path.sep)) return res.writeHead(403).end();
    const content = await fs.readFile(filename);
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' })[path.extname(filename)] || 'application/octet-stream' }).end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const results = [];
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
    for (const scenario of ['add', 'moved', 'switch', 'closed', 'empty', 'failed']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, serviceWorkers: 'block' });
      context.setDefaultTimeout(10000);
      await context.addInitScript(theme => {
        document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.toggle('dark', theme === 'dark'));
      }, theme);
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.abort();
        if (url.pathname === '/data/recipes.json') {
          await gate;
          if (scenario === 'failed') return route.abort();
          return route.fulfill({ contentType: 'application/json', body: scenario === 'empty' ? '[]' : recipes });
        }
        return route.continue();
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(base);
        await page.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length && REG);
        await page.evaluate(() => selectCard('dm01-100'));
        await page.locator('button[onclick="addToDeck(\'dm01-100\')"]').press('Enter');
        if (scenario === 'switch') {
          await page.evaluate(() => selectCard(CARDS.find(c => c.id !== 'dm01-100').id));
          await page.locator('#detailBody button[onclick^="addToDeck"]').press('Enter');
        } else if (scenario === 'moved') {
          await page.getByRole('button', { name: 'デッキを見る', exact: true }).focus();
        } else if (scenario === 'closed') {
          await page.getByRole('button', { name: 'デッキを見る', exact: true }).press('Enter');
        }
        const before = await page.evaluate(() => {
          window.focusBeforeRecipe = document.activeElement;
          return { saved: localStorage.getItem('dm_deck'), selected: selectedCard, total: deckTotalCount(), progress: document.getElementById('detailDeckProgress').textContent };
        });
        release();
        await page.waitForLoadState('networkidle');
        const after = await page.evaluate(() => ({
          sameFocus: document.activeElement === window.focusBeforeRecipe,
          saved: localStorage.getItem('dm_deck'), selected: selectedCard, total: deckTotalCount(),
          progress: document.getElementById('detailDeckProgress').textContent,
          recipeCount: RECIPES.length, expectedHits: recipesUsingCard(selectedCard).length,
          recipeButton: document.querySelector('#detailBody button[onclick^="showRecipes"]')?.outerHTML || '',
          detailClosed: document.getElementById('mobileDetail').classList.contains('hidden'),
        }));
        assert.equal(after.sameFocus, true, `${width}/${theme}/${scenario}: delayed recipes must preserve the current focused node`);
        for (const key of ['saved', 'selected', 'total', 'progress']) assert.equal(after[key], before[key], key);
        if (scenario === 'closed') assert.equal(after.detailClosed, true);
        else if (scenario === 'empty' || scenario === 'failed') {
          assert.equal(after.recipeCount, 0);
          assert.equal(after.recipeButton, '');
        } else {
          assert.ok(after.recipeCount > 0);
          assert.ok(after.recipeButton.includes(`showRecipes('${before.selected}')`));
          if (after.expectedHits) assert.ok(after.recipeButton.includes(`（${after.expectedHits}件）`));
          if (scenario === 'add') await page.screenshot({ path: path.join(artifacts, `${width}-${theme}.png`) });
          await page.locator('#detailBody button[onclick^="showRecipes"]').click();
          assert.ok(await page.locator('#detailBody').innerText());
        }
        assert.deepEqual(errors, []);
        results.push({ width, theme, scenario, passed: true });
      } finally {
        release();
        await context.close();
      }
    }
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await fs.writeFile(path.join(artifacts, 'results.json'), JSON.stringify(results, null, 2));
}
console.log(JSON.stringify(results, null, 2));
