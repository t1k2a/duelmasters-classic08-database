import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = fs.readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const code = html.slice(html.indexOf('function toggleMobileCiv('), html.indexOf("['textSearch','mobileCardType'"));
const analytics = fs.readFileSync(new URL('../../public/js/analytics.js', import.meta.url), 'utf8');
const fields = ['textSearch', 'mobileCardType', 'mobileCostMax', 'mobileRaceFilter', 'mobileSetFilter', 'powerFilter', 'rarityFilter', 'abilityFilter', 'classic05Filter', 'sortKey', 'sortDir'];
const utms = { utm_source: 'x', utm_medium: 'social', utm_campaign: 'classic08', utm_content: 'post-001', utm_term: '青銅 & 槍', utm_id: 'series-1' };

function harness(query: string, consent?: string) {
  const elements = new Map<string, any>();
  const storage = new Map<string, string>(consent ? [['ga-consent', consent]] : []);
  const timers = new Map<number, () => void>();
  const loads: string[] = [];
  const node = () => ({ value: '', checked: false, id: '', dataset: {} as any, className: '', innerHTML: '', handlers: {} as Record<string, () => void>, classList: { add() {}, remove() {} }, setAttribute() {}, addEventListener(name: string, fn: () => void) { this.handlers[name] = fn; }, remove() { elements.delete(this.id); } });
  for (const id of [...fields, 'ga-consent-accept', 'ga-consent-reject']) elements.set(id, node());
  const buttons = ['光', '水', '闇', '火', '自然'].map(civ => Object.assign(node(), { dataset: { civ } }));
  const context = vm.createContext({ URLSearchParams, location: new URL(`https://example.test/app/${query}`),
    document: { readyState: 'complete', currentScript: { src: 'https://example.test/app/js/analytics.js' },
      getElementById: (id: string) => elements.get(id) || null,
      querySelectorAll: () => buttons, createElement: node,
      body: { appendChild: (el: any) => elements.set(el.id, el) },
      head: { appendChild: () => loads.push(context.location.href) },
    },
    mobileCivFilter: new Set(['光', '水', '闇', '火', '自然']), INITIAL_SORT: { key: 'cost' },
    debounceTimer: null, urlTimer: null, renderList() {}, selectCard() {},
    setTimeout: (fn: () => void) => { const id = timers.size + 1; timers.set(id, fn); return id; },
    clearTimeout: (id: number) => timers.delete(id),
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    __GA_ID__: 'G-QATEST123', console,
  });
  context.window = context;
  context.history = { replaceState: (_: unknown, __: string, url: string) => { context.location = new URL(url, context.location); } };
  vm.runInContext(code, context);
  return { context, elements, storage, loads, timers, startAnalytics: () => vm.runInContext(analytics, context) };
}

test('URL同期は許可UTMとhashを保持し、共有検索URLへ流入情報を伝播しない', () => {
  const query = new URLSearchParams({ ...utms, utm_unknown: 'drop', unknown: 'drop', q: 'old' });
  const h = harness(`?${query}#card-section`);
  h.elements.get('textSearch').value = 'new search';
  h.context.syncURL();
  for (const [key, value] of Object.entries(utms)) assert.equal(h.context.location.searchParams.get(key), value, key);
  assert.equal(h.context.location.hash, '#card-section');
  assert.equal(h.context.location.searchParams.get('q'), 'new search');
  assert.equal(h.context.location.searchParams.has('utm_unknown'), false);
  assert.equal(h.context.location.searchParams.has('unknown'), false);
  const shared = new URL(h.context.buildSearchURL());
  assert.equal(shared.searchParams.get('q'), 'new search');
  assert.equal([...shared.searchParams.keys()].some(key => key.startsWith('utm_')), false);
  assert.equal(shared.hash, '');
});

test('文明復元による遅延同期でもrecipe/deck/idとUTM/hashを保持する', () => {
  for (const [key, value] of Object.entries({ recipe: 'rcp-0001', d: '1-1x2', deck: 'legacy+base64=', id: 'dm01-001' })) {
    const query = new URLSearchParams({ [key]: value, civs: '火', utm_source: 'x' });
    const h = harness(`?${query}#target`);
    h.context.applyURLParams();
    for (const fn of [...h.timers.values()]) fn();
    assert.equal(h.context.location.searchParams.get(key), value);
    assert.equal(h.context.location.searchParams.get('civs'), '火');
    assert.equal(h.context.location.searchParams.get('utm_source'), 'x');
    assert.equal(h.context.location.hash, '#target');
  }
});

test('タグ付きlanding→検索条件変更→同意の順でのみタグが読み込まれUTMが残る', () => {
  const h = harness(`?${new URLSearchParams(utms)}`);
  h.startAnalytics();
  assert.deepEqual(h.loads, []);
  h.elements.get('textSearch').value = 'ドラゴン';
  h.context.scheduleUpdate();
  for (const fn of [...h.timers.values()]) fn();
  assert.deepEqual(h.loads, []);
  h.elements.get('ga-consent-accept').handlers.click();
  assert.equal(h.loads.length, 1);
  const initializedAt = new URL(h.loads[0]);
  for (const [key, value] of Object.entries(utms)) assert.equal(initializedAt.searchParams.get(key), value);
  assert.equal(h.storage.get('ga-consent'), 'granted');
});

test('拒否・拒否状態の再訪・未同意は検索後も計測を開始しない', () => {
  for (const consent of [undefined, 'denied']) {
    const h = harness('?utm_source=x&civs=水', consent);
    h.startAnalytics();
    h.context.applyURLParams();
    for (const fn of [...h.timers.values()]) fn();
    if (!consent) h.elements.get('ga-consent-reject').handlers.click();
    h.context.trackGrowthEvent('share_deck', { method: 'x', card_count: 40 });
    assert.deepEqual(h.loads, []);
    assert.equal(h.context.gtag, undefined);
    assert.equal(h.context.location.searchParams.get('utm_source'), 'x');
  }
});

test('同意済み復元と重複UTMは最初の値を維持する', () => {
  const h = harness('?utm_source=x&utm_source=second&utm_content=&q=old#anchor', 'granted');
  h.startAnalytics();
  h.context.applyURLParams();
  h.elements.get('textSearch').value = '';
  h.context.syncURL();
  assert.equal(h.loads.length, 1);
  assert.deepEqual(h.context.location.searchParams.getAll('utm_source'), ['x']);
  assert.equal(h.context.location.searchParams.get('utm_content'), '');
  assert.equal(h.context.location.searchParams.has('q'), false);
  assert.equal(h.context.location.hash, '#anchor');
});
