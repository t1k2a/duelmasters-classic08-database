/**
 * E2E テスト — 27 ケース
 *
 * 実行: node scripts/e2e.mjs
 * 自己完結: 内蔵 HTTP サーバーで public/ を配信 → テスト実行 → サーバー停止
 * exit code: 全件 PASS=0 / 1 件以上 FAIL=1
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'public');

// ---- 内蔵 HTTP サーバー起動 ----
const MIME = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.css': 'text/css',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  // analytics-config.js はGA_MEASUREMENT_IDからビルド時に作られる任意ファイル。
  // E2Eで未設定時の本番動作（何も送らない）を再現する。
  if (urlPath === '/js/analytics-config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end('window.__GA_ID__ = "";');
    return;
  }
  let fp = path.join(ROOT, urlPath);
  if (urlPath.endsWith('/')) fp = path.join(fp, 'index.html');
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
console.log(`[e2e] server started at ${BASE}`);

// ---- 結果記録 ----
const results = [];

/**
 * @param {number} id
 * @param {string} name
 * @param {boolean} pass
 * @param {string} [detail]
 */
function rec(id, name, pass, detail = '') {
  results.push({ id, name, pass, detail });
  const prefix = pass ? 'PASS' : 'FAIL';
  const suffix = detail ? ` :: ${detail}` : '';
  console.log(`  ${prefix}  #${String(id).padStart(2, '0')} ${name}${suffix}`);
}

// ---- ブラウザ起動 ----
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.route('https://api.dm-classic08.org/api/health', route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ status: 'ok', up: true, model: 'e2e-stub', depth: 0 }),
}));

const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
page.on('response', response => {
  if (response.status() === 404) errors.push('404: ' + response.url());
});

// ---- ヘルパー ----
async function clearStorage() {
  await page.goto(BASE + '/index.html');
  await page.evaluate(() => localStorage.clear());
}

async function gotoIndex(query = '') {
  await page.goto(BASE + '/index.html' + query);
  await page.waitForFunction(() => {
    const el = document.getElementById('resultCount');
    return el && /件中/.test(el.textContent);
  }, { timeout: 15000 });
  await page.waitForTimeout(400);
}

async function ensureFilterExpanded(targetPage) {
  const body = targetPage.locator('#filterPanelBody');
  if (await body.evaluate(element => element.classList.contains('hidden'))) {
    await targetPage.locator('#filterPanelToggle').click();
  }
  await body.waitFor({ state: 'visible' });
}

async function newGrowthPage() {
  const growthCtx = await browser.newContext();
  await growthCtx.addInitScript(() => {
    window.__growthEvents = [];
    window.__copiedSearchURL = '';
    const spy = (eventName, params) => window.__growthEvents.push([eventName, params || {}]);
    Object.defineProperty(window, 'trackEvent', {
      configurable: true,
      get: () => spy,
      set: value => { window.__analyticsTrackEvent = value; },
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__copiedSearchURL = value; } },
    });
  });
  const growthPage = await growthCtx.newPage();
  return { growthCtx, growthPage };
}

// ===========================================================================
// テストケース
// ===========================================================================

// ---- #1 テキストハイライト基本（リスト + 詳細でmarkタグ） ----
try {
  await clearStorage();
  await gotoIndex('?q=' + encodeURIComponent('ボルメテウス'));
  const listMarks = await page.locator('#cardList mark').count();
  await page.locator('#cardList .card-row, #cardList .card-cell').first().click();
  await page.waitForTimeout(200);
  const nameMarks = await page.locator('#detailName mark').count();
  const bodyMarks = await page.locator('#detailBody mark').count();
  rec(1, 'テキストハイライト基本', listMarks > 0 && (nameMarks + bodyMarks) > 0,
    `listMarks=${listMarks}, detailNameMarks=${nameMarks}, detailBodyMarks=${bodyMarks}`);
  await page.locator('#mobileDetail').evaluate(el => el.classList.add('hidden'));
} catch (e) { rec(1, 'テキストハイライト基本', false, 'EXC: ' + e.message); }

