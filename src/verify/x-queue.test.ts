import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQueueEntries, verifyXQueue, QueueEntry } from './x-queue.js';

test('verifyXQueue: docs/marketing/x-post-queue.json の全エントリが検証をパスすること', () => {
  const result = verifyXQueue();
  assert.ok(result.total > 0, 'キューにエントリが存在すること');
  assert.equal(result.invalid.length, 0, `不正なエントリが存在します: ${JSON.stringify(result.invalid)}`);
  assert.equal(result.valid, result.total, '全エントリが有効であること');
});

test('validateQueueEntries: 正常なエントリのみの場合はすべて valid になること', () => {
  const sample: QueueEntry[] = [
    { id: 'post-1', text: 'テスト投稿1 #デュエマ', postedAt: null },
    { id: 'post-2', text: 'テスト投稿2 #デュエマ', postedAt: null },
  ];
  const result = validateQueueEntries(sample);
  assert.equal(result.total, 2);
  assert.equal(result.valid, 2);
  assert.equal(result.invalid.length, 0);
});

test('validateQueueEntries: ID重複と文字数超過が同時に起きても1エントリとして集計されること', () => {
  const sample: QueueEntry[] = [
    { id: 'dup-id', text: '正常な投稿', postedAt: null },
    // ID重複 かつ 280文字超過（あ を 150文字 = 300重み付き文字）
    { id: 'dup-id', text: 'あ'.repeat(150), postedAt: null },
  ];
  const result = validateQueueEntries(sample);
  assert.equal(result.total, 2);
  assert.equal(result.valid, 1);
  assert.equal(result.invalid.length, 1);
  assert.equal(result.invalid[0].id, 'dup-id');
  assert.equal(result.invalid[0].errors.length, 2);
  assert.match(result.invalid[0].errors[0], /IDが重複/);
  assert.match(result.invalid[0].errors[1], /280重み付き文字/);
});

test('validateQueueEntries: ID欠損・空本文のエントリを適切に検出すること', () => {
  const sample: QueueEntry[] = [
    { id: '', text: '', postedAt: null },
  ];
  const result = validateQueueEntries(sample);
  assert.equal(result.total, 1);
  assert.equal(result.valid, 0);
  assert.equal(result.invalid.length, 1);
  assert.ok(result.invalid[0].errors.some(e => e.includes('IDが設定されていません')));
  assert.ok(result.invalid[0].errors.some(e => e.includes('本文が空です')));
});
