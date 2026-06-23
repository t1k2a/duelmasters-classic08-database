/**
 * AIチャット 精度スモーク（手動・実Ollama必須 / CI非対象）
 *
 * 前提: 実 Ollama を起動し、チャットサーバを別ターミナルで立ち上げておくこと。
 *   1) ollama serve  &&  ollama pull qwen2.5:7b
 *   2) npm run chat            # localhost:8788
 *
 * 実行: node scripts/chat-smoke.mjs  [--base http://localhost:8788]
 *
 * 何を見るか:
 *   (a) カード事実質問 … 応答の根拠 cards が public/cards.json の実値と一致するか（id/cost/power）
 *   (b) DB外質問       … 「このDBには情報がありません」系の拒否が返るか
 * 数値そのものはLLMに創作させずサーバが構造化返却する設計のため、cards 配列の値で突き合わせる。
 * LLM出力は揺れるので a/b はあくまで簡易assert＋目視確認用（exit codeは参考値）。
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const baseArg = process.argv.indexOf('--base');
const BASE = baseArg >= 0 ? process.argv[baseArg + 1] : 'http://localhost:8788';

const cards = JSON.parse(await readFile(path.join(ROOT, 'public/cards.json'), 'utf-8'));
const byName = new Map(cards.map(c => [c.name, c]));

// SSE(text/event-stream)を fetch+ReadableStream で受信し token連結と最終eventを得る
async function ask(question) {
  const res = await fetch(BASE + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, history: [] }),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', answer = '', final = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      let ev;
      try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (ev.token) answer += ev.token;
      if (ev.done) final = ev;
    }
  }
  return { answer, final };
}

const results = [];
function rec(name, pass, detail) {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'WARN'}  ${name}${detail ? ' :: ' + detail : ''}`);
}

// ---- (a) カード事実: 根拠cardsがDB実値と一致 ----
const GOLDEN_CARDS = [
  'ボルメテウス・ホワイト・ドラゴンの能力は？',
  'ブロッカーって何？',
];

console.log(`[chat-smoke] target=${BASE}\n`);

for (const q of GOLDEN_CARDS) {
  try {
    const { answer, final } = await ask(q);
    console.log(`\nQ: ${q}`);
    console.log(`A: ${answer.replace(/\n/g, ' ').slice(0, 160)}`);
    const cardsBack = final?.cards ?? [];
    if (cardsBack.length === 0) {
      rec(q, q.includes('ブロッカー'), `根拠cards=0（用語質問なら可）`);
      continue;
    }
    // 返ってきた根拠cardsが、cards.json の同名レコードと id/cost/power 一致するか
    let allMatch = true;
    const mismatches = [];
    for (const c of cardsBack) {
      const db = byName.get(c.name);
      if (!db) { allMatch = false; mismatches.push(`${c.name}: DB未存在`); continue; }
      if (c.id !== db.id || c.cost !== db.cost || c.power !== db.power) {
        allMatch = false;
        mismatches.push(`${c.name}: 返却(id=${c.id},cost=${c.cost},power=${c.power}) vs DB(id=${db.id},cost=${db.cost},power=${db.power})`);
      }
    }
    rec(q, allMatch, allMatch ? `根拠cards=${cardsBack.length}件 すべてDB一致` : mismatches.join(' / '));
  } catch (e) {
    rec(q, false, 'EXC: ' + e.message);
  }
}

// ---- (b) DB外質問: 拒否（情報がありません）系を返すか ----
const OUT_OF_SCOPE = [
  '2008年以降の新カードでおすすめある？',
  '令和の最新パックの目玉カードを教えて',
];
const REFUSAL = /情報がありません|分かりません|わかりません|扱っていません|範囲外|ありません/;

for (const q of OUT_OF_SCOPE) {
  try {
    const { answer, final } = await ask(q);
    console.log(`\nQ: ${q}`);
    console.log(`A: ${answer.replace(/\n/g, ' ').slice(0, 160)}`);
    const refused = REFUSAL.test(answer);
    const noCards = (final?.cards ?? []).length === 0;
    rec(q, refused && noCards, `拒否=${refused}, 根拠cards=${(final?.cards ?? []).length}`);
  } catch (e) {
    rec(q, false, 'EXC: ' + e.message);
  }
}

// ---- サマリー（目視前提。WARN は要確認だが即fail扱いにしない） ----
const passed = results.filter(r => r.pass).length;
console.log(`\n===== SMOKE SUMMARY =====`);
console.log(`${passed}/${results.length} expected`);
console.log(`※ LLM出力は揺れます。WARN は目視で内容を確認してください。`);
process.exit(passed === results.length ? 0 : 1);
