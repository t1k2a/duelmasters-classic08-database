import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const sources = ['../../public/index.html', '../../scripts/build-card-pages.ts'];
const names = ['凶戦士ブレイズ・クロー', 'ボルメテウス・ホワイト・ドラゴン', '超神星 ＤＥＡＴＨ・ドラゲリオン', '「祝」の頂 ウェディング', 'A&B + # / ?'];

for (const source of sources) {
  const text = fs.readFileSync(new URL(source, import.meta.url), 'utf8');
  for (const shop of ['suruga', 'ka-nabell', 'mercari']) {
    test(`${source}: ${shop} card search preserves names and uses the official search endpoint`, () => {
      const template = [...text.matchAll(/href="(https:\/\/[^"\n]+)"/g)]
        .map(match => match[1]).find(href => href.includes(shop) && /(?:c|card)\.name/.test(href));
      assert.ok(template);
      for (const name of names) {
        const url: URL = new URL(vm.runInNewContext('`' + template + '`', { c: { name }, card: { name }, encodeURIComponent }));
        assert.equal(url.protocol, 'https:');
        assert.equal(url.hash, '');
        if (shop === 'ka-nabell') {
          assert.equal(url.hostname, 'www.ka-nabell.com');
          assert.equal(url.searchParams.get('act'), 'sell_search');
          assert.equal(url.searchParams.get('genre'), '7');
          assert.equal(url.searchParams.get('type'), '2');
          assert.equal(url.searchParams.get('key_word'), name);
          assert.equal(url.searchParams.has('word'), false);
        } else {
          assert.equal(url.hostname, shop === 'suruga' ? 'www.suruga-ya.jp' : 'jp.mercari.com');
          assert.equal(url.pathname, '/search');
          assert.equal(url.searchParams.get(shop === 'suruga' ? 'search_word' : 'keyword'), 'デュエルマスターズ ' + name);
          if (shop === 'suruga') assert.equal(url.searchParams.get('category'), '');
        }
      }
    });
  }
}
