import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const section = (from, to) => html.slice(html.indexOf(from), html.indexOf(to));
const cards = Array.from({ length: 11 }, (_, i) => ({ id: `dm01-${String(i + 1).padStart(3, '0')}`, name: `Card ${i}` }));
const entry = { id: cards[0].id, count: 2 };
const previous = [{ ...entry, name: cards[0].name }];
const plain = value => JSON.parse(JSON.stringify(value));
function harness(raw = JSON.stringify(previous)) {
  const calls = [];
  const timers = new Map();
  let saved = raw;
  const context = vm.createContext({
    CARDS: cards, DECK_MAX: 40, CARD_MAX: 4, DECK_KEY: 'dm_deck', deck: structuredClone(previous),
    RECIPES: [], META_DECKS: [], restoredRecipeId: 'original', window: {},
    cardById: id => cards.find(c => c.id === id),
    localStorage: { getItem: () => saved, setItem: (_, value) => { saved = value; calls.push('save'); } },
    confirm: () => { calls.push('confirm'); return false; },
    showToast: () => calls.push('toast'), renderDeckBadge: () => calls.push('badge'),
    updateDeckTitle: () => calls.push('title'), openDeckPanel: () => calls.push('panel'),
    setInterval: fn => { timers.set(1, fn); return 1; }, clearInterval: id => timers.delete(id),
  });
  vm.runInContext(section('function loadDeck()', 'function deckTotalCount()') +
    section('function validateSharedDeck(', 'function buildDeckURL(') +
    section('function restoreRecipeFromURL(', '// レシピの共有URL'), context);
  return { context, calls, timers, saved: () => saved };
}

test('stored decks: canonical names, duplicate merge, empty and exact limits remain compatible', () => {
  for (const input of [[], [{ ...entry, name: '<img onerror=bad>' }], [entry, entry], cards.slice(0, 10).map(c => ({ id: c.id, count: 4 }))]) {
    const h = harness(JSON.stringify(input));
    h.context.loadDeck();
    const expected = input.length ? plain(h.context.validateSharedDeck(input)) : [];
    assert.deepEqual(plain(h.context.deck), expected);
    assert.equal(h.saved(), JSON.stringify(input));
  }
});

test('invalid storage is rejected as a whole without changing current or saved deck', () => {
  const invalid = ['{', 'null', '{}', JSON.stringify([null]), JSON.stringify([entry, { id: 'unknown', count: 1 }]),
    ...[0, -1, 1.5, '2', 5, Number.MAX_SAFE_INTEGER + 1, null].map(count => JSON.stringify([{ ...entry, count }])),
    JSON.stringify([{ id: "x' onclick='bad", count: 1 }]), JSON.stringify([entry, { ...entry, count: 3 }]),
    JSON.stringify(cards.map(c => ({ id: c.id, count: 4 })))];
  for (const raw of invalid) {
    const h = harness(raw);
    h.context.loadDeck();
    assert.deepEqual(plain(h.context.deck), previous, raw);
    assert.equal(h.saved(), raw);
    assert.ok(!h.calls.includes('save'));
  }
});

test('recipe cancellation keeps state and is not retried, including delayed arrival', () => {
  for (const delayed of [false, true]) {
    const h = harness();
    if (!delayed) h.context.RECIPES = [{ id: 'rcp-0001', cards: [entry] }];
    h.context.restoreRecipeFromURL('rcp-0001');
    if (delayed) {
      h.context.RECIPES = [{ id: 'rcp-0001', cards: [entry] }];
      for (const fn of h.timers.values()) fn();
    }
    assert.deepEqual(h.calls, ['confirm']);
    assert.deepEqual(plain(h.context.deck), previous);
    assert.equal(h.saved(), JSON.stringify(previous));
    assert.equal(h.context.restoredRecipeId, 'original');
    assert.equal(h.timers.size, 0);
  }
});

test('recipe rejects missing cards and invalid counts instead of dropping or clamping', () => {
  for (const input of [[], [entry, { id: 'unknown', count: 1 }], [{ ...entry, count: 5 }], [null], [entry, { ...entry, count: 3 }]]) {
    const h = harness();
    h.context.RECIPES = [{ id: 'rcp-0001', cards: input }];
    h.context.restoreRecipeFromURL('rcp-0001');
    assert.deepEqual(plain(h.context.deck), previous);
    assert.equal(h.saved(), JSON.stringify(previous));
    assert.ok(!h.calls.includes('confirm'));
    assert.equal(h.timers.size, 0);
  }
});

test('recipe approval, empty deck, meta ID/name, and name-only compatibility', () => {
  for (const recipeId of ['rcp-0001', 'meta-1', 'Meta']) {
    for (const existing of [[], previous]) {
      const h = harness();
      h.context.deck = structuredClone(existing);
      h.context.confirm = () => { h.calls.push('confirm'); return true; };
      h.context.RECIPES = [{ id: 'rcp-0001', cards: [entry] }];
      h.context.META_DECKS = [{ name: 'Meta', cards: [{ name: cards[0].name, count: 2 }] }];
      h.context.restoreRecipeFromURL(recipeId);
      assert.deepEqual(plain(h.context.deck), previous);
      assert.deepEqual(h.calls, [...(existing.length ? ['confirm'] : []), 'save', 'badge', 'title', 'panel']);
      assert.equal(h.context.restoredRecipeId, recipeId);
    }
  }
});

test('recipe storage failure leaves current and saved state unchanged', () => {
  const h = harness();
  h.context.RECIPES = [{ id: 'rcp-0001', cards: [{ ...entry, count: 4 }] }];
  h.context.confirm = () => true;
  h.context.localStorage.setItem = () => { throw new Error('quota'); };
  h.context.restoreRecipeFromURL('rcp-0001');
  assert.deepEqual(plain(h.context.deck), previous);
  assert.equal(h.saved(), JSON.stringify(previous));
  assert.equal(h.context.restoredRecipeId, 'original');
  assert.equal(h.timers.size, 0);
});

test('activate removes only obsolete caches with this app prefix', async () => {
  const listeners = {};
  const deleted = [];
  let claimed = false;
  const context = vm.createContext({ URL, self: { registration: { scope: 'https://example.test/app/' },
    addEventListener: (name, fn) => { listeners[name] = fn; }, clients: { claim: () => { claimed = true; } } },
    caches: { keys: async () => ['dmc08-v1', 'dmc08-v2', 'dmc08-v3', 'other-app-v3', 'dmc080-v1'], delete: async key => deleted.push(key) } });
  vm.runInContext(fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  let done;
  listeners.activate({ waitUntil: promise => { done = promise; } });
  await done;
  assert.deepEqual(deleted, ['dmc08-v1', 'dmc08-v2']);
  assert.equal(claimed, true);
});
