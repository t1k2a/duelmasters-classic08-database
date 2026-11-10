import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const analytics = fs.readFileSync(new URL('../../public/js/analytics.js', import.meta.url), 'utf8');
type Options = {
  consent?: string | null; hostname?: string; search?: string; session?: Map<string, string>;
  storageError?: 'getItem' | 'setItem' | 'removeItem'; consentWriteError?: boolean;
  consentReadError?: boolean; measurementId?: string;
};

// No network primitives or real DOM script loader exist in this isolated fixture.
function harness(options: Options = {}) {
  let consent = options.consent === undefined ? 'granted' : options.consent;
  const session = options.session || new Map<string, string>();
  const tags: unknown[] = [];
  const elements = new Map<string, any>();
  const handlers = new Map<string, () => void>();
  const context = vm.createContext({
    URLSearchParams,
    location: { hostname: options.hostname || 'analytics.test', search: options.search || '' },
    sessionStorage: {
      getItem(key: string) {
        if (options.storageError === 'getItem') throw new Error('Storage blocked');
        return session.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        if (options.storageError === 'setItem') throw new Error('Storage blocked');
        session.set(key, value);
      },
      removeItem(key: string) {
        if (options.storageError === 'removeItem') throw new Error('Storage blocked');
        session.delete(key);
      },
    },
    localStorage: {
      getItem() {
        if (options.consentReadError) throw new Error('Storage blocked');
        return consent;
      },
      setItem(_key: string, value: string) {
        if (options.consentWriteError) throw new Error('Storage blocked');
        consent = value;
      },
    },
    document: {
      readyState: 'complete', currentScript: null,
      createElement: () => ({ remove() { elements.delete('ga-consent-banner'); } }),
      head: { appendChild: (tag: unknown) => tags.push(tag) },
      body: { appendChild: (el: any) => {
        elements.set(el.id, el);
        for (const id of ['ga-consent-accept', 'ga-consent-reject']) {
          elements.set(id, { addEventListener: (_event: string, fn: () => void) => handlers.set(id, fn) });
        }
      } },
      getElementById: (id: string) => elements.get(id) || null,
    },
    __GA_ID__: options.measurementId ?? 'G-QATEST123',
  });
  context.window = context;
  vm.runInContext(analytics, context);
  const events = () => JSON.parse(JSON.stringify(
    (context.dataLayer || []).filter((a: any) => a[0] === 'event').map((a: any) => [a[1], a[2]])
  ));
  const emit = () => {
    context.trackEvent('ordinary_event', {});
    context.trackGrowthEvent('copy_deck', { content_id: 'recipe-1' });
    context.trackEventOnce('copy', 'copy_deck', { content_id: 'recipe-1' });
  };
  return { context, session, tags, elements, handlers, events, emit };
}

test('production-like origin preserves unknown, denied and granted consent behavior', () => {
  for (const consent of [null, 'denied', 'granted']) {
    const h = harness({ consent });
    h.emit();
    assert.equal(h.tags.length, consent === 'granted' ? 1 : 0);
    assert.equal(h.events().length, consent === 'granted' ? 3 : 0);
    assert.equal(h.elements.has('ga-consent-banner'), consent === null);
  }
  const accept = harness({ consent: null });
  accept.handlers.get('ga-consent-accept')!();
  accept.emit();
  assert.equal(accept.tags.length, 1);
  assert.equal(accept.events().length, 3);
  const reject = harness({ consent: null });
  reject.handlers.get('ga-consent-reject')!();
  reject.emit();
  assert.equal(reject.tags.length, 0);
  assert.deepEqual(reject.events(), []);
});

test('loopback hosts always suppress tags, banner and all event helpers, including analytics=on', () => {
  for (const hostname of ['localhost', 'LOCALHOST', 'localhost.', 'qa.localhost', '127.0.0.1', '127.0.0.2', '[::1]', '::1']) {
    for (const consent of [null, 'denied', 'granted']) {
      const h = harness({ hostname, consent, search: '?analytics=on' });
      h.context.gtag = () => assert.fail('Must not call a pre-existing gtag');
      h.emit();
      assert.deepEqual(h.tags, []);
      assert.deepEqual(h.events(), []);
      assert.equal(h.elements.has('ga-consent-banner'), false);
    }
  }
});

test('QA opt-out survives page navigation and analytics=on clears only the session opt-out', () => {
  const session = new Map<string, string>();
  for (const search of ['?analytics=off', '', '?recipe=recipe-1']) {
    const h = harness({ search, session });
    h.emit();
    assert.deepEqual(h.tags, []);
    assert.deepEqual(h.events(), []);
    assert.equal(h.elements.has('ga-consent-banner'), false);
  }
  const denied = harness({ search: '?analytics=on', session, consent: 'denied' });
  denied.emit();
  assert.equal(session.has('ga-test-traffic'), false);
  assert.deepEqual(denied.tags, []);
  assert.deepEqual(denied.events(), []);
  const granted = harness({ session });
  granted.emit();
  assert.equal(granted.tags.length, 1);
  assert.equal(granted.events().length, 3);
});

test('QA suppression applies to every consent state and does not change consent', () => {
  for (const consent of [null, 'denied', 'granted']) {
    const session = new Map<string, string>();
    const off = harness({ consent, session, search: '?analytics=off' });
    off.emit();
    assert.deepEqual(off.tags, []);
    assert.deepEqual(off.events(), []);
    const on = harness({ consent, session, search: '?analytics=on' });
    on.emit();
    assert.equal(on.tags.length, consent === 'granted' ? 1 : 0);
    assert.equal(on.elements.has('ga-consent-banner'), consent === null);
  }
});

test('session storage failures fail closed for read, opt-out write and opt-in removal', () => {
  for (const [storageError, search] of [
    ['getItem', ''], ['setItem', '?analytics=off'], ['removeItem', '?analytics=on'],
  ] as const) {
    const h = harness({ storageError, search });
    h.emit();
    assert.deepEqual(h.tags, []);
    assert.deepEqual(h.events(), []);
  }
});

test('consent storage errors and missing measurement IDs never load the tag', () => {
  for (const options of [
    { consent: null, consentWriteError: true }, { consentReadError: true },
  ]) {
    const h = harness(options);
    h.handlers.get('ga-consent-accept')!();
    h.emit();
    assert.deepEqual(h.tags, []);
    assert.deepEqual(h.events(), []);
  }
  for (const measurementId of ['', 'G-XXXXXXXXXX']) {
    const h = harness({ measurementId });
    h.emit();
    assert.deepEqual(h.tags, []);
    assert.deepEqual(h.events(), []);
  }
});

test('copy_deck entry_point is optional and allowlisted without forwarding free-form metadata', () => {
  const h = harness();
  for (const entry_point of ['recipe_list', 'recipe_url', 'private name', undefined]) {
    h.context.trackGrowthEvent('copy_deck', {
      content_id: 'recipe-1', card_count: 40, entry_point,
      name: 'private name', url: 'https://private.test/', email: 'private@example.test',
    });
  }
  assert.deepEqual(h.events(), [
    ['copy_deck', { content_id: 'recipe-1', card_count: 40, entry_point: 'recipe_list' }],
    ['copy_deck', { content_id: 'recipe-1', card_count: 40, entry_point: 'recipe_url' }],
    ['copy_deck', { content_id: 'recipe-1', card_count: 40 }],
    ['copy_deck', { content_id: 'recipe-1', card_count: 40 }],
  ]);
});
