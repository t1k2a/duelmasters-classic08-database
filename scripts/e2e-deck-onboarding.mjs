/** Isolated onboarding regression: no real third-party requests or personal profiles. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../public/', import.meta.url));
const artifacts = process.env.QA_ARTIFACT_DIR || '/tmp/deck-onboarding-qa';
await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const results = [];
async function setup(width = 390, theme = 'light', consent = null) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, serviceWorkers: 'block' });
  context.setDefaultTimeout(10000);
  if (consent) await context.addInitScript(value => localStorage.setItem('ga-consent', value), consent);
  const tags = [], blocked = [], errors = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['analytics.test', 'localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      if (url.hostname === 'www.googletagmanager.com' && url.pathname === '/gtag/js') {
        tags.push(url.href);
        return route.fulfill({ contentType: 'text/javascript', body: '/* isolated gtag fixture */' });
      }
      blocked.push(url.href);
      return route.abort();
    }
    if (url.pathname === '/js/analytics-config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.__GA_ID__="G-QATEST123";' });
    const filename = path.resolve(root, '.' + (url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname));
    if (!filename.startsWith(root)) return route.fulfill({ status: 403, body: '' });
    try {
      return route.fulfill({ body: await fs.readFile(filename), contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' })[path.extname(filename)] || 'application/octet-stream' });
    } catch { return route.fulfill({ status: 404, body: '' }); }
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  async function ready(url = 'http://analytics.test/') {
    await page.goto(url);
    await page.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length && RECIPES.length && REG);
    await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme);
  }
  return { context, page, tags, blocked, errors, ready };
}
const countCopies = page => page.evaluate(() => (window.dataLayer || []).filter(a => a[0] === 'event' && a[1] === 'copy_deck').map(a => a[2]));
try {
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
    const { context, page, tags, errors, ready } = await setup(width, theme, 'granted');
    await ready();
    await page.evaluate(() => openDeckPanel());
    assert.equal(await page.locator('#deckRelatedGuide').isVisible(), false);
    await page.screenshot({ path: path.join(artifacts, 'empty-' + width + '-' + theme + '.png') });
    await page.getByRole('link', { name: 'サンプルデッキを見て試す', exact: true }).click();
    await page.waitForURL('**/deck-guide/beginner-low-rarity-deck/');
    // Leaving the builder must not create or overwrite a deck.
    assert.equal(await page.evaluate(() => localStorage.getItem('dm_deck')), null);
    await page.goBack();
    await page.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length && REG);
    assert.equal(await page.evaluate(() => deckTotalCount()), 0);
    await page.evaluate(() => openDeckPanel());
    await page.getByRole('link', { name: 'サンプルデッキを見て試す', exact: true }).click();
    await page.getByRole('link', { name: 'このデッキをコピーして編集', exact: true }).click();
    await page.waitForFunction(() => typeof deckTotalCount === 'function' && deckTotalCount() === 40);
    await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme);
    const urlFocus = await page.evaluate(() => document.activeElement.id);
    assert.equal(urlFocus, 'deckHeading');
    assert.equal(await page.locator('#deckRelatedGuide').isVisible(), true);
    assert.deepEqual(await countCopies(page), [{ content_id: 'rcp-0114', card_count: 40, entry_point: 'recipe_url' }]);
    page.on('dialog', dialog => dialog.accept());
    await page.evaluate(() => { renderDeckPanel(); renderDeckBadge(); restoreRecipeFromURL('rcp-0114'); });
    assert.equal((await countCopies(page)).length, 1, 'URL import deduplicates repeat calls');
    await page.screenshot({ path: path.join(artifacts, 'copied-' + width + '-' + theme + '.png') });
    await page.evaluate(() => { closeDeckPanel(); showRecipes(RECIPES.find(r => r.id === 'rcp-0114').cards[0].id); });
    await page.getByRole('button', { name: 'このデッキをコピーして編集', exact: true }).first().waitFor();
    await page.screenshot({ path: path.join(artifacts, 'recipe-list-' + width + '-' + theme + '.png') });
    // Explicit list copy remains one event per successful user operation.
    await page.getByRole('button', { name: 'このデッキをコピーして編集', exact: true }).first().click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'deckHeading');
    assert.equal((await countCopies(page)).length, 2);
    assert.equal((await countCopies(page))[1].entry_point, 'recipe_list');
    await page.evaluate(() => { renderDeckPanel(); renderDeckBadge(); });
    assert.equal((await countCopies(page)).length, 2);
    const state = await page.evaluate(() => ({ deck: JSON.stringify(deck), stored: localStorage.getItem('dm_deck'), title: document.title, recipe: restoredRecipeId }));
    page.removeAllListeners('dialog');
    page.on('dialog', dialog => dialog.dismiss());
    await page.evaluate(() => loadRecipe('rcp-0001'));
    await page.evaluate(() => { RECIPES.push({ id: 'invalid-fixture', cards: [{ id: 'missing-card', count: 4 }] }); loadRecipe('invalid-fixture'); });
    page.removeAllListeners('dialog');
    page.on('dialog', dialog => dialog.accept());
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (key === 'dm_deck') throw new Error('QA quota failure'); return original.call(this, key, value); };
      try { loadRecipe('rcp-0001'); } finally { Storage.prototype.setItem = original; }
    });
    assert.deepEqual(await page.evaluate(() => ({ deck: JSON.stringify(deck), stored: localStorage.getItem('dm_deck'), title: document.title, recipe: restoredRecipeId })), state);
    assert.equal((await countCopies(page)).length, 2, 'cancel/invalid/storage failure emit nothing');
    assert.deepEqual(errors, []);
    results.push({ width, theme, passed: true, urlFocus, copies: 2, tagFixtureRequests: tags.length });
    await context.close();
  }
  for (const consent of [null, 'denied']) {
    const { context, page, tags, ready } = await setup(390, 'light', consent);
    await ready();
    await page.evaluate(() => loadRecipe('rcp-0114'));
    assert.equal(await page.evaluate(() => deckTotalCount()), 40);
    assert.deepEqual(await countCopies(page), []);
    assert.equal(tags.length, 0);
    results.push({ consent, suppressed: true });
    await context.close();
  }
  for (const origin of ['http://localhost', 'http://127.0.0.1', 'http://[::1]']) {
    const { context, page, tags, ready } = await setup(390, 'light', 'granted');
    await ready(origin + '/?analytics=on');
    await page.evaluate(() => loadRecipe('rcp-0114'));
    assert.deepEqual(await countCopies(page), []);
    assert.equal(tags.length, 0);
    results.push({ origin, suppressed: true });
    await context.close();
  }
  {
    const { context, page, tags, ready } = await setup(390, 'light', 'granted');
    await ready('http://analytics.test/?analytics=off');
    await page.evaluate(() => openDeckPanel());
    await page.getByRole('link', { name: 'サンプルデッキを見て試す', exact: true }).click();
    await page.getByRole('link', { name: 'このデッキをコピーして編集', exact: true }).click();
    await page.waitForFunction(() => typeof deckTotalCount === 'function' && deckTotalCount() === 40);
    assert.equal(tags.length, 0);
    assert.deepEqual(await countCopies(page), []);
    await ready('http://analytics.test/?analytics=on');
    await page.waitForFunction(() => window.__gaLoaded);
    assert.equal(tags.length, 1);
    results.push({ sessionOptOut: true, explicitOptIn: true });
    await context.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(artifacts, 'results.json'), JSON.stringify(results, null, 2));
}
console.log(JSON.stringify(results, null, 2));
