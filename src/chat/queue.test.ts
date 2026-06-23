// src/chat/queue.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SingleFlightQueue, RateLimiter } from './queue.js'

test('直列化: 同時実行は1件、超過待ちはBUSY', async () => {
  const q = new SingleFlightQueue(1)
  let release: () => void
  const p1 = q.run(() => new Promise<void>(r => { release = r }))
  const p2 = q.run(async () => {}) // 待ち1
  await assert.rejects(q.run(async () => {}), /BUSY/) // 待ち上限超過
  release!(); await p1; await p2
})

test('レート制限: perMin超でfalse', () => {
  const rl = new RateLimiter(2)
  assert.equal(rl.allow('a', 0), true)
  assert.equal(rl.allow('a', 0), true)
  assert.equal(rl.allow('a', 0), false)
})
