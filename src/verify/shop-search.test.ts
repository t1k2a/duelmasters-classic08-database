import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const script = fs.readFileSync(new URL('../../public/js/shop-links.js', import.meta.url), 'utf8');
function harness() {
  const context = vm.createContext({ window: {}, document: { querySelectorAll: () => [] } });
  vm.runInContext(script, context);
  return context.window.ShopLinks;
}
test('shared runtime encodes Japanese, whitespace and special characters', () => {
  const api = harness();
  for (const name of ['凶戦士ブレイズ・クロー', '超神星 ＤＥＡＴＨ・ドラゲリオン', `「祝」 A&B + # / ? " ' <script>`]) {
    for (const [shop, host, key] of [['surugaya', 'www.suruga-ya.jp', 'search_word'], ['ka-nabell', 'www.ka-nabell.com', 'key_word'], ['mercari', 'jp.mercari.com', 'keyword']]) {
      const url = new URL(api.searchUrl(shop, name));
      assert.equal(url.protocol, 'https:'); assert.equal(url.hostname, host); assert.equal(url.hash, '');
      assert.equal(url.searchParams.get(key), shop === 'ka-nabell' ? name : 'デュエルマスターズ ' + name);
      if (shop === 'ka-nabell') {
        assert.equal(url.searchParams.get('act'), 'sell_search');
        assert.equal(url.searchParams.get('genre'), '7'); assert.equal(url.searchParams.get('type'), '2');
      }
    }
  }
  assert.equal(api.searchUrl('unknown', 'card'), null);
});
test('links refresh after SPA redraw without changing analytics or safe-link attributes', () => {
  const api = harness();
  const link = { dataset: { shop: 'mercari', shopQuery: '最初' }, href: '', target: '_blank', rel: 'noopener noreferrer', onclick: 'existing analytics' };
  const root = { querySelectorAll: () => [link] };
  api.apply(root);
  assert.equal(new URL(link.href).searchParams.get('keyword'), 'デュエルマスターズ 最初');
  link.dataset.shopQuery = '変更後 & #'; api.apply(root);
  assert.equal(new URL(link.href).searchParams.get('keyword'), 'デュエルマスターズ 変更後 & #');
  assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener noreferrer'); assert.equal(link.onclick, 'existing analytics');
});
test('HTML templates have stable runtime references without shop search endpoints', () => {
  for (const path of ['../../public/index.html', '../../scripts/build-card-pages.ts']) {
    const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /js\/shop-links\.js/);
    assert.doesNotMatch(source, /https:\/\/(?:www\.suruga-ya\.jp\/search|jp\.mercari\.com\/search|www\.ka-nabell\.com\/\?act=sell_search)/);
    assert.match(source, /data-shop-query=/);
  }
});
