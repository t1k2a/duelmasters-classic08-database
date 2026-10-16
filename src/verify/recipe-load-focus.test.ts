import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = fs.readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const loadRecipes = html.slice(html.indexOf("fetch('data/recipes.json')"), html.indexOf("fetch('data/meta-decks.json')"));

for (const scenario of ['selected', 'switched', 'closed', 'empty', 'other-detail'] as const) {
  test(`recipe response updates only the current recipe slot: ${scenario}`, async () => {
    let resolveResponse!: (value: unknown) => void;
    const response = new Promise(resolve => { resolveResponse = resolve; });
    const slot = { innerHTML: '', hidden: true };
    let wholeDetailWrites = 0;
    const detailBody = { set innerHTML(_value: string) { wholeDetailWrites++; } };
    const c = vm.createContext({
      fetch: () => response, RECIPES: [], selectedCard: 'a', CARDS: [{ id: 'a' }, { id: 'b' }],
      recipeButtonHTML: (card: { id: string }) => scenario === 'empty' ? '' : `recipes:${card.id}`,
      detailHTML: () => 'replacement',
      document: { getElementById: (id: string) => {
        if (id === 'mobileDetail') return { classList: { contains: () => scenario === 'closed' } };
        if (id === 'detailBody') return detailBody;
        if (id === 'detailRecipeButton') return scenario === 'other-detail' ? null : slot;
        throw new Error(`Unexpected element: ${id}`);
      } },
    });
    const completed = vm.runInContext(loadRecipes, c);
    if (scenario === 'switched') c.selectedCard = 'b';
    resolveResponse({ json: async () => scenario === 'empty' ? [] : [{ id: 'recipe' }] });
    await completed;
    assert.equal(wholeDetailWrites, 0, 'must not replace focused controls or progress');
    assert.equal(slot.hidden, ['empty', 'closed', 'other-detail'].includes(scenario));
    assert.equal(slot.innerHTML, ['empty', 'closed', 'other-detail'].includes(scenario) ? '' : `recipes:${c.selectedCard}`);
  });
}
