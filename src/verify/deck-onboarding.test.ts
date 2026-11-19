import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = fs.readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const section = (from: string, to: string) => html.slice(html.indexOf(from), html.indexOf(to));
const cards = Array.from({ length: 11 }, (_, i) => ({ id: `dm01-${i + 1}`, name: `Card ${i}` }));
const previous = [{ ...cards[0], count: 1 }];
const recipe = { id: 'rcp-0114', cards: cards.slice(0, 10).map(c => ({ id: c.id, count: 4 })) };
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

function harness() {
  let saved = JSON.stringify(previous);
  const events: unknown[] = [], calls: string[] = [];
  const context = vm.createContext({
    deck: structuredClone(previous), DECK_MAX: 40, CARD_MAX: 4, CARDS: cards,
    RECIPES: [structuredClone(recipe)], META_DECKS: [], restoredRecipeId: 'previous',
    cardById: (id: string) => cards.find(c => c.id === id),
    isRestrictionsReady: () => true, confirm: () => true,
    saveDeck: (entries: unknown) => { saved = JSON.stringify(entries); calls.push('save'); },
    renderDeckBadge: () => calls.push('badge'), updateDeckTitle: () => calls.push('title'),
    openDeckPanel: () => calls.push('panel'), showToast: () => calls.push('toast'),
    document: { getElementById: () => ({ classList: { add() {} }, focus: () => calls.push('focus') }) },
    window: {
      trackGrowthEvent: (...args: unknown[]) => events.push(plain(args)),
      trackEventOnce: (...args: unknown[]) => events.push(plain(args.slice(1))),
    },
  });
  vm.runInContext(section('function validateSharedDeck(', 'function buildDeckURL(') +
    section('function deckTotalCount()', 'function addToDeck(') +
    section('function restoreRecipeFromURL(', '// レシピの共有URL') +
    section('function loadRecipe(', 'let toastTimer'), context);
  return { context, events, calls, saved: () => saved };
}

test('一覧では検証済みのデッキだけをコピーし、URL読込と同じ成功イベントを送る', () => {
  for (const source of ['recipe_list', 'recipe_url']) {
    const h = harness();
    if (source === 'recipe_list') h.context.loadRecipe(recipe.id);
    else h.context.restoreRecipeFromURL(recipe.id);
    assert.equal(h.context.deckTotalCount(), 40);
    assert.equal(h.context.restoredRecipeId, recipe.id);
    assert.deepEqual(h.events, [['copy_deck', { content_id: recipe.id, card_count: 40, entry_point: source }]]);
    assert.equal(JSON.parse(h.saved()).length, 10);
    if (source === 'recipe_list') assert.ok(h.calls.includes('focus'));
    assert.equal(h.events.some((event: any) => event[0] === 'deck_complete'), false);
  }
});

test('キャンセル・レシピ不在・不正データ・未準備・保存失敗ではデッキを保持してイベントを送らない', () => {
  const cases: Array<(context: any) => void> = [
    c => { c.confirm = () => false; },
    c => { c.RECIPES = []; },
    c => { c.isRestrictionsReady = () => false; },
    c => { c.saveDeck = () => { throw new Error('quota'); }; },
    ...[[], [null], [{ id: 'unknown', count: 4 }], [{ id: cards[0].id, count: 5 }],
      [{ id: cards[0].id, count: 1.5 }], cards.map(c => ({ id: c.id, count: 4 })),
      [{ id: cards[0].id, count: 3 }, { id: cards[0].id, count: 2 }]]
      .map(entries => (c: any) => { c.RECIPES[0].cards = entries; }),
  ];
  for (const setup of cases) {
    const h = harness();
    setup(h.context);
    h.context.loadRecipe(recipe.id);
    assert.deepEqual(plain(h.context.deck), previous);
    assert.equal(h.saved(), JSON.stringify(previous));
    assert.equal(h.context.restoredRecipeId, 'previous');
    assert.deepEqual(h.events, []);
    assert.ok(!h.calls.includes('panel'));
  }
});

test('再度承認した手動コピーは別の成功操作として数え、キャンセルした再試行は数えない', () => {
  const h = harness();
  h.context.loadRecipe(recipe.id);
  h.context.confirm = () => false;
  h.context.loadRecipe(recipe.id);
  assert.equal(h.events.length, 1);
  h.context.confirm = () => true;
  h.context.loadRecipe(recipe.id);
  assert.equal(h.events.length, 2);
});

test('空デッキのリンク先には40枚のサンプルがあり、操作ボタンは内容が分かる文言にする', () => {
  assert.match(html, /href="deck-guide\/beginner-low-rarity-deck\/"[\s\S]*?>サンプルデッキを見て試す<\/a>/);
  const guide = fs.readFileSync(new URL('../../public/deck-guide/beginner-low-rarity-deck/index.html', import.meta.url), 'utf8');
  assert.match(guide, /recipe=rcp-0114/);
  const recipes = JSON.parse(fs.readFileSync(new URL('../../public/data/recipes.json', import.meta.url), 'utf8'));
  const sample = recipes.find((r: any) => r.id === 'rcp-0114');
  assert.equal(sample.cards.reduce((sum: number, c: any) => sum + c.count, 0), 40);
  assert.match(section('function recipeCardHTML(', 'function recipeButtonHTML('), />このデッキをコピーして編集<\/button>/);
  assert.doesNotMatch(html, />読込<\/button>/);
});