// ---- #2 正規表現メタ文字（「・」記号）でクラッシュしない ----
try {
  errors.length = 0;
  await gotoIndex('?q=' + encodeURIComponent('・'));
  const cnt1 = await page.locator('#resultCount').textContent();
  await ensureFilterExpanded(page);
  await page.fill('#textSearch', 'W・ブレイカー(');
  await page.waitForTimeout(400);
  await page.fill('#textSearch', '[a-z]+*?(){}');
  await page.waitForTimeout(400);
  const stillAlive = await page.evaluate(() => CARDS.length > 0);
  rec(2, '正規表現メタ文字でクラッシュしない', errors.length === 0 && stillAlive,
    `errors=${errors.length}${errors.length ? ' (' + errors[0] + ')' : ''}, resultCountForDot="${cnt1}"`);
} catch (e) { rec(2, '正規表現メタ文字でクラッシュしない', false, 'EXC: ' + e.message); }

// ---- #3 検索クリアでハイライト解除 ----
try {
  await gotoIndex('?q=' + encodeURIComponent('ドラゴン'));
  const before = await page.locator('#cardList mark').count();
  await ensureFilterExpanded(page);
  await page.fill('#textSearch', '');
  await page.waitForTimeout(400);
  const after = await page.locator('#cardList mark').count();
  const searchValue = await page.locator('#textSearch').inputValue();
  rec(3, '検索クリアでハイライト解除', before > 0 && after === 0, `before=${before}, after=${after}, value="${searchValue}"`);
} catch (e) { rec(3, '検索クリアでハイライト解除', false, 'EXC: ' + e.message); }

// ---- #4 今日の1枚バナー表示 ----
try {
  await clearStorage();
  await gotoIndex();
  const visible = await page.locator('#todayPick').isVisible();
  const bodyText = (await page.locator('#todayPickBody').textContent()).trim();
  rec(4, '今日の1枚バナー表示', visible && bodyText.length > 0, `visible=${visible}, name="${bodyText}"`);
} catch (e) { rec(4, '今日の1枚バナー表示', false, 'EXC: ' + e.message); }

// ---- #5 日付シード決定性（同日固定/別日で変化） ----
try {
  const seedInfo = await page.evaluate(() => {
    const seed = todaySeed();
    const idx = seed % CARDS.length;
    return { seed, idx, name: CARDS[idx].name };
  });
  const second = await page.evaluate(() => CARDS[todaySeed() % CARDS.length].name);
  const tomorrow = await page.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    const s = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    return { name: CARDS[s % CARDS.length].name, diffIdx: (s % CARDS.length) !== (todaySeed() % CARDS.length) };
  });
  rec(5, '日付シード決定性', seedInfo.name === second && tomorrow.diffIdx,
    `today="${seedInfo.name}", tomorrow="${tomorrow.name}", tomorrowDiffersIdx=${tomorrow.diffIdx}`);
} catch (e) { rec(5, '日付シード決定性', false, 'EXC: ' + e.message); }

// ---- #6 折りたたみ/×非表示の localStorage 永続化 ----
try {
  await clearStorage();
  await gotoIndex();
  await page.locator('#todayPickToggle').click();
  await page.waitForTimeout(100);
  const collapseKey = await page.evaluate(() => localStorage.getItem('dm_today_collapsed'));
  const bodyHidden = await page.locator('#todayPickBody').evaluate(el => el.classList.contains('hidden'));
  await page.locator('button[title="非表示"]').click();
  await page.waitForTimeout(100);
  const hideKey = await page.evaluate(() => localStorage.getItem('dm_today_hidden'));
  await gotoIndex();
  const stillHidden = !(await page.locator('#todayPick').isVisible());
  rec(6, '折りたたみ/×非表示のlocalStorage永続化', collapseKey === '1' && bodyHidden && hideKey === '1' && stillHidden,
    `collapsed=${collapseKey}, bodyHidden=${bodyHidden}, hidden=${hideKey}, persistAfterReload=${stillHidden}`);
} catch (e) { rec(6, '折りたたみ/×非表示のlocalStorage永続化', false, 'EXC: ' + e.message); }

