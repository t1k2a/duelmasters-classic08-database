import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { checkDeckLegality } from './deck-legality.js';

const html = fs.readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const restrictionList = { banned: [{ name: '禁止' }], restricted: [{ name: '制限' }], helper: [], helperPickLimit: 1, bannedCombos: [] } as any;
const escapeHtml = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

test('枚数不足は進捗、禁止・制限・超過は警告として分離する', () => {
  const source = html.match(/function deckStatusHTML\([\s\S]*?(?=\nfunction )/)?.[0];
  assert.ok(source, '進捗と違反を分離する表示関数');
  const c = vm.createContext({ DECK_MAX: 40, escapeHtml });
  vm.runInContext(source, c);
  for (const total of [0, 1, 39, 40, 41]) {
    const entries = [{ id: 'fixture', name: '通常', count: total }];
    const result = checkDeckLegality(entries, restrictionList);
    assert.equal(result.legal, total === 40, '合法性判定を緩めない');
    const output = c.deckStatusHTML(total, result.violations);
    if (total < 40) { assert.match(output, new RegExp(`あと ${40-total} 枚で完成`)); assert.doesNotMatch(output, /ルール違反|bg-red/); }
    if (total === 41) assert.match(output, /ルール違反/);
  }
  for (const [name, count] of [['禁止', 1], ['制限', 2]] as const) {
    const result = checkDeckLegality([{ id: 'fixture', name, count }], restrictionList);
    const output = c.deckStatusHTML(count, result.violations);
    assert.match(output, /あと .* 枚で完成/);
    assert.match(output, /ルール違反/);
    assert.match(output, new RegExp(name));
  }
  assert.doesNotMatch(c.deckStatusHTML(1, [{ type: 'banned', message: '<script>unsafe</script>' }]), /<script>/);
});

test('追加成功のみ計測し、40枚到達イベントを重複させない', () => {
  const code = html.slice(html.indexOf('function deckTotalCount('), html.indexOf('function removeFromDeck('));
  const events: any[] = [];
  const c = vm.createContext({ CARDS: Array.from({ length: 12 }, (_, i) => ({ id: `c-${i}`, name: `カード${i}` })), deck: [], DECK_MAX: 40, CARD_MAX: 4,
    saveDeck() {}, renderDeckBadge() {}, renderDeckPanel() {}, updateDetailDeckProgress() {}, showToast() {},
    document: { getElementById: () => ({ classList: { contains: () => true } }) },
    window: { trackGrowthEvent: (...args: any[]) => events.push(JSON.parse(JSON.stringify(args))) } });
  vm.runInContext(code, c);
  c.addToDeck('missing');
  assert.equal(events.length, 0);
  c.addToDeck('c-0');
  assert.deepEqual(events, [['add_to_deck', { card_id: 'c-0', card_count: 1 }]]);
  for (let i=0; i<10; i++) for (let n=0; n<4; n++) c.addToDeck(`c-${i}`);
  c.addToDeck('c-10');
  assert.equal(events.filter(([name]) => name === 'add_to_deck').length, 40);
  assert.equal(events.filter(([name]) => name === 'deck_complete').length, 1);
});
