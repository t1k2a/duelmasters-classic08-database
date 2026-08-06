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

  // 既知の限界: postTweet 成功後に writeFileSync/git push が失敗すると、
  // 次回実行時に同じ項目が再投稿される可能性がある（投稿IDの記録・照合による
  // 完全な冪等性は未実装）。1日1件という低頻度の運用規模に対しては、
  // push失敗がジョブの可視的な失敗として現れる（サイレントに握りつぶさない）ことで
  // 実用上十分と判断し、フル対応は見送っている。
  await postTweet(next.text);
  next.postedAt = new Date().toISOString();

  writeFileSync(QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`);
  console.log(`キュー "${next.id}" を投稿し、postedAt を記録しました。`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
