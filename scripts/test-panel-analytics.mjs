import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const analytics = fs.readFileSync('public/js/analytics.js', 'utf8');
const panels = fs.readFileSync('public/js/panel-analytics.js', 'utf8');
function harness(consent = 'granted', measurement = 'G-TEST') {
  const calls = [], listeners = {}, domListeners = {};
  const nodes = Object.fromEntries(['deckPanel', 'mobileDetail'].map(id => [id, {
    hidden: true, dataset: {}, classList: { contains: () => nodes[id].hidden },
  }]));
  let callback;
  const window = { __GA_ID__: measurement, gtag: (...args) => calls.push(args),
    addEventListener: (name, fn) => { listeners[name] = fn; } };
  const context = vm.createContext({ window, console, Event,
    location: { href: 'https://example.com/?q=SECRET#DECK' },
    localStorage: { getItem: () => consent },
    document: { readyState: 'loading', currentScript: null, title: 'SECRET', referrer: 'SECRET',
      getElementById: id => nodes[id], addEventListener: (name, fn) => { domListeners[name] = fn; } },
    MutationObserver: class { constructor(fn) { callback = fn; } observe() {} },
  });
  vm.runInContext(analytics, context);
  vm.runInContext(panels, context);
  return { window, calls, nodes, report: () => callback(), init: () => domListeners.DOMContentLoaded(),
    grant: () => { consent = 'granted'; listeners['analytics-consent-granted'](); } };
}
test('fixed names only; URLs, query, referrer, title and extra arguments are not forwarded', () => {
  const h = harness();
  for (const name of ['search', 'deck', 'recipe', 'card_detail']) h.window.trackPanelView(name, { q: 'SECRET' });
  for (const name of ['SECRET', null, {}, '__proto__']) h.window.trackPanelView(name);
  assert.equal(h.calls.length, 4);
  assert.ok(!JSON.stringify(h.calls).includes('SECRET'));
  for (const [, name, payload] of h.calls) {
    assert.equal(name, 'panel_view');
    assert.equal(payload.page_location, 'https://t1k2a.github.io/duelmasters-classic08-database/');
    assert.equal(payload.page_referrer, '');
    assert.deepEqual(Object.keys(payload).sort(), ['page_location', 'page_referrer', 'page_title', 'panel_name']);
  }
});
test('initial search; open, re-render, close and reopen count only visible transitions', () => {
  const h = harness(); h.init(); h.report();
  h.nodes.deckPanel.hidden = false; h.report(); h.report();
  h.nodes.mobileDetail.hidden = false; h.nodes.deckPanel.hidden = true; h.report();
  h.nodes.mobileDetail.dataset.analyticsPanel = 'recipe'; h.report(); h.report();
  h.nodes.mobileDetail.hidden = true; h.report();
  h.nodes.deckPanel.hidden = false; h.report();
  assert.deepEqual(h.calls.map(c => c[2].panel_name), ['search', 'deck', 'card_detail', 'recipe', 'search', 'deck']);
});
test('unknown or rejected consent sends nothing; acceptance sends current panel only', () => {
  for (const consent of [null, 'denied']) {
    const h = harness(consent); h.init();
    h.nodes.deckPanel.hidden = false; h.report();
    h.nodes.deckPanel.hidden = true; h.nodes.mobileDetail.hidden = false; h.nodes.mobileDetail.dataset.analyticsPanel = 'recipe'; h.report();
    assert.equal(h.calls.length, 0);
    h.grant(); h.report();
    assert.deepEqual(h.calls.map(c => c[2].panel_name), ['recipe']);
  }
});
test('no measurement ID or placeholder means no events', () => {
  for (const measurement of ['', 'G-XXXXXXXXXX']) {
    const h = harness('granted', measurement); h.init(); h.report(); h.grant();
    assert.equal(h.calls.length, 0);
  }
});

test('deck overlay takes priority over detail and closing restores detail', () => {
  const h = harness(); h.nodes.mobileDetail.hidden = false; h.init();
  h.nodes.deckPanel.hidden = false; h.report();
  h.nodes.deckPanel.hidden = true; h.report();
  assert.deepEqual(h.calls.map(c => c[2].panel_name), ['card_detail', 'deck', 'card_detail']);
});