// ---- #7 グリッド/リスト切替・viewMode 永続化 ----
try {
  await clearStorage();
  await gotoIndex();
  const listClass0 = await page.locator('#cardList').getAttribute('class');
  await page.locator('#viewGridBtn').click();
  await page.waitForTimeout(200);
  const gridClass = await page.locator('#cardList').getAttribute('class');
  const cellCount = await page.locator('#cardList .card-cell').count();
  const vmKey = await page.evaluate(() => localStorage.getItem('dm_view_mode'));
  await gotoIndex();
  const gridAfterReload = (await page.locator('#cardList').getAttribute('class')).includes('grid-cols-2');
  rec(7, 'グリッド/リスト切替・viewMode永続化',
    listClass0.includes('divide-y') && gridClass.includes('grid-cols-2') && cellCount > 0 && vmKey === 'grid' && gridAfterReload,
    `list0grid=${listClass0.includes('grid-cols-2')}, gridAfter=${gridClass.includes('grid-cols-2')}, cells=${cellCount}, vm=${vmKey}, reloadGrid=${gridAfterReload}`);
} catch (e) { rec(7, 'グリッド/リスト切替・viewMode永続化', false, 'EXC: ' + e.message); }

// ---- #8 showMore が選択中モードで追加描画 ----
try {
  await clearStorage();
  await gotoIndex();
  await page.locator('#viewGridBtn').click();
  await page.waitForTimeout(200);
  const before = await page.locator('#cardList .card-cell').count();
  const showMoreVisible = await page.locator('#showMoreWrap').isVisible();
  let afterCells = before, addedAsGrid = true;
  if (showMoreVisible) {
    await page.locator('#showMoreWrap button').click();
    await page.waitForTimeout(200);
    afterCells = await page.locator('#cardList .card-cell').count();
    const rowsAfter = await page.locator('#cardList .card-row').count();
    addedAsGrid = rowsAfter === 0;
  }
  rec(8, 'showMoreが選択中モードで追加描画',
    showMoreVisible && afterCells > before && addedAsGrid,
    `before=${before}, after=${afterCells}, showMoreVisible=${showMoreVisible}, addedAsGrid=${addedAsGrid}`);
} catch (e) { rec(8, 'showMoreが選択中モードで追加描画', false, 'EXC: ' + e.message); }

// ---- #9 関連カード 同種族最大6件 ----
try {
  await clearStorage();
  await gotoIndex();
  const targetId = await page.evaluate(() => {
    const c = CARDS.find(x => x.races && x.races.length);
    return c.id;
  });
  await page.evaluate((id) => selectCard(id), targetId);
  await page.waitForTimeout(200);
  const relatedSection = await page.locator('#detailBody').getByText('関連カード').count();
  const relatedCells = await page.locator('#detailBody .grid.grid-cols-3 > div').count();
  rec(9, '関連カード 同種族最大6件', relatedSection > 0 && relatedCells > 0 && relatedCells <= 6,
    `section=${relatedSection}, cells=${relatedCells} (<=6)`);
} catch (e) { rec(9, '関連カード 同種族最大6件', false, 'EXC: ' + e.message); }

// ---- #10 関連カードクリック遷移・「←デッキ」非表示 ----
try {
  const beforeName = await page.locator('#detailName').textContent();
  const backHiddenBefore = await page.locator('#backToDeckBtn').evaluate(el => el.classList.contains('hidden'));
  await page.locator('#detailBody .grid.grid-cols-3 > div').first().click();
  await page.waitForTimeout(200);
  const afterName = await page.locator('#detailName').textContent();
  const backHiddenAfter = await page.locator('#backToDeckBtn').evaluate(el => el.classList.contains('hidden'));
  rec(10, '関連カードクリック遷移・「←デッキ」非表示',
    beforeName !== afterName && backHiddenBefore && backHiddenAfter,
    `before="${beforeName.trim()}", after="${afterName.trim()}", backBtnHidden=${backHiddenAfter}`);
  await page.locator('#mobileDetail').evaluate(el => el.classList.add('hidden'));
} catch (e) { rec(10, '関連カードクリック遷移・「←デッキ」非表示', false, 'EXC: ' + e.message); }

// ---- #11 ブロッカーフィルターがカードデータと一致 ----
try {
  await clearStorage();
  await gotoIndex();
  await ensureFilterExpanded(page);
  await page.selectOption('#abilityFilter', 'ブロッカー');
  await page.waitForTimeout(400);
  const { actual, expected } = await page.evaluate(() => ({
    actual: filterCards().length,
    expected: CARDS.filter(card => (card.text || '').includes('ブロッカー')).length,
  }));
  rec(11, 'ブロッカーフィルターがカードデータと一致', actual === expected, `filtered=${actual}, expected=${expected}`);
} catch (e) { rec(11, 'ブロッカーフィルターがカードデータと一致', false, 'EXC: ' + e.message); }

