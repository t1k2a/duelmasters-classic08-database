import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = fs.readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const analytics = fs.readFileSync(new URL('../../public/js/analytics.js', import.meta.url), 'utf8');
const section = (from: string, to: string) => html.slice(html.indexOf(from), html.indexOf(to));
const cards = Array.from({ length: 11 }, (_, i) => ({ id: `dm01-${i + 1}`, name: `Card ${i}` }));

// No browser, network API, or script loader is exposed to the production code.
function harness(consent = 'granted', count = 1, openResult: unknown = null) {
  const opened: unknown[][] = [];
  const loads: unknown[] = [];
  const context = vm.createContext({
    CARDS: cards, DECK_MAX: 40, CARD_MAX: 4,
    deck: count ? [{ ...cards[0], count }] : [],
    SHARE_HASHTAGS_PARAM: 'test',
    buildDeckURL: () => 'https://example.test/?d=1-1',
    deckSummaryText: () => 'Test deck',
    showToast() {}, saveDeck() {}, renderDeckBadge() {}, renderDeckPanel() {},
    localStorage: { getItem: () => consent },
    document: {
      readyState: 'complete', currentScript: null,
      createElement: () => ({}), head: { appendChild: (el: unknown) => loads.push(el) },
      getElementById: () => ({ classList: { contains: () => true } }),
    },
    __GA_ID__: 'G-QATEST123',
    open: (...args: unknown[]) => { opened.push(args); return openResult; },
  });
  context.window = context;
  vm.runInContext(analytics, context);
  vm.runInContext(section('function deckTotalCount()', 'function removeFromDeck(') +
    section('function shareDeckX()', '// deck/recipe'), context);
  const events = () => JSON.parse(JSON.stringify(
    (context.dataLayer || []).filter((a: any) => a[0] === 'event').map((a: any) => [a[1], a[2]])
  ));
  return { context, opened, loads, events };
}

test('X intent attempt is counted once even when noopener returns null', () => {
  for (const result of [null, {}]) {
    const h = harness('granted', 2, result);
    h.context.shareDeckX();
    assert.deepEqual(h.events(), [['share_deck', { method: 'x', card_count: 2 }]]);
    assert.equal(h.opened.length, 1);
    assert.deepEqual(h.opened[0].slice(1), ['_blank', 'noopener']);
    assert.equal(new URL(h.opened[0][0] as string).pathname, '/intent/tweet');
  }
});

test('X sharing respects denied consent and rejects empty or oversized decks', () => {
  const denied = harness('denied');
  denied.context.shareDeckX();
  assert.equal(denied.opened.length, 1);
  assert.deepEqual(denied.events(), []);
  assert.deepEqual(denied.loads, []);
  for (const count of [0, 41]) {
    const h = harness('granted', count);
    h.context.shareDeckX();
    assert.deepEqual(h.opened, []);
    assert.deepEqual(h.events(), []);
  }
});

test('deck events occur only on successful additions and the transition to 40 cards', () => {
  const h = harness();
  h.context.addToDeck('missing');
  assert.deepEqual(h.events(), []);
  h.context.deck = cards.slice(0, 10).map((card, i) => ({ ...card, count: i === 9 ? 3 : 4 }));
  h.context.addToDeck(cards[0].id);
  assert.deepEqual(h.events(), []);
  h.context.addToDeck(cards[9].id);
  assert.deepEqual(h.events(), [
    ['add_to_deck', { card_id: cards[9].id, card_count: 40 }],
    ['deck_complete', { card_count: 40 }],
  ]);
  h.context.addToDeck(cards[10].id);
  assert.equal(h.events().length, 2);
});
