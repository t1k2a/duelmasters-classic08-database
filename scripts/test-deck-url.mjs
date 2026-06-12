// デッキ共有URLの圧縮形式 ?d= のラウンドトリップテスト。
// public/index.html 内の encode/decode ロジックと同一の実装で、
// recipes.json 全件 cards配列 → encode → decode → 元と一致 を検証する。
//
//   node scripts/test-deck-url.mjs
//
// jq は使わない。標準の node のみで完結する。
import fs from 'node:fs';

const cards = JSON.parse(fs.readFileSync('public/cards.json', 'utf8'));
const recipes = JSON.parse(fs.readFileSync('public/data/recipes.json', 'utf8'));
const CARD_IDS = new Set(cards.map(c => c.id));

// --- public/index.html と同一ロジック ---

function encodeCardId(id) {
  const m = /^dm(\d+)-(s?)(\d+)$/.exec(id);
  if (!m) return null;
  const set = String(parseInt(m[1], 10));
  const num = m[2] + String(parseInt(m[3], 10));
  return `${set}-${num}`;
}

function decodeCardToken(token) {
  const m = /^(\d+)-(s?)(\d+)$/.exec(token);
  if (!m) return null;
  const set = m[1].padStart(2, '0');
  const num = m[2] ? 's' + m[3].padStart(2, '0') : m[3].padStart(3, '0');
  return `dm${set}-${num}`;
}

function encodeDeck(deckEntries) {
  return deckEntries
    .map(e => {
      const tok = encodeCardId(e.id);
      if (!tok) return null;
      const count = e.count | 0;
      return count > 1 ? `${tok}x${count}` : tok;
    })
    .filter(Boolean)
    .join('.');
}

function decodeDeck(str) {
  return str
    .split('.')
    .map(part => {
      const m = /^(.+?)(?:x(\d+))?$/.exec(part);
      if (!m) return null;
      const id = decodeCardToken(m[1]);
      if (!id || !CARD_IDS.has(id)) return null;
      const count = m[2] ? parseInt(m[2], 10) : 1;
      return { id, count };
    })
    .filter(Boolean);
}

// --- テスト ---

let passed = 0;
const failures = [];

for (const r of recipes) {
  const original = (r.cards || []).map(c => ({ id: c.id, count: c.count | 0 }));
  // cards.json に無いIDは encode/decode 両方で落ちるため、期待値も同じ基準で揃える。
  const expected = original.filter(e => CARD_IDS.has(e.id));
  const roundtrip = decodeDeck(encodeDeck(original));

  const eq =
    roundtrip.length === expected.length &&
    expected.every((e, i) => roundtrip[i].id === e.id && roundtrip[i].count === e.count);

  if (eq) {
    passed++;
  } else {
    failures.push({
      recipe: r.id || r.name,
      encoded: encodeDeck(original),
      expectedLen: expected.length,
      gotLen: roundtrip.length,
      diff: expected
        .map((e, i) => {
          const g = roundtrip[i];
          return g && g.id === e.id && g.count === e.count
            ? null
            : `idx${i}: expected ${e.id}x${e.count}, got ${g ? g.id + 'x' + g.count : 'undefined'}`;
        })
        .filter(Boolean)
        .slice(0, 5),
    });
  }
}

// 追加: 形態別の単体ケース（s番号・count>1・桁境界）
const unit = [
  { id: 'dm06-s08', count: 1, tok: '6-s8' },
  { id: 'dm29-037', count: 2, tok: '29-37x2' },
  { id: 'dm01-052', count: 1, tok: '1-52' },
  { id: 'dm01-100', count: 4, tok: '1-100x4' },
  { id: 'dm01-s01', count: 3, tok: '1-s1x3' },
];
const unitFail = [];
for (const u of unit) {
  const enc = encodeDeck([{ id: u.id, count: u.count }]);
  const dec = decodeDeck(enc);
  const ok = enc === u.tok && dec.length === 1 && dec[0].id === u.id && dec[0].count === u.count;
  if (!ok) unitFail.push({ ...u, enc, dec });
}

// 不正トークンの無視
const bogus = decodeDeck('99-999.6-s8.garbage.7-x2');
const bogusOk = bogus.length === 1 && bogus[0].id === 'dm06-s08';

console.log(`recipes roundtrip: ${passed}/${recipes.length} passed`);
console.log(`unit tokens: ${unit.length - unitFail.length}/${unit.length} passed`);
console.log(`bogus-token skip: ${bogusOk ? 'OK' : 'FAIL'} (kept ${bogus.length}, expected dm06-s08 only)`);

if (failures.length) {
  console.log('\n--- recipe failures ---');
  for (const f of failures.slice(0, 10)) console.log(JSON.stringify(f, null, 2));
}
if (unitFail.length) {
  console.log('\n--- unit failures ---');
  for (const f of unitFail) console.log(JSON.stringify(f));
}

// サイズ比較（参考）: 最大デッキで旧base64と新形式の文字数を出す。
let sample = recipes.reduce((a, b) => ((b.cards || []).length > (a.cards || []).length ? b : a));
const oldUrl = Buffer.from(
  JSON.stringify((sample.cards || []).map(e => ({ id: e.id, count: e.count }))),
  'utf8'
).toString('base64');
const newUrl = encodeDeck((sample.cards || []).map(e => ({ id: e.id, count: e.count })));
console.log(
  `\nsize (recipe ${sample.id}, ${(sample.cards || []).length} entries): old ?deck= ${oldUrl.length} chars -> new ?d= ${newUrl.length} chars`
);

const allOk = passed === recipes.length && unitFail.length === 0 && bogusOk;
process.exit(allOk ? 0 : 1);