// ---- #12 W・ブレイカーフィルターがカードデータと一致 ----
try {
  await page.selectOption('#abilityFilter', 'W・ブレイカー');
  await page.waitForTimeout(400);
  const { actual, expected } = await page.evaluate(() => ({
    actual: filterCards().length,
    expected: CARDS.filter(card => (card.text || '').includes('W・ブレイカー')).length,
  }));
  rec(12, 'W・ブレイカーフィルターがカードデータと一致', actual === expected, `filtered=${actual}, expected=${expected}`);
} catch (e) { rec(12, 'W・ブレイカーフィルターがカードデータと一致', false, 'EXC: ' + e.message); }

// ---- #13 abilityフィルターURL同期(?ability=)復元 ----
try {
  await gotoIndex('?ability=' + encodeURIComponent('ブロッカー'));
  const selVal = await page.locator('#abilityFilter').inputValue();
  const { actual, expected } = await page.evaluate(() => ({
    actual: filterCards().length,
    expected: CARDS.filter(card => (card.text || '').includes('ブロッカー')).length,
  }));
  rec(13, 'abilityフィルターURL同期(?ability=)復元', selVal === 'ブロッカー' && actual === expected,
    `selectValue="${selVal}", filtered=${actual}, expected=${expected}`);
} catch (e) { rec(13, 'abilityフィルターURL同期(?ability=)復元', false, 'EXC: ' + e.message); }

// ---- #14 クラシック08制限バッジ（制限/お助け） ----
try {
  await clearStorage();
  await gotoIndex('?q=' + encodeURIComponent('サイバー・ブレイン'));
  const listHtml = await page.locator('#cardList').innerHTML();
  const hasMedal = listHtml.includes('🏅');
  await page.locator('#cardList .card-row, #cardList .card-cell').first().click();
  await page.waitForTimeout(200);
  const detailHtml = await page.locator('#detailName').innerHTML();
  const detailMedal = detailHtml.includes('🏅');
  await page.locator('#mobileDetail').evaluate(el => el.classList.add('hidden'));
  await gotoIndex('?q=' + encodeURIComponent('スケルトン・バイス'));
  const banHtml = await page.locator('#cardList').innerHTML();
  const hasHelper = banHtml.includes('🎴');
  rec(14, 'クラシック08制限バッジ（制限/お助け）', hasMedal && detailMedal && hasHelper,
    `listMedal=${hasMedal}, detailMedal=${detailMedal}, helperBadge=${hasHelper}`);
} catch (e) { rec(14, 'クラシック08制限バッジ（制限/お助け）', false, 'EXC: ' + e.message); }

// ---- #15 制限データでid未解決のカードはプール外 ----
try {
  await page.waitForFunction(() => window.isRestrictionsReady && window.isRestrictionsReady(), { timeout: 8000 });
  const r = await page.evaluate(() => {
    const unresolved = [...REG.banned, ...REG.restricted, ...REG.helper].filter(entry => !entry.id);
    return unresolved.map(entry => ({ name: entry.name, inCards: CARDS.some(card => card.name === entry.name), status: RESTRICTION_MAP.get(entry.name) }));
  });
  const allAbsent = r.length > 0 && r.every(entry => !entry.inCards && !!entry.status);
  rec(15, '制限データでid未解決のカードはプール外', allAbsent, JSON.stringify(r));
} catch (e) { rec(15, '制限データでid未解決のカードはプール外', false, 'EXC: ' + e.message); }

// ---- #16 メタデッキデータを全件表示 ----
try {
  errors.length = 0;
  await page.goto(BASE + '/meta.html');
  await page.waitForTimeout(600);
  const deckCards = await page.locator('#deckList > div').count();
  const names = await page.locator('#deckList h2').count();
  const cardLinks = await page.locator('#deckList a[href^="index.html?q="]').count();
  const expected = await page.evaluate(async () => (await fetch('data/meta-decks.json').then(response => response.json())).length);
  rec(16, 'メタデッキデータを全件表示', deckCards === expected && names === expected && cardLinks > 0,
    `deckCards=${deckCards}, names=${names}, expected=${expected}, cardLinks=${cardLinks}`);
} catch (e) { rec(16, 'メタデッキデータを全件表示', false, 'EXC: ' + e.message); }

