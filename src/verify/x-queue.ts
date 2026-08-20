import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import twitterText from 'twitter-text';

const { parseTweet } = twitterText;
const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE_PATH = join(__dirname, '../../docs/marketing/x-post-queue.json');

interface QueueEntry {
  id: string;
  text: string;
  postedAt: string | null;
}

export function verifyXQueue(): { total: number; valid: number; invalid: { id: string; length: number; text: string }[] } {
  const raw = readFileSync(QUEUE_PATH, 'utf-8');
  const queue: QueueEntry[] = JSON.parse(raw);

  const seenIds = new Set<string>();
  const invalid: { id: string; length: number; text: string }[] = [];

  for (const entry of queue) {
    if (!entry.id || seenIds.has(entry.id)) {
      invalid.push({
        id: entry.id || '(no-id)',
        length: 0,
        text: 'ID重複または欠損: ' + entry.id,
      });
    }
    seenIds.add(entry.id);

    const parsed = parseTweet(entry.text || '');
    if (!parsed.valid) {
      invalid.push({
        id: entry.id,
        length: parsed.weightedLength,
        text: entry.text || '',
      });
    }
  }

  return {
    total: queue.length,
    valid: queue.length - invalid.length,
    invalid,
  };
}

async function main() {
  console.log('=== X Post Queue Character Limit Verification ===\n');
  const result = verifyXQueue();

  console.log(`  Total posts  : ${result.total}`);
  console.log(`  Valid posts  : ${result.valid}`);
  console.log(`  Invalid posts: ${result.invalid.length}`);

  if (result.invalid.length > 0) {
    console.error(`\n❌ FAILED: ${result.invalid.length} 件の投稿がXの文字数制限(280文字)を超過しています:`);
    for (const inv of result.invalid) {
      console.error(`\n[${inv.id}] (${inv.length}/280 chars):\n${inv.text}`);
    }
    process.exit(1);
  }

  console.log('\n✅ OK: 全ての投稿がX仕様(280重み付き文字以内)を満たしています。');
}

if (process.argv[1]?.endsWith('x-queue.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
