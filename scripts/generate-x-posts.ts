import fs from 'fs';
import path from 'path';

// scripts/generate-x-posts.ts
// カードデータおよびメタデッキから魅力的なX投稿ストックを自動生成し、x-post-queue.json に補充する。

const ROOT = process.cwd();
const CARDS_PATH = path.join(ROOT, 'public/cards.json');
const QUEUE_PATH = path.join(ROOT, 'docs/marketing/x-post-queue.json');

interface QueueEntry {
  id: string;
  text: string;
  postedAt: string | null;
}

const cards = JSON.parse(fs.readFileSync(CARDS_PATH, 'utf-8'));

let queue: QueueEntry[] = [];
try {
  queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8'));
} catch {
  queue = [];
}

const keyCards = [
  'ボルメテウス・ホワイト・ドラゴン',
  'ヘブンズ・ゲート',
  'アクア・ハルカス',
  'デーモン・ハンド',
  '青銅の鎧',
  '地獄スクラッパー',
  'アクア・サーファー',
  '母なる大地',
  '邪眼皇ロマノフI世',
  '聖鎧亜キング・アルカディアス',
  '斬隠蒼頭龍バイケン',
  '光輪の精霊 ピカリエ',
];

const newPosts: QueueEntry[] = [];

for (const cardName of keyCards) {
  const card = cards.find((c: any) => c.name === cardName);
  if (!card) continue;

  const postId = `post-card-${card.id}`;
  if (queue.some(p => p.id === postId)) continue;

  const civStr = card.civilizations.join('');
  const text = `【今日のクラシック08カード】
《${card.name}》
文明: ${civStr} / コスト: ${card.cost ?? '—'} / パワー: ${card.power ?? '—'}

${(card.text ?? '').slice(0, 70)}...

カード検索 & デッキ構築はこちら👇
https://t1k2a.github.io/duelmasters-classic08-database/
#デュエマクラシック #デュエマクラシック08 #デュエマ`;

  newPosts.push({
    id: postId,
    text,
    postedAt: null,
  });
}

if (newPosts.length > 0) {
  queue = [...queue, ...newPosts];
  fs.writeFileSync(QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`, 'utf-8');
  console.log(`Added ${newPosts.length} new posts to X post queue.`);
} else {
  console.log('X post queue is already well-stocked.');
}