// ---- #17 meta→index ?q= 遷移 ----
try {
  const href = await page.locator('#deckList a[href^="index.html?q="]').first().getAttribute('href');
  await page.locator('#deckList a[href^="index.html?q="]').first().click();
  await page.waitForTimeout(500);
  const url = page.url();
  const onIndex = url.includes('index.html') && url.includes('q=');
  let searchVal = '';
  if (onIndex) {
    await page.waitForFunction(() => {
      const el = document.getElementById('resultCount');
      return el && /件中/.test(el.textContent);
    }, { timeout: 10000 }).catch(() => {});
    searchVal = await page.locator('#textSearch').inputValue();
  }
  rec(17, 'meta→index ?q= 遷移', onIndex && searchVal.length > 0,
    `href="${href}", landedURL includes index+q=${onIndex}, searchInput="${searchVal}"`);
} catch (e) { rec(17, 'meta→index ?q= 遷移', false, 'EXC: ' + e.message); }

// ---- #18 ヘッダー相互リンク（index↔meta） ----
try {
  await gotoIndex();
  const toMeta = await page.locator('header a[href="meta.html"]').count();
  await page.goto(BASE + '/meta.html');
  await page.waitForTimeout(300);
  const toIndex = await page.locator('header a[href="index.html"]').count();
  rec(18, 'ヘッダー相互リンク（index↔meta）', toMeta > 0 && toIndex > 0,
    `index→meta link=${toMeta}, meta→index link=${toIndex}`);
} catch (e) { rec(18, 'ヘッダー相互リンク（index↔meta）', false, 'EXC: ' + e.message); }

// ---- #19 ホームからガイドハブへ移動できる ----
try {
  await gotoIndex();
  const link = page.locator('header a[href="guides/"]');
  const label = (await link.textContent()).trim();
  rec(19, 'ホームからガイドハブへ移動できる', await link.count() === 1 && /遊び方|デッキ解説/.test(label),
    `count=${await link.count()}, label="${label}"`);
} catch (e) { rec(19, 'ホームからガイドハブへ移動できる', false, 'EXC: ' + e.message); }

// ---- #20 カード詳細表示ごとに安全なイベントを1回だけ送る ----
{
  let growthCtx;
  try {
    const created = await newGrowthPage();
    growthCtx = created.growthCtx;
    const growthPage = created.growthPage;
    await growthPage.goto(BASE + '/index.html');
    await growthPage.waitForFunction(() => Array.isArray(CARDS) && CARDS.length > 0, { timeout: 15000 });
    const detail = await growthPage.evaluate(() => {
      const id = CARDS[0].id;
      selectCard(id);
      selectCard(id);
      return { id, events: window.__growthEvents };
    });
    const events = detail.events.filter(([name]) => name === 'view_card_detail');
    const safe = events.every(([, params]) => params.card_id === detail.id && !('card_name' in params) && !('query' in params));
    rec(20, 'カード詳細は表示操作ごと1回計測', events.length === 2 && safe,
      `count=${events.length}, safe=${safe}`);
  } catch (e) { rec(20, 'カード詳細は表示操作ごと1回計測', false, 'EXC: ' + e.message); }
  finally { if (growthCtx) await growthCtx.close(); }
}

// ---- #21 39→40の境界だけデッキ完成を計測し、40→39→40は再計測 ----
{
  let growthCtx;
  try {
    const created = await newGrowthPage();
    growthCtx = created.growthCtx;
    const growthPage = created.growthPage;
    await growthPage.goto(BASE + '/index.html');
    await growthPage.waitForFunction(() => Array.isArray(CARDS) && CARDS.length >= 10, { timeout: 15000 });
    const events = await growthPage.evaluate(() => {
      const ids = CARDS.slice(0, 10).map(card => card.id);
      ids.slice(0, 9).forEach(id => { for (let i = 0; i < 4; i += 1) addToDeck(id); });
      for (let i = 0; i < 3; i += 1) addToDeck(ids[9]);
      addToDeck(ids[9]);
      removeFromDeck(ids[9]);
      addToDeck(ids[9]);
      return window.__growthEvents.filter(([name]) => name === 'deck_complete');
    });
    const safe = events.every(([, params]) => params.card_count === 40 && !('deck_name' in params));
    rec(21, '39→40の境界だけデッキ完成を計測', events.length === 2 && safe,
      `count=${events.length}, safe=${safe}`);
  } catch (e) { rec(21, '39→40の境界だけデッキ完成を計測', false, 'EXC: ' + e.message); }
  finally { if (growthCtx) await growthCtx.close(); }
}

