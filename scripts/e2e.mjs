/**
 * E2E テスト — 18 ケース
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

const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

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
  await page.fill('#textSearch', '');
  await page.waitForTimeout(400);
  const after = await page.locator('#cardList mark').count();
  rec(3, '検索クリアでハイライト解除', before > 0 && after === 0, `before=${before}, after=${after}`);
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

// ---- #11 ブロッカーフィルター=283件 ----
try {
  await clearStorage();
  await gotoIndex();
  await page.selectOption('#abilityFilter', 'ブロッカー');
  await page.waitForTimeout(400);
  const cnt = await page.evaluate(() => filterCards().length);
  rec(11, 'ブロッカーフィルター=283件', cnt === 283, `filtered=${cnt}, expected=283`);
} catch (e) { rec(11, 'ブロッカーフィルター=283件', false, 'EXC: ' + e.message); }

// ---- #12 W・ブレイカーフィルター=242件 ----
try {
  await page.selectOption('#abilityFilter', 'W・ブレイカー');
  await page.waitForTimeout(400);
  const cnt = await page.evaluate(() => filterCards().length);
  rec(12, 'W・ブレイカーフィルター=242件', cnt === 242, `filtered=${cnt}, expected=242`);
} catch (e) { rec(12, 'W・ブレイカーフィルター=242件', false, 'EXC: ' + e.message); }

// ---- #13 abilityフィルターURL同期(?ability=)復元 ----
try {
  await gotoIndex('?ability=' + encodeURIComponent('ブロッカー'));
  const selVal = await page.locator('#abilityFilter').inputValue();
  const cnt = await page.evaluate(() => filterCards().length);
  rec(13, 'abilityフィルターURL同期(?ability=)復元', selVal === 'ブロッカー' && cnt === 283,
    `selectValue="${selVal}", filtered=${cnt}`);
} catch (e) { rec(13, 'abilityフィルターURL同期(?ability=)復元', false, 'EXC: ' + e.message); }

// ---- #14 殿堂バッジ（サイバー・ブレイン→🏅/スケルトン・バイス→🚫） ----
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
  const hasBan = banHtml.includes('🚫');
  rec(14, '殿堂バッジ（サイバー・ブレイン→🏅/スケルトン・バイス→🚫）', hasMedal && detailMedal && hasBan,
    `listMedal=${hasMedal}, detailMedal=${detailMedal}, banBadge=${hasBan}`);
} catch (e) { rec(14, '殿堂バッジ（サイバー・ブレイン→🏅/スケルトン・バイス→🚫）', false, 'EXC: ' + e.message); }

// ---- #15 inPool:false 3件はバッジ非表示 ----
try {
  const r = await page.evaluate(() => {
    const names = ['ボルメテウス・サファイア・ドラゴン', 'フューチャー・スラッシュ', '凶星王ダーク・ヒドラ'];
    return names.map(n => ({ n, inCards: !!CARDS.find(c => c.name === n), inHof: HOF_MAP.has(n) }));
  });
  const allAbsent = r.every(x => !x.inCards);
  rec(15, 'inPool:false 3件はバッジ非表示', allAbsent, JSON.stringify(r));
} catch (e) { rec(15, 'inPool:false 3件はバッジ非表示', false, 'EXC: ' + e.message); }

// ---- #16 メタデッキ5デッキ表示 ----
try {
  errors.length = 0;
  await page.goto(BASE + '/meta.html');
  await page.waitForTimeout(600);
  const deckCards = await page.locator('#deckList > div').count();
  const names = await page.locator('#deckList h2').count();
  const cardLinks = await page.locator('#deckList a[href^="index.html?q="]').count();
  rec(16, 'メタデッキ5デッキ表示', deckCards === 5 && names === 5 && cardLinks > 0,
    `deckCards=${deckCards}, names=${names}, cardLinks=${cardLinks}`);
} catch (e) { rec(16, 'メタデッキ5デッキ表示', false, 'EXC: ' + e.message); }

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

// ===========================================================================
// 後片付け & サマリー
// ===========================================================================
await browser.close();
server.close();

// #1〜#18 の件数のみカウント（補足サブケースは含めない）
const mainResults = results.filter(r => r.id >= 1 && r.id <= 18);
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
