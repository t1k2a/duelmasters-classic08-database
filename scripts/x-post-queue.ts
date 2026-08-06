// docs/marketing/x-post-queue.json の先頭にある未投稿分（postedAt: null）を1件だけ自動投稿する。
// GitHub Actions（.github/workflows/x-post.yml）から1日1回呼び出す想定。
//
// 使い方: tsx scripts/x-post-queue.ts
//
// 未投稿分が0件の場合は何もせず正常終了する（キュー切れは異常ではない）。
// 投稿に成功したエントリの postedAt を現在時刻(ISO8601)で更新してファイルに書き戻す
// （呼び出し側のワークフローがこの変更をコミットする想定）。

import { readFileSync, writeFileSync } from "node:fs";
import { postTweet } from "./x-lib.js";

const QUEUE_PATH = new URL("../docs/marketing/x-post-queue.json", import.meta.url);

interface QueueEntry {
  id: string;
  text: string;
  postedAt: string | null;
}

async function main(): Promise<void> {
  const queue: QueueEntry[] = JSON.parse(readFileSync(QUEUE_PATH, "utf-8"));

  const next = queue.find((entry) => entry.postedAt === null);
  if (!next) {
    console.log("未投稿のキューはありません。終了します。");
    return;
  }

  await postTweet(next.text);
  next.postedAt = new Date().toISOString();

  writeFileSync(QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`);
  console.log(`キュー "${next.id}" を投稿し、postedAt を記録しました。`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
