import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = fs.readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const cards = JSON.parse(fs.readFileSync(new URL('../../public/cards.json', import.meta.url), 'utf8')) as { id: string; name: string }[];
const codec = html.slice(html.indexOf('function encodeCardId('), html.indexOf('function buildDeckURL('));
const restore = html.slice(html.indexOf('function restoreDeckFromURL('), html.indexOf('// 静的レシピページからのリダイレクト'));

function harness(search = '', existing: unknown[] = []) {
  const calls: string[] = [];
  const context = vm.createContext({
    CARDS: cards, DECK_MAX: 40, CARD_MAX: 4, deck: existing,
    URLSearchParams, location: { search }, atob, escape, decodeURIComponent,
    confirm: () => true, saveDeck: () => calls.push('save'),
    renderDeckBadge: () => calls.push('badge'), updateDeckTitle: () => calls.push('title'),
    openDeckPanel: () => calls.push('panel'), showToast: (message: string) => calls.push(message),
  });
  vm.runInContext(codec + '\n' + restore, context);
  return { context, calls };
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

// public/cards.json を編集せず、現在収録されている全IDを入力として検証する。
test('全カタログのDM・DMC・プロモIDと枚数が共有URLを往復する', () => {
  const { context } = harness();
  assert.ok(cards.length >= 2251);
  assert.ok(cards.some(card => card.id.startsWith('dmc')));
  assert.ok(cards.some(card => card.id.startsWith('promoy')));
  for (const card of cards) {
    const input = [{ id: card.id, count: 4 }];
    const restored = context.decodeDeck(context.encodeDeck(input));
    assert.deepEqual(plain(restored), [{ ...input[0], name: card.name }], card.id);
  }
  assert.equal(context.encodeCardId('dm06-008'), '6-8');
  assert.equal(context.encodeCardId('dm06-s08'), '6-s8');
});

test('新形式と旧base64形式は保存・タイトル更新・パネル表示まで復元する', () => {
  const entries = [{ id: 'dm01-001', count: 2 }, { id: 'dmc34-004', count: 3 }];
  const { context: encoder } = harness();
  for (const search of [
    `?d=${encoder.encodeDeck(entries)}`,
    `?deck=${encodeURIComponent(Buffer.from(JSON.stringify(entries)).toString('base64'))}`,
  ]) {
    const { context, calls } = harness(search);
    context.restoreDeckFromURL();
    assert.deepEqual(calls, ['save', 'badge', 'title', 'panel']);
    assert.deepEqual(plain(context.deck).map(({ id, count }: { id: string; count: number }) => ({ id, count })), entries);
  }
});

test('重複IDを合算し、同一ID4枚・デッキ40枚を境界として検証する', () => {
  const { context } = harness();
  const id = cards[0].id;
  assert.equal(context.validateSharedDeck([{ id, count: 2 }, { id, count: 2 }])[0].count, 4);
  const forty = cards.slice(0, 10).map(card => ({ id: card.id, count: 4 }));
  assert.equal(context.validateSharedDeck(forty).length, 10);
  for (const input of [
    [{ id, count: 3 }, { id, count: 2 }], [...forty, { id: cards[10].id, count: 1 }],
    [{ id, count: 0 }], [{ id, count: -1 }], [{ id, count: 1.5 }],
    [{ id, count: '2' }], [{ id, count: Infinity }], [{ id, count: 4294967297 }],
    [{ id: 'missing-card', count: 1 }], [null], [], {},
  ]) assert.equal(context.validateSharedDeck(input), null, JSON.stringify(input));
});

test('不正共有入力で既存デッキを部分的に上書きしない', () => {
  const existing = [{ id: cards[0].id, name: cards[0].name, count: 1 }];
  const invalidLegacy = encodeURIComponent(Buffer.from(JSON.stringify([{ id: cards[0].id, count: 5 }])).toString('base64'));
  for (const search of ['?d=', '?d=1-1x0', '?d=1-1x5', '?d=1-1x3.1-1x2', '?d=1-1.unknown-card', '?d=1-1.', '?deck=invalid', `?deck=${invalidLegacy}`]) {
    const { context, calls } = harness(search, existing);
    context.restoreDeckFromURL();
    assert.deepEqual(plain(context.deck), existing, search);
    assert.ok(!calls.includes('save'), search);
    assert.ok(calls.some(call => call.includes('共有デッキ')), search);
  }
  const { context, calls } = harness('', existing);
  context.restoreDeckFromURL();
  assert.deepEqual(calls, []);
});

test('購入ボタンは実在するショップ検索関数に接続する', () => {
  assert.doesNotMatch(html, /onclick="buyDeck\(/);
  for (const shop of ['mercari', 'surugaya']) {
    assert.ok(html.includes(`onclick="searchDeckShop('${shop}')"`));
  }
  const shopCode = html.slice(html.indexOf('function searchDeckShop('), html.indexOf('function shareDeckX('));
  const opened: string[] = [];
  const context = vm.createContext({ deck: [{ name: 'test card', count: 1 }], window: { open: (url: string) => opened.push(url) } });
  vm.runInContext(shopCode, context);
  context.searchDeckShop('mercari');
  context.searchDeckShop('surugaya');
  assert.equal(new URL(opened[0]).hostname, 'jp.mercari.com');
  assert.equal(new URL(opened[1]).hostname, 'www.surugaya.jp');
});
