import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import twitterText from 'twitter-text';

const { parseTweet } = twitterText;
const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE_PATH = join(__dirname, '../../docs/marketing/x-post-queue.json');

export interface QueueEntry {
  id: string;
  text: string;
  postedAt: string | null;
}

export interface InvalidEntry {
  id: string;
  length: number;
  text: string;
  errors: string[];
}

export interface VerifyResult {
  total: number;
  valid: number;
  invalid: InvalidEntry[];
}

export function validateQueueEntries(queue: QueueEntry[]): VerifyResult {
  const seenIds = new Set<string>();
  const invalid: InvalidEntry[] = [];

  for (const entry of queue) {
    const errors: string[] = [];
    const entryId = entry?.id;

    if (!entryId || seenIds.has(entryId)) {
      errors.push(!entryId ? 'IDが設定されていません' : `IDが重複しています: "${entryId}"`);
    } else {
      seenIds.add(entryId);
    }

    const text = entry?.text || '';
    if (!text.trim()) {
      errors.push('本文が空です');
    }

    const parsed = parseTweet(text);
    if (!parsed.valid) {
      errors.push(`Xの文字数制限(280重み付き文字)を超過しています (現在: ${parsed.weightedLength}文字)`);
    }

    if (errors.length > 0) {
      invalid.push({
        id: entryId || '(no-id)',
        length: parsed.weightedLength,
        text,
        errors,
      });
    }
  }

  return {
    total: queue.length,
    valid: queue.length - invalid.length,
    invalid,
  };
}

export function verifyXQueue(): VerifyResult {
  const raw = readFileSync(QUEUE_PATH, 'utf-8');
  const queue: QueueEntry[] = JSON.parse(raw);
  return validateQueueEntries(queue);
}

async function main() {
  console.log('=== X Post Queue Verification ===\n');
  const result = verifyXQueue();

  console.log(`  Total posts  : ${result.total}`);
  console.log(`  Valid posts  : ${result.valid}`);
  console.log(`  Invalid posts: ${result.invalid.length}`);

  if (result.invalid.length > 0) {
    console.error(`\n❌ FAILED: ${result.invalid.length} 件の投稿に検証エラーを検出しました:`);
    for (const inv of result.invalid) {
      console.error(`\n[${inv.id}] (${inv.length}/280 chars)`);
      for (const err of inv.errors) {
        console.error(`  - 理由: ${err}`);
      }
      console.error(`  本文:\n${inv.text}`);
    }
    process.exit(1);
  }

  console.log('\n✅ OK: 全ての投稿が検証基準（一意なID・280重み付き文字以内）を満たしています。');
}

if (process.argv[1]?.endsWith('x-queue.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