// ---- #22 recipe URL復元だけcopy_deckを計測 ----
{
  let growthCtx;
  try {
    const created = await newGrowthPage();
    growthCtx = created.growthCtx;
    const growthPage = created.growthPage;
    await growthPage.goto(BASE + '/index.html?recipe=rcp-2628');
    await growthPage.waitForFunction(() => document.getElementById('deckCountBadge')?.textContent === '40', { timeout: 15000 });
    const recipeEvents = await growthPage.evaluate(() => window.__growthEvents.filter(([name]) => name === 'copy_deck'));
    await growthPage.evaluate(() => { window.__growthEvents.length = 0; history.replaceState(null, '', location.pathname); });
    await growthPage.reload();
    await growthPage.waitForFunction(() => document.getElementById('resultCount') && /\u4ef6中/.test(document.getElementById('resultCount').textContent), { timeout: 15000 });
    const localEvents = await growthPage.evaluate(() => window.__growthEvents.filter(([name]) => name === 'copy_deck'));
    const safe = recipeEvents.length === 1 && recipeEvents[0][1].content_id === 'rcp-2628' && !('deck_name' in recipeEvents[0][1]);
    rec(22, 'recipe URL復元だけcopy_deckを1回計測', safe && localEvents.length === 0,
      `recipe=${recipeEvents.length}, local=${localEvents.length}, safe=${safe}`);
  } catch (e) { rec(22, 'recipe URL復元だけcopy_deckを1回計測', false, 'EXC: ' + e.message); }
  finally { if (growthCtx) await growthCtx.close(); }
}

// ---- #23 PWA prompt表示とインストール完了を計測 ----
{
  let growthCtx;
  try {
    const created = await newGrowthPage();
    growthCtx = created.growthCtx;
    const growthPage = created.growthPage;
    await growthPage.goto(BASE + '/index.html');
    const events = await growthPage.evaluate(() => {
      const promptEvent = new Event('beforeinstallprompt');
      promptEvent.prompt = async () => {};
      promptEvent.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(promptEvent);
      window.dispatchEvent(new Event('appinstalled'));
      return window.__growthEvents;
    });
    const prompts = events.filter(([name]) => name === 'pwa_install_prompt');
    const installs = events.filter(([name]) => name === 'pwa_install');
    rec(23, 'PWA prompt表示と完了を各1回計測', prompts.length === 1 && installs.length === 1,
      `prompt=${prompts.length}, install=${installs.length}`);
  } catch (e) { rec(23, 'PWA prompt表示と完了を各1回計測', false, 'EXC: ' + e.message); }
  finally { if (growthCtx) await growthCtx.close(); }
}

// ---- #24 検索共有URLは許可フィルターだけを含む ----
{
  let growthCtx;
  try {
    const created = await newGrowthPage();
    growthCtx = created.growthCtx;
    const growthPage = created.growthPage;
    await growthPage.goto(BASE + '/index.html?d=secret&recipe=rcp-1&q=%E7%AB%9C&ability=' + encodeURIComponent('ブロッカー'));
    await growthPage.waitForFunction(() => document.getElementById('resultCount') && /\u4ef6中/.test(document.getElementById('resultCount').textContent), { timeout: 15000 });
    await ensureFilterExpanded(growthPage);
    await growthPage.locator('#shareSearchBtn').click();
    await growthPage.waitForFunction(() => window.__copiedSearchURL.length > 0);
    const copied = await growthPage.evaluate(() => window.__copiedSearchURL);
    const copiedURL = new URL(copied);
    const keys = [...copiedURL.searchParams.keys()];
    const allowed = new Set(['q', 'civs', 'type', 'cost', 'race', 'set', 'power', 'rarity', 'ability', 'c05', 'sortKey', 'sortDir']);
    const onlyAllowed = keys.every(key => allowed.has(key));
    rec(24, '検索共有URLは許可フィルターだけ', copiedURL.searchParams.get('q') === '竜' && copiedURL.searchParams.get('ability') === 'ブロッカー' && onlyAllowed,
      `url=${copied}, onlyAllowed=${onlyAllowed}`);
  } catch (e) { rec(24, '検索共有URLは許可フィルターだけ', false, 'EXC: ' + e.message); }
  finally { if (growthCtx) await growthCtx.close(); }
}

// ---- #25 ガイドハブからシノビドルゲーザ解説へ移動できる ----
try {
  await gotoIndex();
  await page.locator('header a[href="guides/"]').click();
  await page.waitForURL('**/guides/');
  const shinobiLink = page.locator('a[href="../deck-guide/shinobi-dorugeza/"]');
  rec(25, 'ガイドハブからシノビドルゲーザへ移動できる', await shinobiLink.count() === 1,
    `links=${await shinobiLink.count()}`);
} catch (e) { rec(25, 'ガイドハブからシノビドルゲーザへ移動できる', false, 'EXC: ' + e.message); }

// ---- #26 シノビドルゲーザCTAは合法なレシピを指す ----
try {
  await page.locator('a[href="../deck-guide/shinobi-dorugeza/"]').click();
  await page.waitForURL('**/deck-guide/shinobi-dorugeza/');
  const cta = page.locator('[data-growth-cta="copy_deck"]');
  const href = await cta.getAttribute('href');
  rec(26, 'シノビドルゲーザCTAはrcp-2628を指す', await cta.count() === 1 && /[?&]recipe=rcp-2628(?:&|$)/.test(href || ''),
    `href=${href}`);
} catch (e) { rec(26, 'シノビドルゲーザCTAはrcp-2628を指す', false, 'EXC: ' + e.message); }

// ---- #27 ガイドCTAからデッキを40枚で復元 ----
try {
  await page.locator('[data-growth-cta="copy_deck"]').click();
  await page.waitForFunction(() => document.getElementById('deckCountBadge')?.textContent === '40', { timeout: 15000 });
  const panelVisible = await page.locator('#deckPanel').isVisible();
  const total = (await page.locator('#deckTotal').textContent()).trim();
  rec(27, 'ガイドCTAからデッキを40枚で復元', panelVisible && /40\s*\/\s*40/.test(total),
    `panel=${panelVisible}, total=${total}`);
} catch (e) { rec(27, 'ガイドCTAからデッキを40枚で復元', false, 'EXC: ' + e.message); }

// ---- #28 ガイドCTAは許可リスト経由でコンテンツCTA計測を送る ----
{
  let growthCtx;
  try {
    const { growthCtx: ctx, growthPage } = await newGrowthPage();
    growthCtx = ctx;
    await growthPage.goto(BASE + '/deck-guide/shinobi-dorugeza/');
    await growthPage.waitForFunction(() => typeof window.trackGrowthEvent === 'function');
    await growthPage.evaluate(() => {
      window.__ctaEvents = [];
      window.trackGrowthEvent = (eventName, params) => window.__ctaEvents.push([eventName, params]);
      document.addEventListener('click', event => {
        if (event.target.closest('[data-growth-cta="copy_deck"]')) event.preventDefault();
      }, true);
    });
    await growthPage.locator('[data-growth-cta="copy_deck"]').click();
    const events = await growthPage.evaluate(() => window.__ctaEvents);
    const pass = events.length === 1 && events[0][0] === 'content_cta_click' &&
      events[0][1]?.content_id === 'shinobi-dorugeza' && events[0][1]?.destination_type === 'deck_builder';
    rec(28, 'ガイドCTAは許可リスト経由でコンテンツCTAを計測', pass, `events=${JSON.stringify(events)}`);
  } catch (e) { rec(28, 'ガイドCTAは許可リスト経由でコンテンツCTAを計測', false, 'EXC: ' + e.message); }
  finally { if (growthCtx) await growthCtx.close(); }
}

// ===========================================================================
// 後片付け & サマリー
// ===========================================================================
await browser.close();
server.close();

// #1〜#28 の件数のみカウント（補足サブケースは含めない）
const mainResults = results.filter(r => r.id >= 1 && r.id <= 28);
const passed = mainResults.filter(r => r.pass).length;
const failed = mainResults.filter(r => !r.pass).length;
const total = mainResults.length;

console.log('\n===== SUMMARY =====');
console.log(`${passed}/${total} passed`);

if (failed > 0) {
  console.log('\nFAILED:');
  mainResults.filter(r => !r.pass).forEach(r => {
    console.log(`  #${String(r.id).padStart(2, '0')} ${r.name} :: ${r.detail}`);
  });
}

process.exit(failed > 0 ? 1 : 0);
